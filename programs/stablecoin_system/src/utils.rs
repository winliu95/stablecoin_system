use anchor_lang::prelude::*;

// Mock Price Fetcher using Pyth (Implementation to be replaced with actual Pyth call)
pub fn get_price(_oracle: &AccountInfo) -> Result<u64> {
    // Return $150.00 for SOL (scaled by 6 decimals)
    // 150 * 10^6
    Ok(150_000_000)
}
