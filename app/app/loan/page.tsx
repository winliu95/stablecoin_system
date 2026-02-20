"use client";

import { useState, useEffect } from "react";
import { useAnchorProgram } from "../../hooks/useAnchorProgram";
import { AppWalletMultiButton } from "../../components/AppWalletMultiButton";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

export default function LoanPage() {
    const { getProgram } = useAnchorProgram();
    const { connection } = useConnection();
    const wallet = useWallet();
    const [status, setStatus] = useState("");

    // User Data
    const [position, setPosition] = useState<any>(null);
    const [collateralConfig, setCollateralConfig] = useState<any>(null);
    const [collateralBalance, setCollateralBalance] = useState("0");
    const [usdtBalance, setUsdtBalance] = useState("0");

    // Form Inputs
    const [collateralMint, setCollateralMint] = useState("");
    const [depositAmount, setDepositAmount] = useState("");
    const [mintAmount, setMintAmount] = useState("");
    const [burnAmount, setBurnAmount] = useState("");
    const [withdrawAmount, setWithdrawAmount] = useState("");

    useEffect(() => {
        if (wallet.publicKey && collateralMint) {
            fetchUserData();
        }
    }, [wallet.publicKey, collateralMint]);

    const fetchUserData = async () => {
        const program = getProgram();
        if (!program || !wallet.publicKey || !collateralMint) return;

        try {
            const mintPubkey = new PublicKey(collateralMint);

            const [configPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("collateral"), mintPubkey.toBuffer()],
                program.programId
            );
            const configAccount = await (program.account as any).collateralConfig.fetchNullable(configPda);
            setCollateralConfig(configAccount);

            const [positionPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("position"), wallet.publicKey.toBuffer(), mintPubkey.toBuffer()],
                program.programId
            );

            const posAccount = await (program.account as any).position.fetchNullable(positionPda);
            setPosition(posAccount);

            try {
                const userCollateralAta = getAssociatedTokenAddressSync(mintPubkey, wallet.publicKey);
                const collBalance = await connection.getTokenAccountBalance(userCollateralAta);
                setCollateralBalance(collBalance.value.uiAmountString || "0");
            } catch (e) { setCollateralBalance("0"); }

            try {
                const [usdtMintPda] = PublicKey.findProgramAddressSync([Buffer.from("mint")], program.programId);
                const userUsdtAta = getAssociatedTokenAddressSync(usdtMintPda, wallet.publicKey);
                const usdtBal = await connection.getTokenAccountBalance(userUsdtAta);
                setUsdtBalance(usdtBal.value.uiAmountString || "0");
            } catch (e) { setUsdtBalance("0"); }

        } catch (e) {
            console.error("Error fetching user data:", e);
        }
    };

    const handleAction = async (action: string, amount: string) => {
        const program = getProgram();
        if (!program || !wallet.publicKey || !collateralMint) return;

        try {
            setStatus(`${action}...`);
            const mintPubkey = new PublicKey(collateralMint);
            const amountBN = new BN(parseFloat(amount) * 1_000_000);

            // Explicit PDA Derivation
            const [globalState] = PublicKey.findProgramAddressSync([Buffer.from("global_state")], program.programId);
            const [usdtMint] = PublicKey.findProgramAddressSync([Buffer.from("mint")], program.programId);
            const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("collateral"), mintPubkey.toBuffer()], program.programId);
            const [positionPda] = PublicKey.findProgramAddressSync([Buffer.from("position"), wallet.publicKey.toBuffer(), mintPubkey.toBuffer()], program.programId);
            const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from("vault"), mintPubkey.toBuffer()], program.programId);
            const [vaultAuth] = PublicKey.findProgramAddressSync([Buffer.from("vault_authority")], program.programId);

            let tx = "";

            if (action === "Deposit") {
                tx = await program.methods.depositCollateral(amountBN)
                    .accounts({
                        user: wallet.publicKey,
                        collateralConfig: configPda,
                        collateralMint: mintPubkey,
                        position: positionPda,
                        vaultTokenAccount: vaultPda,
                        vaultAuthority: vaultAuth,
                        globalState: globalState,
                    } as any).rpc();
            } else if (action === "Mint") {
                tx = await program.methods.mintUsdt(amountBN)
                    .accounts({
                        owner: wallet.publicKey,
                        position: positionPda,
                        collateralConfig: configPda,
                        oracle: collateralConfig?.oracle,
                        usdtMint: usdtMint,
                        collateralMint: mintPubkey,
                        globalState: globalState,
                    } as any).rpc();
            } else if (action === "Repay") {
                tx = await program.methods.burnUsdt(amountBN)
                    .accounts({
                        owner: wallet.publicKey,
                        position: positionPda,
                        usdtMint: usdtMint,
                        collateralMint: mintPubkey,
                        globalState: globalState,
                    } as any).rpc();
            } else if (action === "Withdraw") {
                tx = await program.methods.withdrawCollateral(amountBN)
                    .accounts({
                        owner: wallet.publicKey,
                        position: positionPda,
                        collateralConfig: configPda,
                        oracle: collateralConfig?.oracle,
                        vaultTokenAccount: vaultPda,
                        vaultAuthority: vaultAuth,
                        collateralMint: mintPubkey,
                        globalState: globalState,
                    } as any).rpc();
            }

            setStatus(`${action} Success! Tx: ${tx}`);
            fetchUserData();
        } catch (e: any) {
            console.error("Loan Error:", e);
            if (e.logs) console.log("Transaction Logs:", e.logs);
            let errMsg = e.message || e.toString();
            if (errMsg.includes("Attempt to debit an account")) {
                errMsg = "Insufficient SOL fee. Please click 'Get Devnet SOL' on the Admin page!";
            } else if (errMsg.includes("AccountNotInitialized")) {
                errMsg = "CDP/Collateral is not configured. Please go to Admin page and 'Configure Collateral' first!";
            } else if (e.logs) {
                errMsg += " | Logs: " + e.logs.slice(-3).join(" ");
            }
            setStatus(`Error: ${errMsg}`);
        }
    };

    const calculateCollateralRatio = (pos: any) => {
        if (!pos || pos.debtAmount.eqn(0)) return "∞";
        const price = 150;
        const collateralVal = (pos.collateralAmount.toNumber() / 1_000_000) * price;
        const debtVal = pos.debtAmount.toNumber() / 1_000_000;
        return ((collateralVal / debtVal) * 100).toFixed(2) + "%";
    };

    return (
        <main className="flex min-h-screen flex-col items-center p-24 bg-slate-900 text-white">
            <div className="w-full max-w-4xl flex justify-between items-center mb-10">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
                    Collateralized Loan (CDP)
                </h1>
                <AppWalletMultiButton />
            </div>

            <div className="w-full max-w-2xl bg-slate-800 p-6 rounded-2xl shadow-xl mb-8 border border-slate-700">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Select Collateral Mint</label>
                <input
                    type="text"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm font-mono focus:ring-2 focus:ring-purple-500 outline-none transition"
                    placeholder="Enter Collateral Mint Address"
                    value={collateralMint}
                    onChange={(e) => setCollateralMint(e.target.value)}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl mb-8">
                <div className="bg-slate-800 p-6 rounded-2xl shadow-xl border border-blue-500/20">
                    <h2 className="text-xl font-semibold mb-4 text-blue-400">Your Wallet</h2>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center bg-slate-900/50 p-3 rounded-xl font-mono">
                            <span className="text-slate-400 text-sm">Collateral</span>
                            <span className="text-lg">{collateralBalance}</span>
                        </div>
                        <div className="flex justify-between items-center bg-slate-900/50 p-3 rounded-xl font-mono">
                            <span className="text-slate-400 text-sm">USDT</span>
                            <span className="text-lg text-emerald-400">{usdtBalance}</span>
                        </div>
                    </div>
                </div>

                <div className="bg-slate-800 p-6 rounded-2xl shadow-xl border border-purple-500/20">
                    <h2 className="text-xl font-semibold mb-4 text-purple-400">Position Health</h2>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-900/50 p-3 rounded-xl">
                                <p className="text-xs text-slate-500 mb-1">Deposited</p>
                                <p className="font-mono">{position ? position.collateralAmount.toNumber() / 1_000_000 : 0}</p>
                            </div>
                            <div className="bg-slate-900/50 p-3 rounded-xl">
                                <p className="text-xs text-slate-500 mb-1">Debt</p>
                                <p className="font-mono text-rose-400">{position ? position.debtAmount.toNumber() / 1_000_000 : 0}</p>
                            </div>
                        </div>
                        <div className="pt-4 border-t border-slate-700 flex justify-between items-center">
                            <div>
                                <p className="text-xs text-slate-500">Collateral Ratio</p>
                                <p className="text-2xl font-bold font-mono text-purple-400">{calculateCollateralRatio(position)}</p>
                            </div>
                            <div className={`px-3 py-1 rounded-full text-xs font-bold ${position?.isFrozen ? "bg-rose-500/20 text-rose-500" : "bg-emerald-500/20 text-emerald-500"}`}>
                                {position?.isFrozen ? "FROZEN" : "HEALTHY"}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
                <div className="bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-700">
                    <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                        <div className="w-2 h-6 bg-emerald-500 rounded-full"></div>
                        Open / Increase Position
                    </h3>
                    <div className="space-y-6">
                        <div>
                            <p className="text-xs text-slate-500 mb-2">Deposit Collateral</p>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl p-3 font-mono outline-none focus:ring-2 focus:ring-emerald-500"
                                    placeholder="0.00"
                                    value={depositAmount}
                                    onChange={(e) => setDepositAmount(e.target.value)}
                                />
                                <button onClick={() => handleAction("Deposit", depositAmount)} className="bg-emerald-600 hover:bg-emerald-500 px-4 rounded-xl font-bold transition">Deposit</button>
                            </div>
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 mb-1">Mint USDT (Loan)</p>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl p-3 font-mono outline-none focus:ring-2 focus:ring-teal-500"
                                    placeholder="0.00"
                                    value={mintAmount}
                                    onChange={(e) => setMintAmount(e.target.value)}
                                />
                                <button onClick={() => handleAction("Mint", mintAmount)} className="bg-teal-600 hover:bg-teal-500 px-4 rounded-xl font-bold transition">Mint</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-700">
                    <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                        <div className="w-2 h-6 bg-rose-500 rounded-full"></div>
                        Repay / Close Position
                    </h3>
                    <div className="space-y-6">
                        <div>
                            <p className="text-xs text-slate-500 mb-2">Repay USDT Debt</p>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl p-3 font-mono outline-none focus:ring-2 focus:ring-amber-500"
                                    placeholder="0.00"
                                    value={burnAmount}
                                    onChange={(e) => setBurnAmount(e.target.value)}
                                />
                                <button onClick={() => handleAction("Repay", burnAmount)} className="bg-amber-600 hover:bg-amber-500 px-4 rounded-xl font-bold transition">Repay</button>
                            </div>
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 mb-2">Withdraw Collateral</p>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl p-3 font-mono outline-none focus:ring-2 focus:ring-rose-500"
                                    placeholder="0.00"
                                    value={withdrawAmount}
                                    onChange={(e) => setWithdrawAmount(e.target.value)}
                                />
                                <button onClick={() => handleAction("Withdraw", withdrawAmount)} className="bg-rose-600 hover:bg-rose-500 px-4 rounded-xl font-bold transition">Withdraw</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {status && (
                <div className="mt-12 p-4 bg-slate-900/80 border border-slate-700 rounded-2xl max-w-lg w-full text-center">
                    <p className="text-xs font-mono break-all text-slate-400">
                        {status}
                    </p>
                </div>
            )}
        </main>
    );
}
