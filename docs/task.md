# 專案任務清單 (Project Task List)

## 1. 專案初始化與規劃 (Initialization & Planning)
- [x] 建立專案結構與規劃文件 (`implementation_plan.md`) <!-- id: 1 -->
- [x] 檢查開發環境 (Rust, Solana CLI, Anchor) <!-- id: 2 -->
- [x] 初始化 Anchor 專案 (`anchor init`) <!-- id: 3 -->

## 2. 智能合約核心實作 (Core Smart Contract Implementation)
- [x] **資料結構定義 (Data Structures)** <!-- id: 4 -->
    - [x] 定義 `GlobalState` (管理員、總供應量、暫停狀態)
    - [x] 定義 `CollateralConfig` (抵押率 MCR, LTR, 預言機地址)
    - [x] 定義 `Position` (用戶抵押倉位)
- [x] **核心指令 (Core Instructions)** <!-- id: 5 -->
    - [x] 實作 `initialize` (初始化全域狀態)
    - [x] 實作 `configure_collateral` (設定抵押參數)
    - [x] 實作 `deposit_collateral` (存入抵押品)
    - [x] 實作 `mint_usdt` (鑄造穩定幣)
    - [x] 實作 `burn_usdt` (贖回/銷毀穩定幣)
    - [x] 實作 `withdraw_collateral` (提領抵押品)

## 3. 進階功能模組 (Advanced Features)
- [x] **清算機制 (Liquidation)** <!-- id: 6 -->
    - [x] 實作 `liquidate` (清算低於 MCR 的倉位)
- [ ] **價格穩定模組 (PSM & Oracle)** <!-- id: 7 -->
    - [ ] 整合 Pyth/Switchboard Oracle 讀取價格
    - [ ] 實作 USDC 1:1 兌換 (PSM)
- [ ] **治理與合規 (Governance & Compliance)** <!-- id: 8 -->
    - [ ] 實作暫停/恢復功能 (`pause`/`unpause`)
    - [ ] 實作黑名單或凍結功能 (符合 AML/KYC 需求)

## 4. 測試與驗證 (Testing & Verification)
- [x] 撰寫單元測試 (Unit Tests in Rust/TS) <!-- id: 9 -->
- [x] 撰寫整合測試 (Integration Tests) <!-- id: 10 -->
- [ ] 部署至 Localnet/Devnet 進行驗證 <!-- id: 11 -->

## 5. 前端開發 (Frontend Development)
- [x] 初始化 Next.js 專案 (使用 Wallet Adapter) <!-- id: 12 -->
- [x] 實作錢包連接功能 (Connect Wallet) <!-- id: 13 -->
- [x] 實作管理員面板 (初始化、配置參數) <!-- id: 14 -->
- [x] 實作使用者面板 (存入抵押、鑄造、償還、提領) <!-- id: 15 -->
- [x] 整合合約互動 (Anchor Client) <!-- id: 16 -->
