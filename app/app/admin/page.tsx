"use client";

import { useState } from "react";
import { useAnchorProgram } from "../../hooks/useAnchorProgram";
import { AppWalletMultiButton } from "../../components/AppWalletMultiButton";
import { PublicKey, SystemProgram, Transaction, Keypair, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
    TOKEN_PROGRAM_ID,
    MINT_SIZE,
    createInitializeMintInstruction,
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountInstruction,
    createMintToInstruction
} from "@solana/spl-token";

export default function AdminPage() {
    const { getProgram } = useAnchorProgram();
    const { connection } = useConnection();
    const wallet = useWallet();
    const [status, setStatus] = useState("");

    // Initialize System
    const initialize = async () => {
        const program = getProgram();
        if (!program || !wallet.publicKey) return;

        try {
            setStatus("Initializing System...");
            const [globalState] = PublicKey.findProgramAddressSync([Buffer.from("global_state")], program.programId);
            const [usdtMint] = PublicKey.findProgramAddressSync([Buffer.from("mint")], program.programId);

            const tx = await program.methods.initialize()
                .accounts({
                    admin: wallet.publicKey,
                    globalState: globalState,
                    usdtMint: usdtMint,
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                } as any).rpc();

            setStatus("System Initialized! Tx: " + tx);
        } catch (e: any) {
            console.error("Admin Action Error:", e);
            if (e.logs) console.log("Transaction Logs:", e.logs);
            let errMsg = e.message || e.toString();
            if (errMsg.includes("already in use")) {
                errMsg = "System is already initialized! You can skip this step.";
            } else if (errMsg.includes("Attempt to debit an account")) {
                errMsg = "Insufficient SOL setup. Please click 'Get Devnet SOL' first!";
            } else if (e.logs) {
                errMsg += " | Logs: " + e.logs.slice(-3).join(" ");
            }
            setStatus("Error: " + errMsg);
        }
    };

    // Configure Collateral
    const [collateralMint, setCollateralMint] = useState("");
    const [oracle, setOracle] = useState("");
    const [mcr, setMcr] = useState("150");
    const [ltr, setLtr] = useState("120");
    const [penalty, setPenalty] = useState("10");

    const configureCollateral = async () => {
        const program = getProgram();
        if (!program || !wallet.publicKey) return;

        try {
            setStatus("Configuring Collateral...");
            const mintPubkey = new PublicKey(collateralMint);
            const oraclePubkey = oracle ? new PublicKey(oracle) : wallet.publicKey; // Mock oracle as admin

            const tx = await program.methods.configureCollateral(
                new BN(parseInt(mcr)),
                new BN(parseInt(ltr)),
                new BN(parseInt(penalty))
            ).accounts({
                admin: wallet.publicKey,
                collateralMint: mintPubkey,
                oracle: oraclePubkey,
            } as any).rpc();

            setStatus("Collateral Configured! Tx: " + tx);
        } catch (e: any) {
            console.error("Admin Action Error:", e);
            if (e.logs) console.log("Transaction Logs:", e.logs);
            let errMsg = e.message || e.toString();
            if (errMsg.includes("already in use")) {
                errMsg = "System is already initialized! You can skip this step.";
            } else if (errMsg.includes("Attempt to debit an account")) {
                errMsg = "Insufficient SOL setup. Please click 'Get Devnet SOL' first!";
            } else if (e.logs) {
                errMsg += " | Logs: " + e.logs.slice(-3).join(" ");
            }
            setStatus("Error: " + errMsg);
        }
    };

    // Configure PSM
    const [psmMint, setPsmMint] = useState("");
    const [psmFee, setPsmFee] = useState("10"); // 0.1%

    const configurePsm = async () => {
        const program = getProgram();
        if (!program || !wallet.publicKey) return;

        try {
            setStatus("Configuring PSM...");
            if (!psmMint) {
                setStatus("Please enter/select a USDC Mint Address first!");
                return;
            }

            const mintPubkey = new PublicKey(psmMint);
            const feeBN = new BN(parseInt(psmFee));

            const [globalState] = PublicKey.findProgramAddressSync([Buffer.from("global_state")], program.programId);
            const [psmConfigPda] = PublicKey.findProgramAddressSync([Buffer.from("psm"), mintPubkey.toBuffer()], program.programId);
            const [psmVaultPda] = PublicKey.findProgramAddressSync([Buffer.from("psm_vault"), mintPubkey.toBuffer()], program.programId);
            const [psmAuthorityPda] = PublicKey.findProgramAddressSync([Buffer.from("psm_authority")], program.programId);

            const tx = await program.methods.configurePsm(feeBN)
                .accounts({
                    admin: wallet.publicKey,
                    globalState: globalState,
                    tokenMint: mintPubkey,
                    psmConfig: psmConfigPda,
                    psmVault: psmVaultPda,
                    psmAuthority: psmAuthorityPda,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    rent: SYSVAR_RENT_PUBKEY,
                } as any).rpc();

            setStatus("PSM Configured! Tx: " + tx);
        } catch (e: any) {
            console.error("Admin Action Error:", e);
            if (e.logs) console.log("Transaction Logs:", e.logs);
            let errMsg = e.message || e.toString();
            if (errMsg.includes("already in use")) {
                errMsg = "System is already initialized! You can skip this step.";
            } else if (errMsg.includes("Attempt to debit an account")) {
                errMsg = "Insufficient SOL setup. Please click 'Get Devnet SOL' first!";
            } else if (e.logs) {
                errMsg += " | Logs: " + e.logs.slice(-3).join(" ");
            }
            setStatus("Error: " + errMsg);
        }
    };

    // Mock Tools
    const [mockUsdc, setMockUsdc] = useState("Eu5sxWCpeYewZDE5Xy5wmBx3TNKjTL6ZYPWNRKMz3Dwm");
    const [mockCollateral, setMockCollateral] = useState("5Yt9gRBDV7NRpNjEzPGgdptamh3w6uCLupotCEY1sXtQ");

    const setupMocks = async () => {
        if (!wallet.publicKey || !wallet.signTransaction) {
            setStatus("Please connect your wallet first");
            return;
        }

        try {
            setStatus("Preparing Mock Setup Transaction...");

            const transaction = new Transaction();
            const usdcMint = Keypair.generate();
            const collMint = Keypair.generate();

            // 1. Create USDC Mint Account
            const lamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
            transaction.add(
                SystemProgram.createAccount({
                    fromPubkey: wallet.publicKey,
                    newAccountPubkey: usdcMint.publicKey,
                    space: MINT_SIZE,
                    lamports,
                    programId: TOKEN_PROGRAM_ID,
                }),
                createInitializeMintInstruction(usdcMint.publicKey, 6, wallet.publicKey, wallet.publicKey)
            );

            // 2. Create Collateral Mint Account
            transaction.add(
                SystemProgram.createAccount({
                    fromPubkey: wallet.publicKey,
                    newAccountPubkey: collMint.publicKey,
                    space: MINT_SIZE,
                    lamports,
                    programId: TOKEN_PROGRAM_ID,
                }),
                createInitializeMintInstruction(collMint.publicKey, 6, wallet.publicKey, wallet.publicKey)
            );

            // 3. Create ATAs and Mint
            const userUsdcAta = getAssociatedTokenAddressSync(usdcMint.publicKey, wallet.publicKey);
            const userCollAta = getAssociatedTokenAddressSync(collMint.publicKey, wallet.publicKey);

            transaction.add(
                createAssociatedTokenAccountInstruction(wallet.publicKey, userUsdcAta, wallet.publicKey, usdcMint.publicKey),
                createMintToInstruction(usdcMint.publicKey, userUsdcAta, wallet.publicKey, 1000 * 1_000_000),
                createAssociatedTokenAccountInstruction(wallet.publicKey, userCollAta, wallet.publicKey, collMint.publicKey),
                createMintToInstruction(collMint.publicKey, userCollAta, wallet.publicKey, 1000 * 1_000_000)
            );

            transaction.feePayer = wallet.publicKey;
            transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
            transaction.partialSign(usdcMint, collMint);

            const signed = await wallet.signTransaction(transaction);
            const txid = await connection.sendRawTransaction(signed.serialize());
            await connection.confirmTransaction(txid);

            setMockUsdc(usdcMint.publicKey.toBase58());
            setMockCollateral(collMint.publicKey.toBase58());
            setStatus(`Mocks Created & Minted! USDC: ${usdcMint.publicKey.toBase58().slice(0, 8)}..., Collateral: ${collMint.publicKey.toBase58().slice(0, 8)}...`);

        } catch (e: any) {
            console.error(e);
            setStatus("Setup Failed: " + (e.message || e.toString()));
        }
    };

    // Since creating mints in browser is complex without extra libs, 
    // I will provide a button that helps them initialize with a predictable address 
    // OR I will implement a simpler helper.

    const [systemUsdt, setSystemUsdt] = useState("");

    const showSystemInfo = () => {
        const program = getProgram();
        if (!program) return;
        const [usdtMint] = PublicKey.findProgramAddressSync([Buffer.from("mint")], program.programId);
        setSystemUsdt(usdtMint.toBase58());
        setStatus("System USDT Mint: " + usdtMint.toBase58());
    };

    const requestAirdrop = async () => {
        if (!wallet.publicKey) return;
        try {
            setStatus("Requesting airdrop...");
            const tx = await connection.requestAirdrop(wallet.publicKey, 1_000_000_000);
            await connection.confirmTransaction(tx);
            setStatus("Airdrop successful! 1 SOL received.");
        } catch (e: any) {
            setStatus("Airdrop failed: " + e.message);
        }
    };

    return (
        <main className="flex min-h-screen flex-col items-center p-24 bg-slate-900 text-white">
            <div className="w-full max-w-4xl flex justify-between items-center mb-12">
                <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-blue-500">
                    Admin Dashboard
                </h1>
                <div className="flex gap-4">
                    <button onClick={requestAirdrop} className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-xl font-bold transition">
                        Get Devnet SOL
                    </button>
                    <AppWalletMultiButton />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
                {/* 1. Initialize */}
                <div className="bg-slate-800 p-8 rounded-3xl shadow-xl border border-slate-700">
                    <h2 className="text-2xl font-bold mb-4">1. Initialize System</h2>
                    <p className="text-slate-400 mb-6 text-sm">Create Global State and USDT Mint.</p>
                    <button onClick={initialize} className="w-full bg-teal-600 hover:bg-teal-500 py-3 rounded-xl font-bold transition">
                        Initialize Program
                    </button>
                </div>

                {/* 3. PSM */}
                <div className="bg-slate-800 p-8 rounded-3xl shadow-xl border border-slate-700">
                    <h2 className="text-2xl font-bold mb-4">2. Configure PSM</h2>
                    <div className="space-y-4">
                        <input
                            type="text"
                            placeholder="USDC Mint Address"
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm font-mono"
                            value={psmMint}
                            onChange={(e) => setPsmMint(e.target.value)}
                        />
                        <input
                            type="number"
                            placeholder="Fee (bps) - e.g. 10 = 0.1%"
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm font-mono"
                            value={psmFee}
                            onChange={(e) => setPsmFee(e.target.value)}
                        />
                        <button onClick={configurePsm} className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-xl font-bold transition">
                            Configure PSM
                        </button>
                    </div>
                </div>

                {/* 3. Collateral */}
                <div className="bg-slate-800 p-8 rounded-3xl shadow-xl border border-slate-700 md:col-span-2">
                    <h2 className="text-2xl font-bold mb-4">3. Configure Collateral (CDP)</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input
                            type="text"
                            placeholder="Collateral Mint Address"
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm font-mono"
                            value={collateralMint}
                            onChange={(e) => setCollateralMint(e.target.value)}
                        />
                        <input
                            type="text"
                            placeholder="Oracle Address (optional)"
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm font-mono"
                            value={oracle}
                            onChange={(e) => setOracle(e.target.value)}
                        />
                        <div className="flex gap-4">
                            <input
                                type="number"
                                placeholder="MCR %"
                                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm"
                                value={mcr}
                                onChange={(e) => setMcr(e.target.value)}
                            />
                            <input
                                type="number"
                                placeholder="LTR %"
                                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm"
                                value={ltr}
                                onChange={(e) => setLtr(e.target.value)}
                            />
                        </div>
                    </div>
                    <button onClick={configureCollateral} className="w-full bg-purple-600 hover:bg-purple-500 py-3 rounded-xl font-bold transition mt-6">
                        Update Collateral Config
                    </button>
                </div>

                {/* 4. Helper Section */}
                <div className="bg-slate-800 p-8 rounded-3xl shadow-xl border border-teal-500/30 md:col-span-2">
                    <h2 className="text-2xl font-bold mb-4 text-teal-400">4. Generated Keys (Localnet)</h2>
                    <p className="text-slate-400 mb-6 text-sm">Copy these addresses to use in the configuration steps above.</p>
                    <div className="space-y-4 font-mono text-xs">
                        <div className="bg-slate-900 p-3 rounded-xl border border-slate-700 flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                                <span>Mock USDC:</span>
                                <span className="text-blue-400">{mockUsdc}</span>
                            </div>
                            <button
                                onClick={() => setPsmMint(mockUsdc)}
                                className="text-[10px] text-blue-500 hover:text-blue-400 text-right uppercase font-bold"
                            >
                                ↑ Use for PSM
                            </button>
                        </div>
                        <div className="bg-slate-900 p-3 rounded-xl border border-slate-700 flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                                <span>Mock Collateral:</span>
                                <span className="text-purple-400">{mockCollateral}</span>
                            </div>
                            <button
                                onClick={() => setCollateralMint(mockCollateral)}
                                className="text-[10px] text-purple-500 hover:text-purple-400 text-right uppercase font-bold"
                            >
                                ↑ Use for Loan
                            </button>
                        </div>
                        <div className="bg-slate-900 p-3 rounded-xl border border-slate-700 flex justify-between items-center">
                            <span>System USDT (PDA):</span>
                            <span className="text-emerald-400">pomt455FqnwDuTZF7QYq7PPKmbKHMoqysnLqLp5w7Un</span>
                        </div>
                    </div>

                    <div className="mt-8 pt-6 border-t border-slate-700/50">
                        <button
                            onClick={setupMocks}
                            className="w-full bg-gradient-to-r from-teal-500 to-blue-600 hover:from-teal-400 hover:to-blue-500 py-4 rounded-2xl font-bold text-lg shadow-lg shadow-teal-500/20 transition-all"
                        >
                            🚀 Setup Mock Assets (USDC & COLL)
                        </button>
                        <p className="mt-3 text-[10px] text-slate-500 text-center uppercase tracking-widest font-bold">
                            Creates Mints + ATAs + Mints 1000 tokens
                        </p>
                    </div>

                    <button onClick={showSystemInfo} className="mt-4 text-xs text-slate-500 hover:text-teal-400 underline transition w-full text-center">
                        Toggle System Address Display
                    </button>
                </div>
            </div>

            {status && (
                <div className="mt-12 p-4 bg-slate-800 border border-slate-700 rounded-2xl max-w-lg w-full">
                    <p className="text-xs font-mono break-all text-slate-400 text-center">
                        {status}
                    </p>
                </div>
            )
            }
        </main>
    );
}
