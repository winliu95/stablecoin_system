use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, MintTo};
use crate::state::*;
use crate::utils::get_price;

#[derive(Accounts)]
pub struct MintUsdt<'info> {
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
        seeds = [b"mint"],
        bump,
    )]
    pub usdt_mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = usdt_mint,
        associated_token::authority = owner,
    )]
    pub user_usdt_account: Account<'info, TokenAccount>,
    
    pub collateral_mint: Account<'info, Mint>,
    
    #[account(
        seeds = [b"global_state"],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<MintUsdt>, amount_to_mint: u64) -> Result<()> {
    // 0. Governance Checks
    let global_state = &ctx.accounts.global_state;
    if global_state.paused {
        return err!(CustomErrorCode::Paused);
    }
    
    let position = &mut ctx.accounts.position;
    if position.is_frozen {
        return err!(CustomErrorCode::Frozen);
    }

    // 1. Get Price
    let price = get_price(&ctx.accounts.oracle)?; // e.g. 150*10^6
    
    // 2. Calculate Collateral Value
    // Collateral Amount (e.g. 9 decimals for SOL) -> convert to unified value
    // Price has 6 decimals? Let's assume price is in USD with 6 decimals.
    // Value = (CollateralAmount * Price) / 10^CollateralDecimals
    // Let's assume standard math here. Note: Overflow checks needed.
    // For simplicity: Value (USD 6 decimals) = Collateral (Native) * Price (USD per Native) / 10^NativeDecimals
    
    let position = &mut ctx.accounts.position;
    let collateral_val = (position.collateral_amount as u128)
        .checked_mul(price as u128).unwrap()
        .checked_div(10u128.pow(ctx.accounts.collateral_mint.decimals as u32)).unwrap() as u64;
        
    // 3. New Debt
    let new_debt = position.debt_amount.checked_add(amount_to_mint).unwrap();
    
    // 4. Check Context Ratio
    // CR = Collateral Value / Debt Value * 100 >= MCR
    // MCR is likely defined as 150 (for 150%).
    
    let mcr_percent = ctx.accounts.collateral_config.mcr; // e.g. 150
    let required_collateral_value = (new_debt as u128)
        .checked_mul(mcr_percent as u128).unwrap()
        .checked_div(100).unwrap();
        
    if (collateral_val as u128) < required_collateral_value {
        return err!(CustomErrorCode::BelowMcr);
    }
    
    // 5. Mint
    let seeds = &[b"global_state".as_ref(), &[ctx.accounts.global_state.bump]];
    let signer = &[&seeds[..]];

    let cpi_accounts = MintTo {
        mint: ctx.accounts.usdt_mint.to_account_info(),
        to: ctx.accounts.user_usdt_account.to_account_info(),
        authority: ctx.accounts.global_state.to_account_info(), // GlobalState is authoirty
    };

    let cpi_program = ctx.accounts.token_program.to_account_info();
    // Note: The authority is global_state account which is a PDA.
    // Wait, in initialize, I set authority to global_state.
    
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
    token::mint_to(cpi_ctx, amount_to_mint)?;

    // 6. Update Position
    position.debt_amount = new_debt;
    position.last_updated = Clock::get()?.unix_timestamp;
    
    // 7. Update Global Supply
    // Note: Tracking global supply in GlobalState is optional if Mint tracks it.
    
    msg!("Minted {} USDT. New Debt: {}", amount_to_mint, new_debt);
    Ok(())
}


