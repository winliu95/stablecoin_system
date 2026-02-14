use anchor_lang::prelude::*;

declare_id!("5YNSWuk2aqtejuBhz8Tv1xEbxE8rh3BbsPDFzk25LpYw");

pub mod state;
pub mod utils;


use anchor_lang::prelude::*;
use state::*;

pub mod instructions;

use anchor_lang::prelude::*;
use instructions::initialize::*;
use instructions::configure_collateral::*;
use instructions::deposit_collateral::*;
use instructions::mint_usdt::*;
use instructions::burn_usdt::*;
use instructions::withdraw_collateral::*;
use instructions::withdraw_collateral::*;
use instructions::liquidate::*;
use instructions::liquidate::*;
use instructions::governance::*;
use instructions::psm::*;
use state::*;


#[program]
pub mod stablecoin_system {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize::handler(ctx)
    }

    pub fn configure_collateral(
        ctx: Context<ConfigureCollateral>,
        collateral_mint: Pubkey,
        oracle: Pubkey,
        mcr: u64,
        ltr: u64,
        liquidation_penalty: u64,
    ) -> Result<()> {
        instructions::configure_collateral::handler(
            ctx,
            collateral_mint,
            oracle,
            mcr,
            ltr,
            liquidation_penalty,
        )
    }

    pub fn deposit_collateral(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
        instructions::deposit_collateral::handler(ctx, amount)
    }

    pub fn mint_usdt(ctx: Context<MintUsdt>, amount: u64) -> Result<()> {
        instructions::mint_usdt::handler(ctx, amount)
    }

    pub fn burn_usdt(ctx: Context<BurnUsdt>, amount: u64) -> Result<()> {
        instructions::burn_usdt::handler(ctx, amount)
    }

    pub fn withdraw_collateral(ctx: Context<WithdrawCollateral>, amount: u64) -> Result<()> {
        instructions::withdraw_collateral::handler(ctx, amount)
    }

    pub fn liquidate(ctx: Context<Liquidate>, amount_to_repay: u64) -> Result<()> {
        instructions::liquidate::handler(ctx, amount_to_repay)
    }

    pub fn toggle_pause(ctx: Context<TogglePause>, paused: bool) -> Result<()> {
        instructions::governance::handler_pause(ctx, paused)
    }

    pub fn toggle_freeze(ctx: Context<ToggleFreeze>, frozen: bool) -> Result<()> {
        instructions::governance::handler_freeze(ctx, frozen)
    }

    pub fn configure_psm(ctx: Context<ConfigurePsm>, fee_bps: u64) -> Result<()> {
        instructions::psm::handler_configure(ctx, fee_bps)
    }

    pub fn swap_usdc_to_usdt(ctx: Context<SwapUsdcToUsdt>, amount: u64) -> Result<()> {
        instructions::psm::handler_swap_to_usdt(ctx, amount)
    }

    pub fn swap_usdt_to_usdc(ctx: Context<SwapUsdtToUsdc>, amount: u64) -> Result<()> {
        instructions::psm::handler_swap_to_usdc(ctx, amount)
    }






}



