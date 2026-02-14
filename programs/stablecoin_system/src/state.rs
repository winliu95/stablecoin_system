use anchor_lang::prelude::*;

#[account]
pub struct GlobalState {
    pub admin: Pubkey,
    pub usdt_mint: Pubkey,
    pub total_supply: u64,
    pub paused: bool,
    pub bump: u8,
}

impl GlobalState {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 1 + 1;
}

#[account]
pub struct CollateralConfig {
    pub collateral_mint: Pubkey,  // Token Mint (e.g. SOL, wBTC)
    pub oracle: Pubkey,           // Price Oracle Address
    pub mcr: u64,                 // Minimum Collateral Ratio (e.g., 150%)
    pub ltr: u64,                 // Liquidation Threshold Ratio (e.g., 120%)
    pub liquidation_penalty: u64, // Penalty applied during liquidation
    pub bump: u8,
}

impl CollateralConfig {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 8 + 8 + 1;
}

#[account]
pub struct Position {
    pub owner: Pubkey,
    pub collateral_mint: Pubkey,
    pub collateral_amount: u64,
    pub debt_amount: u64,
    pub is_frozen: bool,
    pub last_updated: i64,
    pub bump: u8,
}

impl Position {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 8 + 1 + 8 + 1;
}

#[error_code]
pub enum CustomErrorCode {
    #[msg("The system is currently paused.")]
    Paused,
    #[msg("Your position is currently frozen.")]
    Frozen,
    #[msg("Below LTR.")]
    BelowLtr,
    #[msg("Below MCR.")]
    BelowMcr,
    #[msg("Math Overflow.")]
    MathOverflow,
    #[msg("Solvency Check Failed.")]
    SolvencyCheckFailed,
    #[msg("Insufficient collateral to withdraw.")]
    InsufficientCollateral,
    #[msg("Position is safe (CR >= MCR).")]
    PositionSafe,
    #[msg("Error loading Oracle Price.")]
    OracleError,
    #[msg("Oracle Price is Stale.")]
    OracleStale,
}
