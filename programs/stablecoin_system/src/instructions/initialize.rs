use anchor_lang::prelude::*;
use anchor_spl::token;
use crate::state::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init, 
        payer = admin, 
        seeds = [b"global_state"],
        bump, 
        space = GlobalState::LEN
    )]
    pub global_state: Account<'info, GlobalState>,

    #[account(
        init,
        payer = admin,
        seeds = [b"mint"],
        bump,
        mint::decimals = 6,
        mint::authority = global_state,
    )]
    pub usdt_mint: Account<'info, token::Mint>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
    
    pub token_program: Program<'info, token::Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Initialize>) -> Result<()> {
    let global_state = &mut ctx.accounts.global_state;
    global_state.admin = ctx.accounts.admin.key();
    global_state.usdt_mint = ctx.accounts.usdt_mint.key();
    global_state.total_supply = 0;
    global_state.paused = false;
    global_state.bump = ctx.bumps.global_state;
    
    msg!("Global State Initialized. Admin: {}, Mint: {}", global_state.admin, global_state.usdt_mint);
    Ok(())
}

