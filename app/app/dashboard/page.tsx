"use client";

import { useState, useEffect } from "react";
import { useAnchorProgram } from "../../hooks/useAnchorProgram";
import { AppWalletMultiButton } from "../../components/AppWalletMultiButton";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";

export default function DashboardPage() {
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

            // Fetch Collateral Config
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

            // Fetch Token Balances
            const userCollateralAta = getAssociatedTokenAddressSync(mintPubkey, wallet.publicKey);
            try {
                const collBalance = await connection.getTokenAccountBalance(userCollateralAta);
                setCollateralBalance(collBalance.value.uiAmountString || "0");
            } catch (e) { setCollateralBalance("0"); }

            const [usdtMintPda] = PublicKey.findProgramAddressSync([Buffer.from("mint")], program.programId);
            const userUsdtAta = getAssociatedTokenAddressSync(usdtMintPda, wallet.publicKey);
            try {
                const usdtBal = await connection.getTokenAccountBalance(userUsdtAta);
                setUsdtBalance(usdtBal.value.uiAmountString || "0");
            } catch (e) { setUsdtBalance("0"); }

        } catch (e) {
            console.error("Error fetching user data:", e);
        }
    };

    const deposit = async () => {
        const program = getProgram();
        if (!program || !wallet.publicKey || !collateralMint) return;
        try {
            setStatus("Depositing...");
            const mintPubkey = new PublicKey(collateralMint);
            const amount = new BN(parseFloat(depositAmount) * 10 ** 6);

            const tx = await program.methods.depositCollateral(amount)
                .accounts({
                    user: wallet.publicKey,
                    collateralMint: mintPubkey,
                    // PDAs usually inferred by Anchor if metadata is correct, 
                    // otherwise we pass them manually.
                } as any)
                .rpc();

            setStatus(`Deposit Success! Tx: ${tx}`);
            fetchUserData();
        } catch (e: any) {
            setStatus(`Error: ${e.message}`);
        }
    };

    const mint = async () => {
        const program = getProgram();
        if (!program || !wallet.publicKey || !collateralMint) return;
        try {
            setStatus("Minting USDT...");
            const mintPubkey = new PublicKey(collateralMint);
            const amount = new BN(parseFloat(mintAmount) * 10 ** 6);

            const tx = await program.methods.mintUsdt(amount)
                .accounts({
                    user: wallet.publicKey,
                    collateralMint: mintPubkey,
                    oracle: collateralConfig?.oracle,
                } as any)
                .rpc();

            setStatus(`Mint Success! Tx: ${tx}`);
            fetchUserData();
        } catch (e: any) {
            setStatus(`Error: ${e.message}`);
        }
    };

    const burn = async () => {
        const program = getProgram();
        if (!program || !wallet.publicKey || !collateralMint) return;
        try {
            setStatus("Burning USDT...");
            const mintPubkey = new PublicKey(collateralMint);
            const amount = new BN(parseFloat(burnAmount) * 10 ** 6);

            const tx = await program.methods.burnUsdt(amount)
                .accounts({
                    owner: wallet.publicKey,
                    collateralMint: mintPubkey,
                } as any)
                .rpc();

            setStatus(`Burn Success! Tx: ${tx}`);
            fetchUserData();
        } catch (e: any) {
            setStatus(`Error: ${e.message}`);
        }
    };

    const withdraw = async () => {
        const program = getProgram();
        if (!program || !wallet.publicKey || !collateralMint) return;
        try {
            setStatus("Withdrawing...");
            const mintPubkey = new PublicKey(collateralMint);
            const amount = new BN(parseFloat(withdrawAmount) * 10 ** 6);

            const tx = await program.methods.withdrawCollateral(amount)
                .accounts({
                    user: wallet.publicKey,
                    collateralMint: mintPubkey,
                    oracle: collateralConfig?.oracle,
                } as any)
                .rpc();

            setStatus(`Withdraw Success! Tx: ${tx}`);
            fetchUserData();
        } catch (e: any) {
            setStatus(`Error: ${e.message}`);
        }
    };

    return (
        <main className="flex min-h-screen flex-col items-center p-24 bg-slate-900 text-white">
            <div className="w-full max-w-4xl flex justify-between items-center mb-10">
                <h1 className="text-3xl font-bold">User Dashboard</h1>
                <AppWalletMultiButton />
            </div>

            {/* Collateral Selection */}
            <div className="w-full max-w-2xl bg-slate-800 p-6 rounded-xl shadow-lg mb-8">
                <label className="block text-sm font-medium mb-2">Select Collateral Mint</label>
                <input
                    type="text"
                    className="w-full p-2 rounded bg-slate-700 border border-slate-600 text-white"
                    placeholder="Enter Collateral Mint Address"
                    value={collateralMint}
                    onChange={(e) => setCollateralMint(e.target.value)}
                />
            </div>

            {/* Account Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl mb-8">
                <div className="bg-slate-800 p-6 rounded-xl shadow-lg border border-blue-500/30">
                    <h2 className="text-xl font-semibold mb-4 text-blue-400">Your Wallet</h2>
                    <div className="space-y-2">
                        <p>Collateral Balance: <span className="font-mono text-lg">{collateralBalance}</span> tokens</p>
                        <p>USDT Balance: <span className="font-mono text-lg text-green-400">{usdtBalance}</span> USDT</p>
                    </div>
                </div>

                <div className="bg-slate-800 p-6 rounded-xl shadow-lg border border-purple-500/30">
                    <h2 className="text-xl font-semibold mb-4 text-purple-400">Your Position</h2>
                    <div className="space-y-2">
                        <p>Deposited: <span className="font-mono text-lg">{position ? position.collateralAmount.toNumber() / 1_000_000 : 0}</span> tokens</p>
                        <p>Debt (Minted): <span className="font-mono text-lg text-red-400">{position ? position.debtAmount.toNumber() / 1_000_000 : 0}</span> USDT</p>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
                {/* Deposit & Mint */}
                <div className="bg-slate-800 p-6 rounded-xl shadow-lg">
                    <h2 className="text-xl font-semibold mb-4 border-b border-gray-600 pb-2">Deposit & Mint</h2>
                    <div className="space-y-4">
                        <div>
                            <input
                                type="number"
                                className="w-full p-2 rounded bg-slate-700 border border-slate-600 mb-2"
                                placeholder="Amount to deposit"
                                value={depositAmount}
                                onChange={(e) => setDepositAmount(e.target.value)}
                            />
                            <button onClick={deposit} className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded font-bold">Deposit Collateral</button>
                        </div>
                        <div>
                            <input
                                type="number"
                                className="w-full p-2 rounded bg-slate-700 border border-slate-600 mb-2"
                                placeholder="Amount to mint"
                                value={mintAmount}
                                onChange={(e) => setMintAmount(e.target.value)}
                            />
                            <button onClick={mint} className="w-full bg-green-600 hover:bg-green-700 py-2 rounded font-bold">Mint USDT</button>
                        </div>
                    </div>
                </div>

                {/* Burn & Withdraw */}
                <div className="bg-slate-800 p-6 rounded-xl shadow-lg">
                    <h2 className="text-xl font-semibold mb-4 border-b border-gray-600 pb-2">Repay & Withdraw</h2>
                    <div className="space-y-4">
                        <div>
                            <input
                                type="number"
                                className="w-full p-2 rounded bg-slate-700 border border-slate-600 mb-2"
                                placeholder="Amount to repay (burn)"
                                value={burnAmount}
                                onChange={(e) => setBurnAmount(e.target.value)}
                            />
                            <button onClick={burn} className="w-full bg-yellow-600 hover:bg-yellow-700 py-2 rounded font-bold">Repay USDT</button>
                        </div>
                        <div>
                            <input
                                type="number"
                                className="w-full p-2 rounded bg-slate-700 border border-slate-600 mb-2"
                                placeholder="Amount to withdraw"
                                value={withdrawAmount}
                                onChange={(e) => setWithdrawAmount(e.target.value)}
                            />
                            <button onClick={withdraw} className="w-full bg-red-600 hover:bg-red-700 py-2 rounded font-bold">Withdraw Collateral</button>
                        </div>
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
