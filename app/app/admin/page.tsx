"use client";

import { useState, useEffect } from "react";
import { useAnchorProgram } from "../../hooks/useAnchorProgram";
import { AppWalletMultiButton } from "../../components/AppWalletMultiButton";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
    createMint,
    createAssociatedTokenAccount,
    mintTo,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";


export default function AdminPage() {
    const { getProgram, programId } = useAnchorProgram();
    const { connection } = useConnection();
    const wallet = useWallet();
    const [status, setStatus] = useState("");

    // Initialize State
    const [isInitialized, setIsInitialized] = useState(false);

    // Configure State
    const [collateralMint, setCollateralMint] = useState("");
    const [oracle, setOracle] = useState("");
    const [mcr, setMcr] = useState("150");
    const [ltr, setLtr] = useState("120");
    const [penalty, setPenalty] = useState("10");

    // Check if already initialized
    useEffect(() => {
        const checkInitialization = async () => {
            const program = getProgram();
            if (!program) return;

            try {
                const [globalStatePda] = PublicKey.findProgramAddressSync(
                    [Buffer.from("global_state")],
                    program.programId
                );

                // Cast to any to avoid TS error with raw IDL
                const account = await (program.account as any).globalState.fetchNullable(globalStatePda);
                if (account) {
                    setIsInitialized(true);
                    setStatus("System already initialized.");
                }
            } catch (e: any) {
                console.log("Error checking init status:", e);
            }
        };

        checkInitialization();
    }, [wallet.publicKey]);

    const initialize = async () => {
        if (isInitialized) {
            setStatus("System already initialized.");
            return;
        }

        const program = getProgram();
        if (!program || !wallet.publicKey) {
            setStatus("Wallet not connected");
            return;
        }

        try {
            setStatus("Initializing...");
            // Derive PDAs
            const [globalState] = PublicKey.findProgramAddressSync(
                [Buffer.from("global_state")],
                program.programId
            );

            const tx = await program.methods.initialize()
                .accounts({
                    // admin inferred from wallet
                } as any)
                .rpc();

            console.log("Initialize tx:", tx);
            setStatus("Initialized successfully! Tx: " + tx);
            setIsInitialized(true);
        } catch (e: any) {
            console.error(e);
            if (e.message.includes("already in use") || e.toString().includes("0x0")) {
                setStatus("System was already initialized. You can proceed.");
                setIsInitialized(true);
            } else {
                setStatus("Error: " + e.message);
            }
        }
    };

    const createMockCollateral = async () => {
        if (!wallet.publicKey || !wallet.signTransaction) {
            setStatus("Connect wallet first");
            return;
        }

        try {
            setStatus("Creating mock collateral mint...");

            const mintKeypair = Keypair.generate();
            const mint = mintKeypair.publicKey;
            console.log("New Mint:", mint.toBase58());

            const balance = await connection.getBalance(wallet.publicKey);
            if (balance < 0.1 * 10 ** 9) {
                setStatus("Insufficient SOL. Please request airdrop first.");
                return;
            }

            // Dynamic import to get helpers
            const {
                createInitializeMintInstruction,
                createAssociatedTokenAccountInstruction,
                createMintToInstruction,
                getAssociatedTokenAddressSync,
                MINT_SIZE
            } = await import("@solana/spl-token");

            const { Transaction } = await import("@solana/web3.js");

            const lamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
            const transaction = new Transaction();

            // 1. Create Mint Account
            transaction.add(
                SystemProgram.createAccount({
                    fromPubkey: wallet.publicKey,
                    newAccountPubkey: mint,
                    space: MINT_SIZE,
                    lamports,
                    programId: TOKEN_PROGRAM_ID,
                })
            );

            // 2. Initialize Mint
            transaction.add(
                createInitializeMintInstruction(
                    mint,
                    6,
                    wallet.publicKey,
                    wallet.publicKey,
                    TOKEN_PROGRAM_ID
                )
            );

            // 3. Create Associated Token Account
            const userAta = getAssociatedTokenAddressSync(
                mint,
                wallet.publicKey,
                false,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
            );

            transaction.add(
                createAssociatedTokenAccountInstruction(
                    wallet.publicKey,
                    userAta,
                    wallet.publicKey,
                    mint,
                    TOKEN_PROGRAM_ID,
                    ASSOCIATED_TOKEN_PROGRAM_ID
                )
            );

            // 4. Mint Tokens
            transaction.add(
                createMintToInstruction(
                    mint,
                    userAta,
                    wallet.publicKey,
                    1000 * 10 ** 6, // 1000 tokens
                    [],
                    TOKEN_PROGRAM_ID
                )
            );

            transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
            transaction.feePayer = wallet.publicKey;

            // Partial sign with Mint Keypair (required because we are creating it)
            transaction.partialSign(mintKeypair);

            // Sign with Wallet
            const signedTx = await wallet.signTransaction(transaction);
            const signature = await connection.sendRawTransaction(signedTx.serialize());

            setStatus("Confirming transaction...");
            await connection.confirmTransaction(signature, "confirmed");

            setStatus(`Mock Token Created! Mint: ${mint.toBase58()}`);
            setCollateralMint(mint.toBase58()); // Auto-fill input

        } catch (e: any) {
            console.error(e);
            setStatus("Error: " + e.message);
        }
    };

    const configureCollateral = async () => {
        const program = getProgram();
        if (!program || !wallet.publicKey) {
            setStatus("Wallet not connected");
            return;
        }

        try {
            setStatus("Configuring Collateral...");
            const collateralMintPubkey = new PublicKey(collateralMint);
            let oraclePubkey: PublicKey;

            if (!oracle) {
                // Mock oracle if empty
                oraclePubkey = Keypair.generate().publicKey;
                setStatus(`Using mock oracle: ${oraclePubkey.toBase58()}`);
            } else {
                oraclePubkey = new PublicKey(oracle);
            }

            const [collateralConfig] = PublicKey.findProgramAddressSync(
                [Buffer.from("collateral"), collateralMintPubkey.toBuffer()],
                program.programId
            );

            const tx = await program.methods.configureCollateral(
                collateralMintPubkey,
                oraclePubkey,
                new BN(mcr),
                new BN(ltr),
                new BN(penalty)
            ).accounts({
                collateralConfig: collateralConfig,
                admin: wallet.publicKey,
                // others inferred
            } as any).rpc();

            setStatus("Configuration Success! Tx: " + tx);

        } catch (e: any) {
            console.error(e);
            setStatus("Error: " + e.message);
        }
    };

    const requestAirdrop = async () => {
        if (!wallet.publicKey) {
            setStatus("Connect wallet first");
            return;
        }
        try {
            setStatus("Requesting airdrop...");
            const signature = await connection.requestAirdrop(
                wallet.publicKey,
                1 * 10 ** 9 // 1 SOL
            );
            await connection.confirmTransaction(signature, "confirmed");
            setStatus(`Airdrop successful! Tx: ${signature}`);
        } catch (e: any) {
            console.error(e);
            setStatus("Error requesting airdrop: " + e.message);
        }
    };

    return (
        <main className="flex min-h-screen flex-col items-center p-24 bg-slate-900 text-white">
            <div className="w-full max-w-4xl flex justify-between items-center mb-10">
                <h1 className="text-3xl font-bold">Admin Dashboard</h1>
                <div className="flex gap-4">
                    <button
                        onClick={requestAirdrop}
                        className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded transition"
                    >
                        Get Devnet SOL
                    </button>
                    <AppWalletMultiButton />
                </div>
            </div>

            <div className="w-full max-w-2xl bg-slate-800 p-8 rounded-xl shadow-lg mb-8">
                <h2 className="text-xl font-semibold mb-4 border-b border-gray-600 pb-2">1. Initialize System</h2>
                <p className="text-gray-400 mb-4">Initialize the Global State and USDT Mint. Only needs to be done once.</p>
                <button
                    onClick={initialize}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition"
                >
                    Initialize Program
                </button>
            </div>

            <div className="w-full max-w-2xl bg-slate-800 p-8 rounded-xl shadow-lg">
                <h2 className="text-xl font-semibold mb-4 border-b border-gray-600 pb-2">2. Configure Collateral</h2>
                <div className="flex flex-col gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Collateral Mint Address (e.g., SOL or USDC Mint)</label>
                        <input
                            type="text"
                            className="w-full p-2 rounded bg-slate-700 border border-slate-600 text-white"
                            placeholder="Enter Mint Address"
                            value={collateralMint}
                            onChange={(e) => setCollateralMint(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Oracle Address (Pyth/Switchboard)</label>
                        <input
                            type="text"
                            className="w-full p-2 rounded bg-slate-700 border border-slate-600 text-white"
                            placeholder="Leave empty to generate random mock"
                            value={oracle}
                            onChange={(e) => setOracle(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">MCR (%)</label>
                            <input
                                type="number"
                                className="w-full p-2 rounded bg-slate-700 border border-slate-600 text-white"
                                value={mcr}
                                onChange={(e) => setMcr(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">LTR (%)</label>
                            <input
                                type="number"
                                className="w-full p-2 rounded bg-slate-700 border border-slate-600 text-white"
                                value={ltr}
                                onChange={(e) => setLtr(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Penalty (%)</label>
                            <input
                                type="number"
                                className="w-full p-2 rounded bg-slate-700 border border-slate-600 text-white"
                                value={penalty}
                                onChange={(e) => setPenalty(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex gap-4 mt-2">
                        <button
                            onClick={configureCollateral}
                            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition"
                        >
                            Configure Collateral
                        </button>
                        <button
                            onClick={createMockCollateral}
                            className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded transition"
                        >
                            Create Mock Token
                        </button>
                    </div>
                </div>
            </div>

            {status && (
                <div className="mt-8 p-4 bg-slate-700 rounded-lg max-w-2xl w-full break-all">
                    <h3 className="font-bold mb-2">Status:</h3>
                    <p className="font-mono text-sm">{status}</p>
                </div>
            )}
        </main>
    );
}
