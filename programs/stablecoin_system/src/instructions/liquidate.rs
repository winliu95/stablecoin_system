use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Burn, Mint};
use crate::state::*;
use crate::utils::get_price;

#[derive(Accounts)]
pub struct Liquidate<'info> {
    #[account(mut)]
    pub liquidator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"position", position_owner.key().as_ref(), collateral_mint.key().as_ref()],
        bump = position.bump,
        has_one = collateral_mint,
    )]
    pub position: Account<'info, Position>,

    
    /// CHECK: The owner of the position being liquidated
    #[account()]
    pub position_owner: AccountInfo<'info>,

    #[account(
        seeds = [b"collateral", collateral_mint.key().as_ref()],
        bump = collateral_config.bump,
    )]
    pub collateral_config: Account<'info, CollateralConfig>,

    /// CHECK: Validated against config
    #[account(address = collateral_config.oracle)]
    pub oracle: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"mint"],
        bump,
    )]
    pub usdt_mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = usdt_mint,
        associated_token::authority = liquidator,
    )]
    pub liquidator_usdt_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = liquidator,
    )]
    pub liquidator_collateral_account: Account<'info, TokenAccount>,

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

    pub collateral_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,

    #[account(
        seeds = [b"global_state"],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,
}

pub fn handler(ctx: Context<Liquidate>, amount_to_repay: u64) -> Result<()> {
    // 0. Governance Checks
    let global_state = &ctx.accounts.global_state;
    if global_state.paused {
        return err!(CustomErrorCode::Paused);
    }

    let position = &mut ctx.accounts.position;
    
    // 1. Check Solvency (Current CR < MCR ?)
    let price = get_price(&ctx.accounts.oracle)?; // e.g. 150*10^6
    
    let collateral_val = (position.collateral_amount as u128)
        .checked_mul(price as u128).unwrap()
        .checked_div(10u128.pow(ctx.accounts.collateral_mint.decimals as u32)).unwrap() as u64;
    
    let mcr_percent = ctx.accounts.collateral_config.mcr;
    let required_collateral_value = (position.debt_amount as u128)
        .checked_mul(mcr_percent as u128).unwrap()
        .checked_div(100).unwrap();
        
    // If Position is SAFE, revert
    if (collateral_val as u128) >= required_collateral_value {
        return err!(CustomErrorCode::PositionSafe);
    }
    
    // 2. Burn Liquidator's USDT
    let repay_amount = if amount_to_repay > position.debt_amount {
        position.debt_amount // Cap at full debt
    } else {
        amount_to_repay
    };

    let cpi_accounts = Burn {
        mint: ctx.accounts.usdt_mint.to_account_info(),
        from: ctx.accounts.liquidator_usdt_account.to_account_info(),
        authority: ctx.accounts.liquidator.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::burn(cpi_ctx, repay_amount)?;

    // 3. Calculate Collateral to Seize with Penalty
    // Seize Value = Repay Value * (1 + Penalty)
    // Repay Value in USD (repay_amount is USDT units, assuming 1 USDT ~ 1 USD if maintained)
    // We treat 1 USDT as worth 1 USD for payout calc usually.
    // Penalty is percentage, e.g. 10 (10%).
    
    let penalty = ctx.accounts.collateral_config.liquidation_penalty;
    let total_value_to_seize = (repay_amount as u128)
        .checked_mul(100 + penalty as u128).unwrap()
        .checked_div(100).unwrap();
        
    // Convert Value back to Collateral Units
    // Amount = Value * 10^Decimals / Price
    let collateral_to_seize = total_value_to_seize
        .checked_mul(10u128.pow(ctx.accounts.collateral_mint.decimals as u32)).unwrap()
        .checked_div(price as u128).unwrap() as u64;

    // 4. Update Position
    position.debt_amount = position.debt_amount.checked_sub(repay_amount).unwrap();
    
    // Check if we have enough collateral
    let actual_seize_amount = if collateral_to_seize > position.collateral_amount {
        position.collateral_amount // Take everything if not enough (Bad Debt scenario)
    } else {
        collateral_to_seize
    };
    
    position.collateral_amount = position.collateral_amount.checked_sub(actual_seize_amount).unwrap();
    position.last_updated = Clock::get()?.unix_timestamp;

    // 5. Transfer Collateral
    let seeds = &[b"vault_authority".as_ref(), &[ctx.bumps.vault_authority]];
    let signer = &[&seeds[..]];

    let cpi_accounts_transfer = Transfer {
        from: ctx.accounts.vault_token_account.to_account_info(),
        to: ctx.accounts.liquidator_collateral_account.to_account_info(),
        authority: ctx.accounts.vault_authority.to_account_info(),
    };
    let cpi_ctx_transfer = CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts_transfer, signer);
    token::transfer(cpi_ctx_transfer, actual_seize_amount)?;

    msg!("Liquidated {} debt. Seized {} collateral.", repay_amount, actual_seize_amount);
    Ok(())
}


