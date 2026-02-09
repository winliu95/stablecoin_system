use anchor_lang::prelude::*;
use crate::state::*;

#[derive(Accounts)]
#[instruction(collateral_mint: Pubkey)]
pub struct ConfigureCollateral<'info> {
    #[account(
        init_if_needed,
        payer = admin,
        seeds = [b"collateral", collateral_mint.key().as_ref()],
        bump,
        space = CollateralConfig::LEN
    )]
    pub collateral_config: Account<'info, CollateralConfig>,

    #[account(
        has_one = admin,
        seeds = [b"global_state"],
        bump = global_state.bump
    )]
    pub global_state: Account<'info, GlobalState>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<ConfigureCollateral>,
    collateral_mint: Pubkey,
    oracle: Pubkey,
    mcr: u64,
    ltr: u64,
    liquidation_penalty: u64,
) -> Result<()> {
    let config = &mut ctx.accounts.collateral_config;
    config.collateral_mint = collateral_mint;
    config.oracle = oracle;
    config.mcr = mcr;
    config.ltr = ltr;
    config.liquidation_penalty = liquidation_penalty;
    config.bump = ctx.bumps.collateral_config;

    msg!("Collateral Configured. Mint: {}, MCR: {}", collateral_mint, mcr);
    Ok(())
}
