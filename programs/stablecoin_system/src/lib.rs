use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer, MintTo, Burn};
use crate::state::*;
use crate::utils::get_price;

declare_id!("5YNSWuk2aqtejuBhz8Tv1xEbxE8rh3BbsPDFzk25LpYw");

pub mod state;
pub mod utils;

// --- Initialize ---
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

pub fn initialize_handler(ctx: Context<Initialize>) -> Result<()> {
    let global_state = &mut ctx.accounts.global_state;
    global_state.admin = ctx.accounts.admin.key();
    global_state.usdt_mint = ctx.accounts.usdt_mint.key();
    global_state.total_supply = 0;
    global_state.paused = false;
    global_state.bump = ctx.bumps.global_state;
    msg!("Global State Initialized. Admin: {}, Mint: {}", global_state.admin, global_state.usdt_mint);
    Ok(())
}

// --- Configure Collateral ---
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

pub fn configure_collateral_handler(
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

// --- Deposit Collateral ---
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

pub fn deposit_collateral_handler(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
    if ctx.accounts.global_state.paused { return err!(CustomErrorCode::Paused); }
    let position = &mut ctx.accounts.position;
    if position.is_frozen { return err!(CustomErrorCode::Frozen); }
    
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.vault_token_account.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    token::transfer(CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts), amount)?;

    if position.owner == Pubkey::default() {
        position.owner = ctx.accounts.user.key();
        position.collateral_mint = ctx.accounts.collateral_mint.key();
        position.bump = ctx.bumps.position;
    }
    position.collateral_amount = position.collateral_amount.checked_add(amount).unwrap();
    position.last_updated = Clock::get()?.unix_timestamp;
    Ok(())
}

// --- Mint USDT ---
#[derive(Accounts)]
pub struct MintUsdt<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, seeds = [b"position", owner.key().as_ref(), collateral_mint.key().as_ref()], bump = position.bump)]
    pub position: Account<'info, Position>,
    #[account(seeds = [b"collateral", collateral_mint.key().as_ref()], bump = collateral_config.bump)]
    pub collateral_config: Account<'info, CollateralConfig>,
    /// CHECK: Validated against config
    #[account(address = collateral_config.oracle)]
    pub oracle: AccountInfo<'info>,
    #[account(mut, seeds = [b"mint"], bump)]
    pub usdt_mint: Account<'info, Mint>,
    #[account(init_if_needed, payer = owner, associated_token::mint = usdt_mint, associated_token::authority = owner)]
    pub user_usdt_account: Account<'info, TokenAccount>,
    pub collateral_mint: Account<'info, Mint>,
    #[account(seeds = [b"global_state"], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn mint_usdt_handler(ctx: Context<MintUsdt>, amount: u64) -> Result<()> {
    if ctx.accounts.global_state.paused { return err!(CustomErrorCode::Paused); }
    if ctx.accounts.position.is_frozen { return err!(CustomErrorCode::Frozen); }

    let price = get_price(&ctx.accounts.oracle)?;
    let position = &mut ctx.accounts.position;
    let collateral_val = (position.collateral_amount as u128)
        .checked_mul(price as u128).unwrap()
        .checked_div(10u128.pow(ctx.accounts.collateral_mint.decimals as u32)).unwrap() as u64;
        
    let new_debt = position.debt_amount.checked_add(amount).unwrap();
    let mcr_percent = ctx.accounts.collateral_config.mcr;
    let required_val = (new_debt as u128).checked_mul(mcr_percent as u128).unwrap().checked_div(100).unwrap();
    if (collateral_val as u128) < required_val { return err!(CustomErrorCode::BelowMcr); }
    
    let seeds = &[b"global_state".as_ref(), &[ctx.accounts.global_state.bump]];
    let cpi_accounts = MintTo {
        mint: ctx.accounts.usdt_mint.to_account_info(),
        to: ctx.accounts.user_usdt_account.to_account_info(),
        authority: ctx.accounts.global_state.to_account_info(),
    };
    token::mint_to(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, &[&seeds[..]]), amount)?;
    position.debt_amount = new_debt;
    position.last_updated = Clock::get()?.unix_timestamp;
    Ok(())
}

// --- Burn USDT ---
#[derive(Accounts)]
pub struct BurnUsdt<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, seeds = [b"position", owner.key().as_ref(), collateral_mint.key().as_ref()], bump = position.bump)]
    pub position: Account<'info, Position>,
    #[account(mut, seeds = [b"mint"], bump)]
    pub usdt_mint: Account<'info, Mint>,
    #[account(mut, associated_token::mint = usdt_mint, associated_token::authority = owner)]
    pub user_usdt_account: Account<'info, TokenAccount>,
    pub collateral_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    #[account(seeds = [b"global_state"], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,
}

pub fn burn_usdt_handler(ctx: Context<BurnUsdt>, amount: u64) -> Result<()> {
    if ctx.accounts.global_state.paused { return err!(CustomErrorCode::Paused); }
    if ctx.accounts.position.is_frozen { return err!(CustomErrorCode::Frozen); }
    let cpi_accounts = Burn {
        mint: ctx.accounts.usdt_mint.to_account_info(),
        from: ctx.accounts.user_usdt_account.to_account_info(),
        authority: ctx.accounts.owner.to_account_info(),
    };
    token::burn(CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts), amount)?;
    let position = &mut ctx.accounts.position;
    position.debt_amount = if amount > position.debt_amount { 0 } else { position.debt_amount.checked_sub(amount).unwrap() };
    position.last_updated = Clock::get()?.unix_timestamp;
    Ok(())
}

// --- Withdraw Collateral ---
#[derive(Accounts)]
pub struct WithdrawCollateral<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, seeds = [b"position", owner.key().as_ref(), collateral_mint.key().as_ref()], bump = position.bump)]
    pub position: Account<'info, Position>,
    #[account(seeds = [b"collateral", collateral_mint.key().as_ref()], bump = collateral_config.bump)]
    pub collateral_config: Account<'info, CollateralConfig>,
    /// CHECK: Validated against config
    #[account(address = collateral_config.oracle)]
    pub oracle: AccountInfo<'info>,
    #[account(mut, seeds = [b"vault", collateral_mint.key().as_ref()], bump, token::mint = collateral_mint, token::authority = vault_authority)]
    pub vault_token_account: Account<'info, TokenAccount>,
    /// CHECK: Vault authority PDA
    #[account(seeds = [b"vault_authority"], bump)]
    pub vault_authority: AccountInfo<'info>,
    pub collateral_mint: Account<'info, Mint>,
    #[account(mut, associated_token::mint = collateral_mint, associated_token::authority = owner)]
    pub user_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    #[account(seeds = [b"global_state"], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,
}

pub fn withdraw_collateral_handler(ctx: Context<WithdrawCollateral>, amount: u64) -> Result<()> {
    if ctx.accounts.global_state.paused { return err!(CustomErrorCode::Paused); }
    if ctx.accounts.position.is_frozen { return err!(CustomErrorCode::Frozen); }
    let position = &mut ctx.accounts.position;
    let new_balance = position.collateral_amount.checked_sub(amount).ok_or(CustomErrorCode::InsufficientCollateral)?;
    if position.debt_amount > 0 {
        let price = get_price(&ctx.accounts.oracle)?;
        let val = (new_balance as u128).checked_mul(price as u128).unwrap().checked_div(10u128.pow(ctx.accounts.collateral_mint.decimals as u32)).unwrap() as u64;
        let req = (position.debt_amount as u128).checked_mul(ctx.accounts.collateral_config.mcr as u128).unwrap().checked_div(100).unwrap();
        if (val as u128) < req { return err!(CustomErrorCode::BelowMcr); }
    }
    position.collateral_amount = new_balance;
    position.last_updated = Clock::get()?.unix_timestamp;
    let seeds = &[b"vault_authority".as_ref(), &[ctx.bumps.vault_authority]];
    let cpi_accounts = Transfer {
        from: ctx.accounts.vault_token_account.to_account_info(),
        to: ctx.accounts.user_token_account.to_account_info(),
        authority: ctx.accounts.vault_authority.to_account_info(),
    };
    token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, &[&seeds[..]]), amount)?;
    Ok(())
}

// --- Liquidate ---
#[derive(Accounts)]
pub struct Liquidate<'info> {
    #[account(mut)]
    pub liquidator: Signer<'info>,
    #[account(mut, seeds = [b"position", position_owner.key().as_ref(), collateral_mint.key().as_ref()], bump = position.bump)]
    pub position: Account<'info, Position>,
    /// CHECK: Position owner
    pub position_owner: AccountInfo<'info>,
    #[account(seeds = [b"collateral", collateral_mint.key().as_ref()], bump = collateral_config.bump)]
    pub collateral_config: Account<'info, CollateralConfig>,
    /// CHECK: Oracle
    #[account(address = collateral_config.oracle)]
    pub oracle: AccountInfo<'info>,
    #[account(mut, seeds = [b"mint"], bump)]
    pub usdt_mint: Account<'info, Mint>,
    #[account(mut, associated_token::mint = usdt_mint, associated_token::authority = liquidator)]
    pub liquidator_usdt_account: Account<'info, TokenAccount>,
    #[account(mut, associated_token::mint = collateral_mint, associated_token::authority = liquidator)]
    pub liquidator_collateral_account: Account<'info, TokenAccount>,
    #[account(mut, seeds = [b"vault", collateral_mint.key().as_ref()], bump, token::mint = collateral_mint, token::authority = vault_authority)]
    pub vault_token_account: Account<'info, TokenAccount>,
    /// CHECK: Vault authority
    #[account(seeds = [b"vault_authority"], bump)]
    pub vault_authority: AccountInfo<'info>,
    pub collateral_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    #[account(seeds = [b"global_state"], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,
}

pub fn liquidate_handler(ctx: Context<Liquidate>, amount: u64) -> Result<()> {
    if ctx.accounts.global_state.paused { return err!(CustomErrorCode::Paused); }
    let price = get_price(&ctx.accounts.oracle)?;
    let position = &mut ctx.accounts.position;
    let val = (position.collateral_amount as u128).checked_mul(price as u128).unwrap().checked_div(10u128.pow(ctx.accounts.collateral_mint.decimals as u32)).unwrap() as u64;
    let req = (position.debt_amount as u128).checked_mul(ctx.accounts.collateral_config.mcr as u128).unwrap().checked_div(100).unwrap();
    if (val as u128) >= req { return err!(CustomErrorCode::PositionSafe); }
    
    let repay = if amount > position.debt_amount { position.debt_amount } else { amount };
    let cpi_burn = Burn { mint: ctx.accounts.usdt_mint.to_account_info(), from: ctx.accounts.liquidator_usdt_account.to_account_info(), authority: ctx.accounts.liquidator.to_account_info() };
    token::burn(CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_burn), repay)?;

    let seize_val = (repay as u128).checked_mul(100 + ctx.accounts.collateral_config.liquidation_penalty as u128).unwrap().checked_div(100).unwrap();
    let seize_amt = (seize_val.checked_mul(10u128.pow(ctx.accounts.collateral_mint.decimals as u32)).unwrap().checked_div(price as u128).unwrap() as u64).min(position.collateral_amount);
    
    position.debt_amount = position.debt_amount.checked_sub(repay).unwrap();
    position.collateral_amount = position.collateral_amount.checked_sub(seize_amt).unwrap();
    position.last_updated = Clock::get()?.unix_timestamp;

    let seeds = &[b"vault_authority".as_ref(), &[ctx.bumps.vault_authority]];
    let cpi_transfer = Transfer { from: ctx.accounts.vault_token_account.to_account_info(), to: ctx.accounts.liquidator_collateral_account.to_account_info(), authority: ctx.accounts.vault_authority.to_account_info() };
    token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_transfer, &[&seeds[..]]), seize_amt)?;
    Ok(())
}

// --- Governance ---
#[derive(Accounts)]
pub struct TogglePause<'info> {
    #[account(mut, seeds = [b"global_state"], bump = global_state.bump, has_one = admin)]
    pub global_state: Account<'info, GlobalState>,
    pub admin: Signer<'info>,
}
#[derive(Accounts)]
pub struct ToggleFreeze<'info> {
    #[account(seeds = [b"global_state"], bump = global_state.bump, has_one = admin)]
    pub global_state: Account<'info, GlobalState>,
    #[account(mut)]
    pub position: Account<'info, Position>,
    pub admin: Signer<'info>,
}
pub fn toggle_pause_handler(ctx: Context<TogglePause>, paused: bool) -> Result<()> {
    ctx.accounts.global_state.paused = paused;
    Ok(())
}
pub fn toggle_freeze_handler(ctx: Context<ToggleFreeze>, frozen: bool) -> Result<()> {
    ctx.accounts.position.is_frozen = frozen;
    Ok(())
}

// --- PSM ---
#[derive(Accounts)]
pub struct ConfigurePsm<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [b"global_state"], bump = global_state.bump, has_one = admin)]
    pub global_state: Account<'info, GlobalState>,
    pub token_mint: Account<'info, Mint>,
    #[account(init, payer = admin, seeds = [b"psm", token_mint.key().as_ref()], bump, space = 8 + 32 + 32 + 8 + 8 + 1)]
    pub psm_config: Account<'info, PsmConfig>,
    #[account(init, payer = admin, seeds = [b"psm_vault", token_mint.key().as_ref()], bump, token::mint = token_mint, token::authority = global_state)]
    pub psm_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}
#[account]
pub struct PsmConfig { pub token_mint: Pubkey, pub vault: Pubkey, pub total_minted: u64, pub fee_basis_points: u64, pub bump: u8 }
#[derive(Accounts)]
pub struct SwapUsdcToUsdt<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [b"psm", token_mint.key().as_ref()], bump = psm_config.bump)]
    pub psm_config: Account<'info, PsmConfig>,
    pub token_mint: Account<'info, Mint>,
    #[account(mut, seeds = [b"psm_vault", token_mint.key().as_ref()], bump)]
    pub psm_vault: Account<'info, TokenAccount>,
    #[account(mut, associated_token::mint = token_mint, associated_token::authority = user)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut, seeds = [b"mint"], bump)]
    pub usdt_mint: Account<'info, Mint>,
    #[account(mut, associated_token::mint = usdt_mint, associated_token::authority = user)]
    pub user_usdt_account: Account<'info, TokenAccount>,
    #[account(seeds = [b"global_state"], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct SwapUsdtToUsdc<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [b"psm", token_mint.key().as_ref()], bump = psm_config.bump)]
    pub psm_config: Account<'info, PsmConfig>,
    pub token_mint: Account<'info, Mint>,
    #[account(mut, seeds = [b"psm_vault", token_mint.key().as_ref()], bump)]
    pub psm_vault: Account<'info, TokenAccount>,
    #[account(mut, associated_token::mint = token_mint, associated_token::authority = user)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(mut, seeds = [b"mint"], bump)]
    pub usdt_mint: Account<'info, Mint>,
    #[account(mut, associated_token::mint = usdt_mint, associated_token::authority = user)]
    pub user_usdt_account: Account<'info, TokenAccount>,
    #[account(seeds = [b"global_state"], bump = global_state.bump)]
    pub global_state: Account<'info, GlobalState>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
}
pub fn configure_psm_handler(ctx: Context<ConfigurePsm>, fee: u64) -> Result<()> {
    let c = &mut ctx.accounts.psm_config; c.token_mint = ctx.accounts.token_mint.key(); c.vault = ctx.accounts.psm_vault.key(); c.fee_basis_points = fee; c.bump = ctx.bumps.psm_config; Ok(())
}
pub fn swap_to_usdt_handler(ctx: Context<SwapUsdcToUsdt>, amount: u64) -> Result<()> {
    if ctx.accounts.global_state.paused { return err!(CustomErrorCode::Paused); }
    token::transfer(CpiContext::new(ctx.accounts.token_program.to_account_info(), Transfer { from: ctx.accounts.user_token_account.to_account_info(), to: ctx.accounts.psm_vault.to_account_info(), authority: ctx.accounts.user.to_account_info() }), amount)?;
    let seeds = &[b"global_state".as_ref(), &[ctx.accounts.global_state.bump]];
    token::mint_to(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), MintTo { mint: ctx.accounts.usdt_mint.to_account_info(), to: ctx.accounts.user_usdt_account.to_account_info(), authority: ctx.accounts.global_state.to_account_info() }, &[&seeds[..]]), amount)?;
    ctx.accounts.psm_config.total_minted += amount; Ok(())
}
pub fn swap_to_usdc_handler(ctx: Context<SwapUsdtToUsdc>, amount: u64) -> Result<()> {
    if ctx.accounts.global_state.paused { return err!(CustomErrorCode::Paused); }
    token::burn(CpiContext::new(ctx.accounts.token_program.to_account_info(), Burn { mint: ctx.accounts.usdt_mint.to_account_info(), from: ctx.accounts.user_usdt_account.to_account_info(), authority: ctx.accounts.user.to_account_info() }), amount)?;
    let seeds = &[b"global_state".as_ref(), &[ctx.accounts.global_state.bump]];
    token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), Transfer { from: ctx.accounts.psm_vault.to_account_info(), to: ctx.accounts.user_token_account.to_account_info(), authority: ctx.accounts.global_state.to_account_info() }, &[&seeds[..]]), amount)?;
    ctx.accounts.psm_config.total_minted -= amount; Ok(())
}

// --- Mock Oracle ---
#[derive(Accounts)]
pub struct SetMockPrice<'info> {
    #[account(init_if_needed, payer = admin, space = MockPriceAccount::LEN, seeds = [b"mock_oracle"], bump)]
    pub mock_price_account: Account<'info, MockPriceAccount>,
    #[account(mut)] pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}
pub fn set_mock_price_handler(ctx: Context<SetMockPrice>, price: u64) -> Result<()> {
    ctx.accounts.mock_price_account.price = price; Ok(())
}

#[program]
pub mod stablecoin_system {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        initialize_handler(ctx)
    }

    pub fn configure_collateral(
        ctx: Context<ConfigureCollateral>,
        collateral_mint: Pubkey,
        oracle: Pubkey,
        mcr: u64,
        ltr: u64,
        liquidation_penalty: u64,
    ) -> Result<()> {
        configure_collateral_handler(
            ctx,
            collateral_mint,
            oracle,
            mcr,
            ltr,
            liquidation_penalty,
        )
    }

    pub fn deposit_collateral(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
        deposit_collateral_handler(ctx, amount)
    }

    pub fn mint_usdt(ctx: Context<MintUsdt>, amount: u64) -> Result<()> {
        mint_usdt_handler(ctx, amount)
    }

    pub fn burn_usdt(ctx: Context<BurnUsdt>, amount: u64) -> Result<()> {
        burn_usdt_handler(ctx, amount)
    }

    pub fn withdraw_collateral(ctx: Context<WithdrawCollateral>, amount: u64) -> Result<()> {
        withdraw_collateral_handler(ctx, amount)
    }

    pub fn liquidate(ctx: Context<Liquidate>, amount: u64) -> Result<()> {
        liquidate_handler(ctx, amount)
    }

    pub fn toggle_pause(ctx: Context<TogglePause>, paused: bool) -> Result<()> {
        toggle_pause_handler(ctx, paused)
    }

    pub fn toggle_freeze(ctx: Context<ToggleFreeze>, frozen: bool) -> Result<()> {
        toggle_freeze_handler(ctx, frozen)
    }

    pub fn configure_psm(ctx: Context<ConfigurePsm>, fee_bps: u64) -> Result<()> {
        configure_psm_handler(ctx, fee_bps)
    }

    pub fn swap_usdc_to_usdt(ctx: Context<SwapUsdcToUsdt>, amount: u64) -> Result<()> {
        swap_to_usdt_handler(ctx, amount)
    }

    pub fn swap_usdt_to_usdc(ctx: Context<SwapUsdtToUsdc>, amount: u64) -> Result<()> {
        swap_to_usdc_handler(ctx, amount)
    }

    pub fn set_mock_price(ctx: Context<SetMockPrice>, price: u64) -> Result<()> {
        set_mock_price_handler(ctx, price)
    }
}
