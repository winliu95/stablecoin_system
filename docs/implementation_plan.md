# 實作計畫書 (Implementation Plan) - Solana 合規穩定幣系統

## 專案目標
建立一個基於 Solana 區塊鏈的合規穩定幣系統，支援法幣信託抵押、跨國結算、以及符合監管要求的 AML/KYC 機制。

## 待審查事項 (User Review Required)
> [!IMPORTANT]
> 本系統涉及金流與法規，核心權限（如鑄幣權、參數設定、凍結帳戶）需由多簽錢包（Multisig）或 DAO 控制。開發階段將使用單一管理員權限進行測試。

## 擬定變更 (Proposed Changes)

### 1. 系統架構 (System Architecture)
- **語言 Framework**: Rust (Anchor Framework)
- **網路**: Solana (Mainnet-beta / Devnet)
- **關鍵模組**:
    - `CollateralVault`: 管理抵押品
    - `StablecoinMint`: 管理穩定幣發行與銷毀
    - `OracleAdapter`: 對接 Pyth/Switchboard 價格
    - `RegulatoryModule`: 實作凍結、審計日誌

### 2. 智能合約模組詳細設計 (Smart Contract Modules)

#### [NEW] `programs/stablecoin/src/lib.rs` & `state.rs`
- 定義專案進入點與核心邏輯。
- **State Structs**:
    - `GlobalState`: 儲存 Protocol 級別變數 (Admin, Total Supply, Paused)
    - `Position`: 儲存用戶個別倉位 (Collateral Amount, Debt Amount)
    - `CollateralConfig`: 儲存不同抵押品的風險參數 (MCR, Stability Fee)

#### [NEW] `programs/stablecoin/src/instructions/`
- **`initialize.rs`**: 設定合約初始狀態、權限。
- **`deposit.rs`**: 轉移 SOL/Token 到 Vault，更新 Position。
- **`mint.rs`**: 檢查抵押率 (CR) >= MCR，鑄造 SPL Token。
- **`redeem.rs`**: 銷毀 SPL Token，釋放抵押品 (需檢查債務償還)。
- **`liquidate.rs`**: 當 CR < MCR 時，允許第三方清算。

### 3. 外部整合 (Integrations)
- **Oracle**: 使用 Pyth Network 取得 TWD/USD 或 SOL/USD 即時匯率。
- **Compliance**: 在關鍵指令 (Transfer/Mint) 加入 `is_frozen` 檢查 Hook。

## 驗證計畫 (Verification Plan)

### 自動化測試
- 使用 `anchor test` (TypeScript) 進行端對端測試。
- 測試案例包含：
    1. 正常存入抵押與鑄幣流程。
    2. 抵押率不足時鑄幣失敗。
    3. 價格下跌觸發清算機制。
    4. 管理員暫停系統與恢復。

### 手動驗證
- 部署至 Solana Devnet。
- 使用 Solana Explorer 查看帳戶數據與交易日誌。
