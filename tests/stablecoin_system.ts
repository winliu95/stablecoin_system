import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { StablecoinSystem } from "../target/types/stablecoin_system";
import {
    createMint,
    createAssociatedTokenAccount,
    mintTo,
    getAccount,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import { assert } from "chai";

describe("stablecoin_system", () => {
    // Configure the client to use the local cluster.
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.stablecoinSystem as Program<StablecoinSystem>;

    let collateralMint: anchor.web3.PublicKey;
    let usdtMint: anchor.web3.PublicKey;
    let userCollateralAccount: anchor.web3.PublicKey;
    let userBody: anchor.web3.Keypair;

    const [globalState] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("global_state")],
        program.programId
    );

    const [mintPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("mint")],
        program.programId
    );

    it("Is initialized!", async () => {
        // 1. Initialize
        try {
            const tx = await program.methods.initialize().rpc();
            console.log("Initialize tx:", tx);
        } catch (e) {
            console.log("Already initialized or error:", e);
        }

        const stateAccount = await program.account.globalState.fetch(globalState);
        console.log("Global Admin:", stateAccount.admin.toBase58());
        assert.ok(stateAccount.admin.equals(provider.wallet.publicKey));
    });

    it("Configures Collateral", async () => {
        // Create a mock collateral mint (e.g., SOL)
        collateralMint = await createMint(
            provider.connection,
            (provider.wallet as any).payer,
            provider.wallet.publicKey,
            null,
            9 // 9 decimals like SOL
        );

        // Mock Oracle Address (Random for now as we mock logic in utils.rs)
        const oracle = anchor.web3.Keypair.generate().publicKey;

        const [collateralConfig] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("collateral"), collateralMint.toBuffer()],
            program.programId
        );

        await program.methods.configureCollateral(
            collateralMint,
            oracle,
            new anchor.BN(150), // MCR 150%
            new anchor.BN(120), // LTR 120%
            new anchor.BN(10)   // Penalty 10%
        ).accounts({
            collateralConfig: collateralConfig,
            // globalState: globalState // inferred
            admin: provider.wallet.publicKey,
        } as any).rpc();

        const configAccount = await program.account.collateralConfig.fetch(collateralConfig);
        assert.ok(configAccount.mcr.eq(new anchor.BN(150)));
    });

    it("Deposits Collateral", async () => {
        userBody = anchor.web3.Keypair.generate();

        // Airdrop SOL to user
        const airdropTx = await provider.connection.requestAirdrop(userBody.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
        await provider.connection.confirmTransaction(airdropTx);

        // Create User Collateral Account and Mint tokens
        userCollateralAccount = await createAssociatedTokenAccount(
            provider.connection,
            (provider.wallet as any).payer,
            collateralMint,
            userBody.publicKey
        );

        await mintTo(
            provider.connection,
            (provider.wallet as any).payer,
            collateralMint,
            userCollateralAccount,
            provider.wallet.publicKey,
            10 * 1_000_000_000 // 10 SOL
        );

        const [position] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("position"), userBody.publicKey.toBuffer(), collateralMint.toBuffer()],
            program.programId
        );

        const [vault] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("vault"), collateralMint.toBuffer()],
            program.programId
        );

        await program.methods.depositCollateral(
            new anchor.BN(5 * 1_000_000_000) // Deposit 5 SOL
        ).accounts({
            user: userBody.publicKey,
            collateralMint: collateralMint,
            userTokenAccount: userCollateralAccount,
            vaultTokenAccount: vault,
            position: position,
        } as any).signers([userBody]).rpc();

        const positionAccount = await program.account.position.fetch(position);
        console.log("Position Collateral:", positionAccount.collateralAmount.toString());
        assert.ok(positionAccount.collateralAmount.eq(new anchor.BN(5 * 1_000_000_000)));
    });

    it("Mints USDT", async () => {
        const [position] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("position"), userBody.publicKey.toBuffer(), collateralMint.toBuffer()],
            program.programId
        );

        // Create User USDT Account
        const userUsdtAccount = await anchor.utils.token.associatedAddress({
            mint: mintPda,
            owner: userBody.publicKey
        });

        const [collateralConfig] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("collateral"), collateralMint.toBuffer()],
            program.programId
        );
        const configData = await program.account.collateralConfig.fetch(collateralConfig);

        // Mock Price is $150 in utils.rs.
        // Collateral: 5 SOL * $150 = $750 value
        // Max Debt (150% MCR): $750 / 1.5 = $500
        // Let's mint 400 USDT (assuming 6 decimals) -> 400 * 10^6 

        await program.methods.mintUsdt(
            new anchor.BN(400 * 1_000_000)
        ).accounts({
            owner: userBody.publicKey,
            position: position,
            collateralConfig: collateralConfig,
            oracle: configData.oracle,
            usdtMint: mintPda,
            userUsdtAccount: userUsdtAccount,
            collateralMint: collateralMint,
        } as any).signers([userBody]).rpc();

        const positionAccount = await program.account.position.fetch(position);
        console.log("Position Debt:", positionAccount.debtAmount.toString());
        assert.ok(positionAccount.debtAmount.eq(new anchor.BN(400 * 1_000_000)));
    });

    it("Burns USDT", async () => {
        const [position] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("position"), userBody.publicKey.toBuffer(), collateralMint.toBuffer()],
            program.programId
        );

        // Create User USDT Account (should already exist from Mint)
        const userUsdtAccount = await anchor.utils.token.associatedAddress({
            mint: mintPda, // Corrected from usdtMint
            owner: userBody.publicKey
        });

        // Burn 100 USDT
        await program.methods.burnUsdt(
            new anchor.BN(100 * 1_000_000)
        ).accounts({
            owner: userBody.publicKey,
            position: position,
            usdtMint: mintPda,
            userUsdtAccount: userUsdtAccount,
            collateralMint: collateralMint,
        } as any).signers([userBody]).rpc();

        const positionAccount = await program.account.position.fetch(position);
        console.log("Position Debt after burn:", positionAccount.debtAmount.toString());
        // 400 - 100 = 300
        assert.ok(positionAccount.debtAmount.eq(new anchor.BN(300 * 1_000_000)));
    });

    it("Withdraws Collateral", async () => {
        const [position] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("position"), userBody.publicKey.toBuffer(), collateralMint.toBuffer()],
            program.programId
        );

        const [vault] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("vault"), collateralMint.toBuffer()],
            program.programId
        );

        const [collateralConfig] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("collateral"), collateralMint.toBuffer()],
            program.programId
        );
        const configData = await program.account.collateralConfig.fetch(collateralConfig);

        // Attempt to withdraw small amount, should succeed if CR remains healthy
        await program.methods.withdrawCollateral(
            new anchor.BN(100_000_000) // Withdraw 0.1 SOL
        ).accounts({
            owner: userBody.publicKey,
            position: position,
            collateralConfig: collateralConfig,
            oracle: configData.oracle,
            vaultTokenAccount: vault,
            collateralMint: collateralMint,
            userTokenAccount: userCollateralAccount,
        } as any).signers([userBody]).rpc();

        const positionAccount = await program.account.position.fetch(position);
        console.log("Position Collateral after withdraw:", positionAccount.collateralAmount.toString());
        assert.ok(positionAccount.collateralAmount.eq(new anchor.BN(4900000000)));
    });

    it("Governance: Pauses and Unpauses System", async () => {
        // 1. Pause
        await program.methods.togglePause(true).accounts({
            globalState: globalState,
            admin: provider.wallet.publicKey,
        } as any).rpc();

        const state = await program.account.globalState.fetch(globalState);
        assert.ok(state.paused === true);

        // 2. Try to deposit (should fail)
        try {
            const [position] = anchor.web3.PublicKey.findProgramAddressSync(
                [Buffer.from("position"), userBody.publicKey.toBuffer(), collateralMint.toBuffer()],
                program.programId
            );
            const [vault] = anchor.web3.PublicKey.findProgramAddressSync(
                [Buffer.from("vault"), collateralMint.toBuffer()],
                program.programId
            );

            await program.methods.depositCollateral(new anchor.BN(100)).accounts({
                user: userBody.publicKey,
                collateralMint: collateralMint,
                userTokenAccount: userCollateralAccount,
                vaultTokenAccount: vault,
                position: position,
                globalState: globalState, // Needed for check
            } as any).signers([userBody]).rpc();
            assert.fail("Should have failed due to Pause");
        } catch (e) {
            assert.ok(JSON.stringify(e).includes("Paused"));
        }

        // 3. Unpause
        await program.methods.togglePause(false).accounts({
            globalState: globalState,
            admin: provider.wallet.publicKey,
        } as any).rpc();

        const stateUnpaused = await program.account.globalState.fetch(globalState);
        assert.ok(stateUnpaused.paused === false);
    });

    it("PSM: Swaps USDC for USDT and back", async () => {
        // 1. Create Mock USDC Mint
        const usdcMint = await createMint(
            provider.connection,
            (provider.wallet as any).payer,
            provider.wallet.publicKey,
            null,
            6
        );

        // 2. Configure PSM
        const [psmConfig] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("psm"), usdcMint.toBuffer()],
            program.programId
        );
        const [psmVault] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("psm_vault"), usdcMint.toBuffer()],
            program.programId
        );

        await program.methods.configurePsm(new anchor.BN(0)).accounts({
            admin: provider.wallet.publicKey,
            globalState: globalState,
            tokenMint: usdcMint,
            psmConfig: psmConfig,
            psmVault: psmVault,
        } as any).rpc();

        // 3. Mint USDC to User
        const userUsdcAccount = await createAssociatedTokenAccount(
            provider.connection,
            (provider.wallet as any).payer,
            usdcMint,
            userBody.publicKey
        );
        await mintTo(
            provider.connection,
            (provider.wallet as any).payer,
            usdcMint,
            userUsdcAccount,
            provider.wallet.publicKey,
            1000 * 1_000_000 // 1000 USDC
        );

        // 4. Swap USDC -> USDT
        const userUsdtAccount = await anchor.utils.token.associatedAddress({
            mint: mintPda,
            owner: userBody.publicKey
        });

        await program.methods.swapUsdcToUsdt(new anchor.BN(500 * 1_000_000)).accounts({
            user: userBody.publicKey,
            psmConfig: psmConfig,
            tokenMint: usdcMint,
            psmVault: psmVault,
            userTokenAccount: userUsdcAccount,
            usdtMint: mintPda,
            userUsdtAccount: userUsdtAccount,
            globalState: globalState,
        } as any).signers([userBody]).rpc();

        // Check balances not easily possible without connection fetch, but if it didn't fail it's good.
        const psmConfigAccount = await program.account.psmConfig.fetch(psmConfig);
        console.log("PSM Total Minted:", psmConfigAccount.totalMinted.toString());
        assert.ok(psmConfigAccount.totalMinted.eq(new anchor.BN(500 * 1_000_000)));

        // 5. Swap USDT -> USDC
        await program.methods.swapUsdtToUsdc(new anchor.BN(500 * 1_000_000)).accounts({
            user: userBody.publicKey,
            psmConfig: psmConfig,
            tokenMint: usdcMint,
            psmVault: psmVault,
            userTokenAccount: userUsdcAccount,
            usdtMint: mintPda,
            userUsdtAccount: userUsdtAccount,
            globalState: globalState,
        } as any).signers([userBody]).rpc();

        const psmConfigAccountAfter = await program.account.psmConfig.fetch(psmConfig);
        console.log("PSM Total Minted After Redeem:", psmConfigAccountAfter.totalMinted.toString());
        assert.ok(psmConfigAccountAfter.totalMinted.eq(new anchor.BN(0)));
    });
});
