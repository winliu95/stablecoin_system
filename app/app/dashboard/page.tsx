"use client";

import { useState, useEffect } from "react";
import { useAnchorProgram } from "../../hooks/useAnchorProgram";
import { AppWalletMultiButton } from "../../components/AppWalletMultiButton";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";

export default function SwapPage() {
    const { getProgram } = useAnchorProgram();
    const { connection } = useConnection();
    const wallet = useWallet();
    const [status, setStatus] = useState("");

    // PSM Data
    const [usdcMint, setUsdcMint] = useState(""); // User should input the USDC mint address configured in Admin
    const [usdcBalance, setUsdcBalance] = useState("0");
    const [usdtBalance, setUsdtBalance] = useState("0");
    const [psmConfig, setPsmConfig] = useState<any>(null);

    // Swap Form
    const [swapAmount, setSwapAmount] = useState("");
    const [direction, setDirection] = useState<"USDC_TO_USDT" | "USDT_TO_USDC">("USDC_TO_USDT");

    useEffect(() => {
        if (wallet.publicKey && usdcMint) {
            fetchData();
        }
    }, [wallet.publicKey, usdcMint]);

    const fetchData = async () => {
        const program = getProgram();
        if (!program || !wallet.publicKey || !usdcMint) return;

        try {
            const usdcMintPubkey = new PublicKey(usdcMint);

            // 1. Fetch PSM Config
            const [psmConfigPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("psm"), usdcMintPubkey.toBuffer()],
                program.programId
            );
            const config = await (program.account as any).psmConfig.fetchNullable(psmConfigPda);
            setPsmConfig(config);

            // 2. Fetch User USDC Balance
            try {
                const userUsdcAta = getAssociatedTokenAddressSync(usdcMintPubkey, wallet.publicKey);
                const bal = await connection.getTokenAccountBalance(userUsdcAta);
                setUsdcBalance(bal.value.uiAmountString || "0");
            } catch (e) { setUsdcBalance("0"); }

            // 3. Fetch User USDT Balance
            const [usdtMintPda] = PublicKey.findProgramAddressSync([Buffer.from("mint")], program.programId);
            try {
                const userUsdtAta = getAssociatedTokenAddressSync(usdtMintPda, wallet.publicKey);
                const bal = await connection.getTokenAccountBalance(userUsdtAta);
                setUsdtBalance(bal.value.uiAmountString || "0");
            } catch (e) { setUsdtBalance("0"); }

        } catch (e) {
            console.error("Error fetching PSM data:", e);
        }
    };

    const handleSwap = async () => {
        const program = getProgram();
        if (!program || !wallet.publicKey || !usdcMint) {
            setStatus("Please connect wallet and enter USDC mint address");
            return;
        }

        try {
            const amountBN = new BN(parseFloat(swapAmount) * 1_000_000);
            const usdcMintPubkey = new PublicKey(usdcMint);
            const [usdtMint] = PublicKey.findProgramAddressSync([Buffer.from("mint")], program.programId);
            const [globalState] = PublicKey.findProgramAddressSync([Buffer.from("global_state")], program.programId);
            const [psmVault] = PublicKey.findProgramAddressSync([Buffer.from("psm_vault"), usdcMintPubkey.toBuffer()], program.programId);
            const [psmConfigPda] = PublicKey.findProgramAddressSync([Buffer.from("psm"), usdcMintPubkey.toBuffer()], program.programId);

            if (direction === "USDC_TO_USDT") {
                setStatus("Swapping USDC to USDT...");
                const tx = await program.methods.swapUsdcToUsdt(amountBN)
                    .accounts({
                        user: wallet.publicKey,
                        psmConfig: psmConfigPda,
                        tokenMint: usdcMintPubkey,
                        psmVault: psmVault,
                        usdtMint: usdtMint,
                        globalState: globalState,
                        tokenProgram: TOKEN_PROGRAM_ID,
                        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                        systemProgram: SystemProgram.programId,
                    } as any).rpc();
                setStatus(`Success! Swapped ${swapAmount} USDC to USDT. Tx: ${tx}`);
            } else {
                setStatus("Swapping USDT to USDC...");
                const tx = await program.methods.swapUsdtToUsdc(amountBN)
                    .accounts({
                        user: wallet.publicKey,
                        psmConfig: psmConfigPda,
                        tokenMint: usdcMintPubkey,
                        psmVault: psmVault,
                        usdtMint: usdtMint,
                        globalState: globalState,
                        tokenProgram: TOKEN_PROGRAM_ID,
                        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                        systemProgram: SystemProgram.programId,
                    } as any).rpc();
                setStatus(`Success! Swapped ${swapAmount} USDT to USDC. Tx: ${tx}`);
            }
            fetchData();
        } catch (e: any) {
            console.error(e);
            setStatus(`Swap failed: ${e.message}`);
        }
    };

    return (
        <main className="flex min-h-screen flex-col items-center p-24 bg-slate-900 text-white">
            <div className="w-full max-lg mb-12 flex justify-between items-center">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-teal-400 to-blue-500 bg-clip-text text-transparent">
                    Stablecoin Swap (PSM)
                </h1>
                <AppWalletMultiButton />
            </div>

            <div className="w-full max-w-md bg-slate-800 rounded-3xl p-8 shadow-2xl border border-slate-700">
                {/* Configuration / USDC Mint Input */}
                <div className="mb-6">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        USDC Mint Address
                    </label>
                    <input
                        type="text"
                        placeholder="Enter the address from Admin page"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm font-mono focus:ring-2 focus:ring-teal-500 outline-none transition"
                        value={usdcMint}
                        onChange={(e) => setUsdcMint(e.target.value)}
                    />
                </div>

                {/* Balances */}
                <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700/50">
                        <p className="text-xs text-slate-500 mb-1">Your USDC</p>
                        <p className="text-xl font-bold font-mono">{usdcBalance}</p>
                    </div>
                    <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-700/50">
                        <p className="text-xs text-slate-500 mb-1">Your USDT</p>
                        <p className="text-xl font-bold font-mono text-teal-400">{usdtBalance}</p>
                    </div>
                </div>

                {/* Swap UI */}
                <div className="space-y-4">
                    <div className="relative bg-slate-900 p-4 rounded-2xl border border-slate-700">
                        <p className="text-xs text-slate-500 mb-2">{direction === "USDC_TO_USDT" ? "From USDC" : "From USDT"}</p>
                        <input
                            type="number"
                            placeholder="0.00"
                            className="w-full bg-transparent text-2xl font-bold outline-none font-mono"
                            value={swapAmount}
                            onChange={(e) => setSwapAmount(e.target.value)}
                        />
                    </div>

                    <div className="flex justify-center -my-2 relative z-10">
                        <button
                            onClick={() => setDirection(d => d === "USDC_TO_USDT" ? "USDT_TO_USDC" : "USDC_TO_USDT")}
                            className="bg-slate-700 hover:bg-slate-600 p-2 rounded-full border-4 border-slate-800 transition"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                            </svg>
                        </button>
                    </div>

                    <div className="relative bg-slate-900 p-4 rounded-2xl border border-slate-700">
                        <p className="text-xs text-slate-500 mb-2">{direction === "USDC_TO_USDT" ? "To USDT (Expected)" : "To USDC (Expected)"}</p>
                        <p className="text-2xl font-bold font-mono text-slate-400">
                            {swapAmount || "0.00"}
                        </p>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded-md">
                            1:1 Peg
                        </div>
                    </div>

                    <button
                        onClick={handleSwap}
                        disabled={!swapAmount || parseFloat(swapAmount) <= 0}
                        className="w-full bg-gradient-to-r from-teal-500 to-blue-600 hover:from-teal-400 hover:to-blue-500 py-4 rounded-2xl font-bold text-lg shadow-lg shadow-teal-500/20 transition-all disabled:opacity-50 disabled:grayscale"
                    >
                        Swap Assets
                    </button>
                </div>

                {/* Fee Info */}
                {psmConfig && (
                    <div className="mt-6 p-4 bg-teal-500/5 rounded-xl border border-teal-500/10 text-center">
                        <p className="text-xs text-teal-400">
                            PSM Fee: {psmConfig.feeBasisPoints.toNumber() / 100}% | Total Minted: {psmConfig.totalMinted.toNumber() / 1_000_000} USDT
                        </p>
                    </div>
                )}
            </div>

            {status && (
                <div className="mt-8 p-4 bg-slate-900/80 border border-slate-700 rounded-2xl max-w-md w-full">
                    <p className="text-xs font-mono break-all text-slate-400">
                        <span className="text-teal-500 font-bold mr-2">Status:</span>
                        {status}
                    </p>
                </div>
            )}
        </main>
    );
}
