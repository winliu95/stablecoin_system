use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::*;
use crate::utils::get_price;

#[derive(Accounts)]
pub struct WithdrawCollateral<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"position", owner.key().as_ref(), collateral_mint.key().as_ref()],
        bump = position.bump,
        has_one = collateral_mint,
        has_one = owner,
    )]
    pub position: Account<'info, Position>,

    #[account(
        seeds = [b"collateral", collateral_mint.key().as_ref()],
        bump = collateral_config.bump,
    )]
    pub collateral_config: Account<'info, CollateralConfig>,

    /// CHECK: Validated against config
    #[account(
        address = collateral_config.oracle
    )]
    pub oracle: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"vault", collateral_mint.key().as_ref()],
        bump,
        token::mint = collateral_mint,
        token::authority = vault_authority,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// CHECK: Vault authority PDA
    #[account(seeds = [b"vault_authority"], bump)]
    pub vault_authority: AccountInfo<'info>,

    pub collateral_mint: Account<'info, token::Mint>,

    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = owner,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<WithdrawCollateral>, amount: u64) -> Result<()> {
    let position = &mut ctx.accounts.position;

    // 1. Calculate New Collateral Amount
    let new_collateral_amount = position.collateral_amount.checked_sub(amount).ok_or(ErrorCode::InsufficientCollateral)?;

    // 2. Check Solvency if Debt > 0
    if position.debt_amount > 0 {
        let price = get_price(&ctx.accounts.oracle)?; // e.g. 150*10^6
        
        let collateral_val = (new_collateral_amount as u128)
            .checked_mul(price as u128).unwrap()
            .checked_div(10u128.pow(ctx.accounts.collateral_mint.decimals as u32)).unwrap() as u64;
            
        let mcr_percent = ctx.accounts.collateral_config.mcr;
        let required_collateral_value = (position.debt_amount as u128)
            .checked_mul(mcr_percent as u128).unwrap()
            .checked_div(100).unwrap();
            
        if (collateral_val as u128) < required_collateral_value {
            return err!(ErrorCode::BelowMCR);
        }
    }

    // 3. Update Position
    position.collateral_amount = new_collateral_amount;
    position.last_updated = Clock::get()?.unix_timestamp;

    // 4. Transfer Tokens
    let seeds = &[b"vault_authority".as_ref(), &[ctx.bumps.vault_authority]];
    let signer = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.vault_token_account.to_account_info(),
        to: ctx.accounts.user_token_account.to_account_info(),
        authority: ctx.accounts.vault_authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
    token::transfer(cpi_ctx, amount)?;

    msg!("Withdrew {} collateral. New Balance: {}", amount, position.collateral_amount);
    Ok(())
}

#[error_code]
pub enum ErrorCode {
    #[msg("Insufficient collateral to withdraw")]
    InsufficientCollateral,
    #[msg("Withdrawal would put position below MCR")]
    BelowMCR,
}
