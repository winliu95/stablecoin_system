use anchor_lang::prelude::*;
use crate::state::*;

#[derive(Accounts)]
pub struct TogglePause<'info> {
    #[account(
        mut,
        seeds = [b"global_state"],
        bump = global_state.bump,
        has_one = admin,
    )]
    pub global_state: Account<'info, GlobalState>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct ToggleFreeze<'info> {
    #[account(
        mut,
        seeds = [b"global_state"],
        bump = global_state.bump,
        has_one = admin,
    )]
    pub global_state: Account<'info, GlobalState>,
    
    #[account(
        mut,
        // The position to freeze
    )]
    pub position: Account<'info, Position>,
    
    pub admin: Signer<'info>,
}

pub fn handler_pause(ctx: Context<TogglePause>, paused: bool) -> Result<()> {
    let global_state = &mut ctx.accounts.global_state;
    global_state.paused = paused;
    msg!("System Pause State: {}", paused);
    Ok(())
}

pub fn handler_freeze(ctx: Context<ToggleFreeze>, frozen: bool) -> Result<()> {
    let position = &mut ctx.accounts.position;
    position.is_frozen = frozen;
    msg!("Position Frozen State: {}", frozen);
    Ok(())
}
