use anchor_lang::prelude::*;

use pyth_sdk_solana::load_price_feed_from_account_info;
use crate::state::CustomErrorCode;
use crate::state::MockPriceAccount;

pub fn get_price(oracle: &AccountInfo) -> Result<u64> {
    #[cfg(feature = "mock-oracle")]
    {
        // Try to read dynamic mock price from account manually to avoid lifetime issues
        if let Ok(mut data) = oracle.try_borrow_data() {
            if let Ok(mock_price_acc) = MockPriceAccount::try_deserialize(&mut &data[..]) {
                msg!("Using Dynamic Mock Oracle Price: ${}", mock_price_acc.price as f64 / 1_000_000.0);
                return Ok(mock_price_acc.price);
            }
        }
        
        msg!("Using Default Mock Oracle Price: $150.00");
        return Ok(150_000_000);
    }

    #[cfg(not(feature = "mock-oracle"))]
    {
        // 1. Load Price Feed
        let price_feed = load_price_feed_from_account_info(oracle)
            .map_err(|_| error!(CustomErrorCode::OracleError))?;

        // 2. Get Valid Price (no older than 60 seconds)
        let current_timestamp = Clock::get()?.unix_timestamp;
        let price_data = price_feed.get_price_no_older_than(current_timestamp, 60)
            .ok_or(error!(CustomErrorCode::OracleStale))?;

        // 3. Normalize Price to 6 decimals (USD)
        let target_decimals = 6;
        let price = price_data.price; // i64
        let expo = price_data.expo;   // i32
        
        if price < 0 {
            return err!(CustomErrorCode::OracleError); // Negative price?
        }

        let exponent = (target_decimals as i32) + expo;
        
        let final_price = if exponent >= 0 {
            (price as u64).checked_mul(10u64.pow(exponent as u32)).ok_or(CustomErrorCode::MathOverflow)?
        } else {
            (price as u64).checked_div(10u64.pow(exponent.abs() as u32)).ok_or(CustomErrorCode::MathOverflow)?
        };

        Ok(final_price)
    }
}
