use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer, MintTo, Burn};
use crate::state::*;

#[derive(Accounts)]
pub struct ConfigurePsm<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [b"global_state"],
        bump = global_state.bump,
        has_one = admin,
    )]
    pub global_state: Account<'info, GlobalState>,

    pub token_mint: Account<'info, Mint>, // e.g. USDC

    #[account(
        init,
        payer = admin,
        seeds = [b"psm", token_mint.key().as_ref()],
        bump,
        space = 8 + 32 + 32 + 8 + 8 + 1
    )]
    pub psm_config: Account<'info, PsmConfig>,

    #[account(
        init,
        payer = admin,
        seeds = [b"psm_vault", token_mint.key().as_ref()],
        bump,
        token::mint = token_mint,
        token::authority = global_state, // GlobalState owns the vault? Or a separate PDA?
    )]
    pub psm_vault: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[account]
pub struct PsmConfig {
    pub token_mint: Pubkey,
    pub vault: Pubkey,
    pub total_minted: u64,
    pub fee_basis_points: u64, // e.g. 10 = 0.1%
    pub bump: u8,
}

#[derive(Accounts)]
pub struct SwapUsdcToUsdt<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"psm", token_mint.key().as_ref()],
        bump = psm_config.bump,
    )]
    pub psm_config: Account<'info, PsmConfig>,

    pub token_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"psm_vault", token_mint.key().as_ref()],
        bump,
    )]
    pub psm_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = user,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"mint"],
        bump,
    )]
    pub usdt_mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = usdt_mint,
        associated_token::authority = user,
    )]
    pub user_usdt_account: Account<'info, TokenAccount>,
    
    #[account(
        seeds = [b"global_state"],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler_configure(ctx: Context<ConfigurePsm>, fee_bps: u64) -> Result<()> {
    let psm_config = &mut ctx.accounts.psm_config;
    psm_config.token_mint = ctx.accounts.token_mint.key();
    psm_config.vault = ctx.accounts.psm_vault.key();
    psm_config.fee_basis_points = fee_bps;
    psm_config.bump = ctx.bumps.psm_config;
    msg!("PSM Configured for {}", ctx.accounts.token_mint.key());
    Ok(())
}

pub fn handler_swap_to_usdt(ctx: Context<SwapUsdcToUsdt>, amount: u64) -> Result<()> {
    // 0. Checks
    if ctx.accounts.global_state.paused {
        return err!(CustomErrorCode::Paused);
    }

    // 1. Transfer USDC from User to Vault
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_token_account.to_account_info(),
        to: ctx.accounts.psm_vault.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, amount)?;

    // 2. Mint USDT to User (1:1 minus fee?)
    // If we want exact 1:1, usually no fee or small fee.
    // Let's assume 1:1 for simplicity.
    
    // Check decimals?
    // Assuming both are 6 decimals. If not, scaling needed.
    // Let's assume matching decimals for MVP.
    
    let seeds = &[b"global_state".as_ref(), &[ctx.accounts.global_state.bump]];
    let signer = &[&seeds[..]];

    let cpi_accounts_mint = MintTo {
        mint: ctx.accounts.usdt_mint.to_account_info(),
        to: ctx.accounts.user_usdt_account.to_account_info(),
        authority: ctx.accounts.global_state.to_account_info(),
    };
    let cpi_program_mint = ctx.accounts.token_program.to_account_info();
    let cpi_ctx_mint = CpiContext::new_with_signer(cpi_program_mint, cpi_accounts_mint, signer);
    token::mint_to(cpi_ctx_mint, amount)?;

    // Update stats
    ctx.accounts.psm_config.total_minted = ctx.accounts.psm_config.total_minted.checked_add(amount).unwrap();
    
    msg!("Swapped {} USDC for USDT", amount);
    Ok(())
}

#[derive(Accounts)]
pub struct SwapUsdtToUsdc<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"psm", token_mint.key().as_ref()],
        bump = psm_config.bump,
    )]
    pub psm_config: Account<'info, PsmConfig>,

    pub token_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"psm_vault", token_mint.key().as_ref()],
        bump,
    )]
    pub psm_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = user,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"mint"],
        bump,
    )]
    pub usdt_mint: Account<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = usdt_mint,
        associated_token::authority = user,
    )]
    pub user_usdt_account: Account<'info, TokenAccount>,
    
    #[account(
        seeds = [b"global_state"],
        bump = global_state.bump,
    )]
    pub global_state: Account<'info, GlobalState>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler_swap_to_usdc(ctx: Context<SwapUsdtToUsdc>, amount: u64) -> Result<()> {
    if ctx.accounts.global_state.paused {
        return err!(CustomErrorCode::Paused);
    }

    // 1. Burn USDT
    let cpi_accounts = Burn {
        mint: ctx.accounts.usdt_mint.to_account_info(),
        from: ctx.accounts.user_usdt_account.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::burn(cpi_ctx, amount)?;

    // 2. Transfer USDC from Vault
    let seeds = &[b"global_state".as_ref(), &[ctx.accounts.global_state.bump]];
    let signer = &[&seeds[..]];

    let cpi_accounts_transfer = Transfer {
        from: ctx.accounts.psm_vault.to_account_info(),
        to: ctx.accounts.user_token_account.to_account_info(),
        authority: ctx.accounts.global_state.to_account_info(),
    };
    let cpi_ctx_transfer = CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts_transfer, signer);
    token::transfer(cpi_ctx_transfer, amount)?;
    
    // Update stats
    ctx.accounts.psm_config.total_minted = ctx.accounts.psm_config.total_minted.checked_sub(amount).unwrap();

    msg!("Swapped {} USDT for USDC", amount);
    Ok(())
}
