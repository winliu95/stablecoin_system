use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Burn};
use crate::state::*;

#[derive(Accounts)]
pub struct BurnUsdt<'info> {
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
        mut,
        seeds = [b"mint"],
        bump,
    )]
    pub usdt_mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = usdt_mint,
        associated_token::authority = owner,
    )]
    pub user_usdt_account: Account<'info, TokenAccount>,
    
    pub collateral_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,

    #[account(
        seeds = [b"global_state"],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,
}

pub fn handler(ctx: Context<BurnUsdt>, amount: u64) -> Result<()> {
    // 0. Governance Checks
    let global_state = &ctx.accounts.global_state;
    if global_state.paused {
        return err!(CustomErrorCode::Paused);
    }
    
    let position = &mut ctx.accounts.position;
    if position.is_frozen {
        return err!(CustomErrorCode::Frozen);
    }

    // 1. Burn Tokens
    let cpi_accounts = Burn {
        mint: ctx.accounts.usdt_mint.to_account_info(),
        from: ctx.accounts.user_usdt_account.to_account_info(),
        authority: ctx.accounts.owner.to_account_info(),
    };

    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::burn(cpi_ctx, amount)?;

    // 2. Update Position
    let position = &mut ctx.accounts.position;
    
    // Ensure we don't underflow (though burn ensures user has tokens, checking debt is good practice)
    // In some designs, user might hold stablecoin from elsewhere, but here we just reduce debt up to amount burned.
    // However, usually you can't reduce debt below 0.
    
    if amount > position.debt_amount {
        position.debt_amount = 0;
        // The excess burn is a donation to the protocol or just lost.
    } else {
        position.debt_amount = position.debt_amount.checked_sub(amount).unwrap();
    }
    
    position.last_updated = Clock::get()?.unix_timestamp;

    msg!("Burned {} USDT. New Debt: {}", amount, position.debt_amount);
    Ok(())
}
