use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;

#[derive(Accounts)]
pub struct DepositCollateral<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"collateral", collateral_mint.key().as_ref()],
        bump = collateral_config.bump,
    )]
    pub collateral_config: Account<'info, CollateralConfig>,

    pub collateral_mint: Account<'info, token::Mint>,

    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = user,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = user,
        seeds = [b"vault", collateral_mint.key().as_ref()],
        bump,
        token::mint = collateral_mint,
        token::authority = vault_authority,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// CHECK: This is the PDA authority for the vault
    #[account(seeds = [b"vault_authority"], bump)]
    pub vault_authority: AccountInfo<'info>,

    #[account(
        init_if_needed,
        payer = user,
        seeds = [b"position", user.key().as_ref(), collateral_mint.key().as_ref()],
        bump,
        space = Position::LEN
    )]
    pub position: Account<'info, Position>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    
    #[account(
        seeds = [b"global_state"],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,
}

pub fn handler(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
    // 0. Governance Checks
    let global_state = &ctx.accounts.global_state;
    if global_state.paused {
        return err!(CustomErrorCode::Paused);
    }
    
    let position = &mut ctx.accounts.position;
    if position.is_frozen {
        return err!(CustomErrorCode::Frozen);
    }
    // 1. Transfer tokens from user to vault
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.vault_token_account.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, amount)?;

    // 2. Update Position
    // let position = &mut ctx.accounts.position; // Already borrowed mutably above
    if position.owner == Pubkey::default() {
        position.owner = ctx.accounts.user.key();
        position.collateral_mint = ctx.accounts.collateral_mint.key();
        position.bump = ctx.bumps.position;
    }
    
    position.collateral_amount = position.collateral_amount.checked_add(amount).unwrap();
    position.last_updated = Clock::get()?.unix_timestamp;

    msg!("Deposited {} collateral. New Balance: {}", amount, position.collateral_amount);
    Ok(())
}
