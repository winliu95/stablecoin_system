# Solana Stablecoin System

A compliant, auditable, and real-time cross-border stablecoin system built on the Solana blockchain using the Anchor framework.

## 🚀 Overview

This system allows for the creation of a fiat-backed stablecoin (USDT) using various tokens as collateral. It includes:
- **Smart Contracts**: Core logic for initialization, collateral configuration, deposit, minting, burning, and liquidation.
- **Frontend Dashboard**: Interactive web interface for both Administrators and Users.
- **Local Testing**: Scripts and tests for local development on Solana Localnet.

## 📁 Project Structure

- `programs/stablecoin_system`: Anchor smart contract written in Rust.
- `app/`: Next.js frontend application.
- `tests/`: Integration tests in TypeScript.
- `migrations/`: Deployment scripts.

## 🛠️ Getting Started

### Prerequisites
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools)
- [Anchor Version Manager (avm)](https://www.anchor-lang.com/docs/installation)
- Node.js & Yarn

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   yarn install
   cd app && npm install
   ```

### Running Locally
1. Start a local Solana validator:
   ```bash
   solana-test-validator --reset
   ```
2. Build and deploy the smart contract:
   ```bash
   anchor build
   anchor deploy
   ```
3. Run the frontend:
   ```bash
   cd app
   npm run dev
   ```

## 🖥️ Using the Dashboards

- **Admin Dashboard** (`/admin`):
  - Initialize the system.
  - Create Mock Collateral Tokens for testing.
  - Configure collateral parameters (MCR, LTR, etc.).
- **User Dashboard** (`/dashboard`):
  - Deposit collateral.
  - Mint USDT.
  - Repay debt and withdraw collateral.

## 📄 Documentation Artifacts
Detailed planning and verification results can be found in:
- `implementation_plan.md`
- `walkthrough.md`
- `task.md`

*(Note: These are currently in the hidden brain directory, I can copy them to root if needed).*
