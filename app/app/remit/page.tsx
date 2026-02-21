"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAnchorProgram } from "../../hooks/useAnchorProgram";
import { AppWalletMultiButton } from "../../components/AppWalletMultiButton";
import { PublicKey, SystemProgram, Transaction, Keypair } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
    getAssociatedTokenAddressSync,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createTransferInstruction,
    createTransferCheckedInstruction,
    createAssociatedTokenAccountInstruction
} from "@solana/spl-token";
import {
    ArrowRight,
    Globe,
    Landmark,
    Send,
    TrendingUp,
    CheckCircle2,
    AlertCircle,
    ChevronRight,
    ChevronLeft,
    DollarSign,
    Milestone
} from "lucide-react";

export default function RemitWizard() {
    const { getProgram } = useAnchorProgram();
    const { connection } = useConnection();
    const wallet = useWallet();
    const [step, setStep] = useState(1);
    const [status, setStatus] = useState("");
    const [loading, setLoading] = useState(false);

    // Form States
    const [usdcMint, setUsdcMint] = useState("Eu5sxWCpeYewZDE5Xy5wmBx3TNKjTL6ZYPWNRKMz3Dwm"); // Default to common mock
    const [amount, setAmount] = useState("");
    const [recipient, setRecipient] = useState("");
    const [receiverKeypair, setReceiverKeypair] = useState<Keypair | null>(null);
    const [txHash, setTxHash] = useState("");

    // Initialize Receiver Keypair from LocalStorage on mount
    useEffect(() => {
        const storedKey = localStorage.getItem("demoReceiverPrivateKey");
        if (storedKey) {
            try {
                const secretKey = Uint8Array.from(JSON.parse(storedKey));
                const keypair = Keypair.fromSecretKey(secretKey);
                setReceiverKeypair(keypair);
                setRecipient(keypair.publicKey.toBase58());
            } catch (e) {
                console.error("Failed to load stored receiver keypair", e);
            }
        }
    }, []);

    const generateNewReceiver = async () => {
        const kp = Keypair.generate();
        const secretArr = Array.from(kp.secretKey);
        localStorage.setItem("demoReceiverPrivateKey", JSON.stringify(secretArr));
        setReceiverKeypair(kp);
        setRecipient(kp.publicKey.toBase58());
        setStatus("Generated New US Receiver Wallet: " + kp.publicKey.toBase58());

        // Attempt to auto-airdrop SOL to the new receiver for fees
        try {
            setStatus("Airdropping 1 SOL to new receiver for fees...");
            const airdropTx = await connection.requestAirdrop(kp.publicKey, 1_000_000_000);
            await connection.confirmTransaction(airdropTx, "confirmed");
            setStatus("Receiver Wallet Ready! (1 SOL received)");
        } catch (e) {
            console.log("Airdrop limit reached or failed (localnet might skip this)", e);
            setStatus("New Receiver Generated. (Airdrop failed, make sure testnet has SOL or use Admin page)");
        }
    };

    // Balances & Exchange Rate
    const [twdBalance, setTwdBalance] = useState("0");
    const [usdtBalance, setUsdtBalance] = useState("0");
    const [receiverUsdtBalance, setReceiverUsdtBalance] = useState("0");
    const [receiverUsdBalance, setReceiverUsdBalance] = useState("0");
    const [psmOracle, setPsmOracle] = useState<PublicKey | null>(null);
    const [exchangeRate, setExchangeRate] = useState<number | null>(null);

    useEffect(() => {
        if (wallet.publicKey) {
            updateBalances();
        }
    }, [wallet.publicKey, usdcMint]);

    const updateBalances = async () => {
        if (!wallet.publicKey || !usdcMint) return;
        try {
            const program = getProgram();
            if (!program) return;
            const usdcMintPubkey = new PublicKey(usdcMint);
            const [usdtMint] = PublicKey.findProgramAddressSync([Buffer.from("mint")], program.programId);

            // Fetch Oracle & Price
            try {
                const [psmConfigPda] = PublicKey.findProgramAddressSync([Buffer.from("psm"), usdcMintPubkey.toBuffer()], program.programId);
                const psmConfigData = await program.account.psmConfig.fetch(psmConfigPda);
                setPsmOracle(psmConfigData.oracle);

                const oracleAcc = await connection.getAccountInfo(psmConfigData.oracle);
                if (oracleAcc) {
                    const priceBuf = oracleAcc.data.slice(8, 16);
                    const price = new BN(priceBuf, 'le').toNumber();
                    setExchangeRate(price / 1_000_000);
                }
            } catch (e) {
                console.log("PSM not configured or Oracle missing for this mint.");
            }

            // Fetch User Mock TWD (USDC)
            try {
                const ata = getAssociatedTokenAddressSync(usdcMintPubkey, wallet.publicKey);
                const bal = await connection.getTokenAccountBalance(ata);
                setTwdBalance(bal.value.uiAmountString || "0");
            } catch (e) { setTwdBalance("0"); }

            // Fetch User USDT
            try {
                const ata = getAssociatedTokenAddressSync(usdtMint, wallet.publicKey);
                const bal = await connection.getTokenAccountBalance(ata);
                setUsdtBalance(bal.value.uiAmountString || "0");
            } catch (e) { setUsdtBalance("0"); }

            // If we have a recipient, fetch their balances too
            if (recipient) {
                try {
                    const recipientPubkey = new PublicKey(recipient);

                    try {
                        const usdtAta = getAssociatedTokenAddressSync(usdtMint, recipientPubkey);
                        const bal = await connection.getTokenAccountBalance(usdtAta);
                        setReceiverUsdtBalance(bal.value.uiAmountString || "0");
                    } catch (e) { setReceiverUsdtBalance("0"); }

                    try {
                        const usdcAta = getAssociatedTokenAddressSync(usdcMintPubkey, recipientPubkey);
                        const balUsdc = await connection.getTokenAccountBalance(usdcAta);
                        setReceiverUsdBalance(balUsdc.value.uiAmountString || "0");
                    } catch (e) { setReceiverUsdBalance("0"); }

                } catch (e) {
                    // Invalid public key format
                    setReceiverUsdtBalance("0");
                    setReceiverUsdBalance("0");
                }
            }
        } catch (e) {
            console.error("Balance fetch error:", e);
        }
    };

    const handleMint = async () => {
        const program = getProgram();
        if (!program || !wallet.publicKey || !amount) return;
        setLoading(true);
        setStatus("Processing Taiwan Deposit (TWD to USDT)...");
        try {
            const amountBN = new BN(parseFloat(amount) * 1_000_000);
            const usdcMintPubkey = new PublicKey(usdcMint);
            const [usdtMint] = PublicKey.findProgramAddressSync([Buffer.from("mint")], program.programId);
            const [globalState] = PublicKey.findProgramAddressSync([Buffer.from("global_state")], program.programId);
            const [psmVault] = PublicKey.findProgramAddressSync([Buffer.from("psm_vault"), usdcMintPubkey.toBuffer()], program.programId);
            const [psmConfig] = PublicKey.findProgramAddressSync([Buffer.from("psm"), usdcMintPubkey.toBuffer()], program.programId);
            const [psmAuthority] = PublicKey.findProgramAddressSync([Buffer.from("psm_authority")], program.programId);

            const userUsdcAta = getAssociatedTokenAddressSync(usdcMintPubkey, wallet.publicKey);
            const userUsdtAta = getAssociatedTokenAddressSync(usdtMint, wallet.publicKey);

            if (!psmOracle) throw new Error("PSM Oracle not found. Please wait for balance refresh or configure PSM.");

            const tx = await program.methods.swapUsdcToUsdt(amountBN)
                .accounts({
                    user: wallet.publicKey,
                    psmConfig,
                    tokenMint: usdcMintPubkey,
                    oracle: psmOracle,
                    psmVault: psmVault,
                    userTokenAccount: userUsdcAta,
                    usdtMint,
                    userUsdtAccount: userUsdtAta,
                    psmAuthority,
                    globalState,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                } as any).rpc();

            setStatus(`Mint Success! Confirmed on-chain.`);
            setTxHash(tx);
            await updateBalances();
            setTimeout(() => setStep(2), 1500);
        } catch (e: any) {
            setStatus("Mint failed: " + (e.message || e.toString()));
        } finally {
            setLoading(false);
        }
    };

    const handleTransfer = async () => {
        if (!wallet.publicKey || !recipient || !amount) return;
        setLoading(true);
        setStatus("Initiating Cross-Border Transfer...");
        try {
            const program = getProgram();
            if (!program) return;
            const [usdtMint] = PublicKey.findProgramAddressSync([Buffer.from("mint")], program.programId);
            const senderAta = getAssociatedTokenAddressSync(usdtMint, wallet.publicKey);
            const receiverAta = getAssociatedTokenAddressSync(usdtMint, new PublicKey(recipient));

            const transaction = new Transaction();

            // Check if receiver ATA exists, if not, add creation instruction
            const info = await connection.getAccountInfo(receiverAta);
            if (!info) {
                transaction.add(
                    createAssociatedTokenAccountInstruction(
                        wallet.publicKey,
                        receiverAta,
                        new PublicKey(recipient),
                        usdtMint
                    )
                );
            }

            transaction.add(
                createTransferCheckedInstruction(
                    senderAta,
                    usdtMint,
                    receiverAta,
                    wallet.publicKey,
                    BigInt(Math.floor(parseFloat(amount) * 1_000_000)),
                    6 // USDT decimals (defined as 6 in the contract config)
                )
            );

            // Explicitly set blockhash and feePayer to avoid "Unexpected error" in some adapters
            const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = wallet.publicKey;

            console.log("Transfer Transaction Debug:", {
                sender: wallet.publicKey.toBase58(),
                recipient: recipient,
                senderAta: senderAta.toBase58(),
                receiverAta: receiverAta.toBase58(),
                amount: amount,
                usdtMint: usdtMint.toBase58(),
                blockhash
            });

            // 1. Simulate the transaction first to catch logic errors
            try {
                const simulation = await connection.simulateTransaction(transaction);
                console.log("Transfer Simulation Result:", simulation);
                if (simulation.value.err) {
                    console.error("Simulation Error Details:", simulation.value.err);
                    throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}`);
                }
            } catch (simError) {
                console.error("Simulation call failed:", simError);
            }

            // 2. Sign and send the transaction manually to bypass wallet internal RPC routing issues on localnet
            if (!wallet.signTransaction) {
                throw new Error("Wallet does not support signTransaction");
            }
            const signedTx = await wallet.signTransaction(transaction);
            const txSignature = await connection.sendRawTransaction(signedTx.serialize({ requireAllSignatures: false }));
            console.log("Transaction sent via manual broadcast, awaiting confirmation:", txSignature);

            await connection.confirmTransaction({
                signature: txSignature,
                blockhash,
                lastValidBlockHeight
            }, "confirmed");

            setStatus("Transfer Complete! Funds are now in the US.");
            setTxHash(txSignature);
            await updateBalances();
            setTimeout(() => setStep(3), 1500);
        } catch (e: any) {
            console.error("Transfer Full Error Object:", e);
            let msg = e.message || e.toString();
            if (e.logs) {
                console.log("Transaction Logs from Error:", e.logs);
                msg += " | Logs: " + e.logs.slice(-3).join(" ");
            }
            // Check for specific wallet errors
            if (msg.includes("User rejected")) {
                msg = "Transaction was rejected by user in wallet.";
            } else if (msg.includes("Transaction simulation failed")) {
                msg = "Blockchain simulation failed. This usually means insufficient funds or invalid accounts.";
            }
            setStatus("Transfer failed: " + msg);
        } finally {
            setLoading(false);
        }
    };

    const handleRedeem = async () => {
        const program = getProgram();
        if (!program || !wallet.publicKey || !amount) return;

        // Determine if we are redeeming on behalf of the Built-in Receiver Wallet
        const isLocalReceiver = receiverKeypair && receiverKeypair.publicKey.toBase58() === recipient;
        const actingUserPubkey = isLocalReceiver ? receiverKeypair.publicKey : wallet.publicKey;

        setLoading(true);
        setStatus(`Processing USA Withdrawal for ${isLocalReceiver ? "Demo Wallet" : "Your Wallet"}...`);

        try {
            const amountBN = new BN(parseFloat(amount) * 1_000_000);
            const usdcMintPubkey = new PublicKey(usdcMint);
            const [usdtMint] = PublicKey.findProgramAddressSync([Buffer.from("mint")], program.programId);
            const [globalState] = PublicKey.findProgramAddressSync([Buffer.from("global_state")], program.programId);
            const [psmVault] = PublicKey.findProgramAddressSync([Buffer.from("psm_vault"), usdcMintPubkey.toBuffer()], program.programId);
            const [psmConfig] = PublicKey.findProgramAddressSync([Buffer.from("psm"), usdcMintPubkey.toBuffer()], program.programId);
            const [psmAuthority] = PublicKey.findProgramAddressSync([Buffer.from("psm_authority")], program.programId);

            const userUsdcAta = getAssociatedTokenAddressSync(usdcMintPubkey, actingUserPubkey);
            const userUsdtAta = getAssociatedTokenAddressSync(usdtMint, actingUserPubkey);

            let txSignature = "";

            if (!psmOracle) throw new Error("PSM Oracle not found.");

            if (isLocalReceiver) {
                // If using the built-in wallet, we must build and sign the Tx manually with the keypair
                const ix = await program.methods.swapUsdtToUsdc(amountBN)
                    .accounts({
                        user: actingUserPubkey,
                        psmConfig,
                        tokenMint: usdcMintPubkey,
                        oracle: psmOracle,
                        psmVault,
                        userTokenAccount: userUsdcAta,
                        usdtMint,
                        userUsdtAccount: userUsdtAta,
                        globalState,
                        psmAuthority,
                        tokenProgram: TOKEN_PROGRAM_ID,
                        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                        systemProgram: SystemProgram.programId,
                    } as any).instruction();

                const transaction = new Transaction().add(ix);
                const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
                transaction.recentBlockhash = blockhash;
                transaction.feePayer = receiverKeypair.publicKey; // The initialized receiver must have SOL
                transaction.sign(receiverKeypair);

                txSignature = await connection.sendRawTransaction(transaction.serialize());
                await connection.confirmTransaction({ signature: txSignature, blockhash, lastValidBlockHeight }, "confirmed");

            } else {
                // Standard mode: user signs with their browser wallet
                txSignature = await program.methods.swapUsdtToUsdc(amountBN)
                    .accounts({
                        user: actingUserPubkey,
                        psmConfig,
                        tokenMint: usdcMintPubkey,
                        oracle: psmOracle,
                        psmVault,
                        userTokenAccount: userUsdcAta,
                        usdtMint,
                        userUsdtAccount: userUsdtAta,
                        globalState,
                        psmAuthority,
                        tokenProgram: TOKEN_PROGRAM_ID,
                        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                        systemProgram: SystemProgram.programId,
                    } as any).rpc();
            }

            setStatus("Redeem Success! Cross-border flow finished.");
            setTxHash(txSignature);
            await updateBalances();
            setTimeout(() => setStep(4), 2000);
        } catch (e: any) {
            console.error("Redeem Full Error Object:", e);
            let msg = e.message || e.toString();
            if (e.logs) {
                console.log("Transaction Logs from Error:", e.logs);
                msg += " | Logs: " + e.logs.slice(-3).join(" ");
            }
            setStatus("Redeem failed: " + msg);
        } finally {
            setLoading(false);
        }
    };

    const handleQuickSetup = async () => {
        if (!wallet.publicKey || !wallet.signTransaction) {
            setStatus("Please connect your wallet first");
            return;
        }
        setLoading(true);
        setStatus("Running quick setup (Airdrop + Mock Tokens)...");
        try {
            // Airdrop
            try {
                const airdropTx = await connection.requestAirdrop(wallet.publicKey, 1_000_000_000);
                await connection.confirmTransaction(airdropTx);
            } catch (e) {
                console.log("Airdrop limit reached or failed, skipping...");
            }

            // Create Mints (Simplified logic like Admin page)
            setStatus("Check Admin page to setup specific Mints, or use existing one.");
            setStatus("Quick Setup finished. Please ensure you have TWD in your wallet!");
            await updateBalances();
        } catch (e: any) {
            setStatus("Setup failed: " + e.toString());
        } finally {
            setLoading(false);
        }
    };

    const steps = [
        { id: 1, title: "Taiwan Leg", icon: <Landmark className="w-5 h-5" /> },
        { id: 2, title: "Transfer", icon: <Globe className="w-5 h-5" /> },
        { id: 3, title: "US Leg", icon: <DollarSign className="w-5 h-5" /> },
        { id: 4, title: "Completed", icon: <CheckCircle2 className="w-5 h-5" /> },
    ];

    return (
        <main className="flex min-h-screen flex-col items-center p-8 md:p-24 bg-[#0b0f1a] text-white overflow-hidden">
            <div className="w-full max-w-4xl mb-12">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-teal-400 to-blue-500 bg-clip-text text-transparent">
                            RemitFlow Wizard
                        </h1>
                        <p className="text-slate-400 mt-2">Guided cross-border remittance simulation</p>
                    </div>
                    <AppWalletMultiButton />
                </div>

                {/* Progress Stepper */}
                <div className="relative flex justify-between items-center px-4 mb-12">
                    <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-800 -translate-y-1/2 z-0" />
                    {steps.map((s) => (
                        <div key={s.id} className="relative z-10 flex flex-col items-center">
                            <motion.div
                                className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-colors ${step >= s.id ? "bg-teal-500 border-teal-500 text-white" : "bg-slate-900 border-slate-700 text-slate-500"
                                    }`}
                                animate={{ scale: step === s.id ? 1.2 : 1 }}
                            >
                                {step > s.id ? <CheckCircle2 className="w-6 h-6" /> : s.icon}
                            </motion.div>
                            <span className={`mt-3 text-xs font-bold uppercase tracking-widest ${step >= s.id ? "text-teal-400" : "text-slate-500"}`}>
                                {s.title}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Wizard Cards */}
                <div className="relative min-h-[500px]">
                    <AnimatePresence mode="wait">
                        {step === 1 && (
                            <motion.div
                                key="step1"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 p-10 rounded-[2.5rem] shadow-2xl"
                            >
                                <div className="flex items-center justify-between mb-8">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-teal-500/10 rounded-2xl text-teal-400">
                                            <Landmark className="w-8 h-8" />
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-bold">Sender: Taiwan Leg</h2>
                                            <p className="text-slate-400 text-sm">Deposit TWD and mint stablecoins for transfer.</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleQuickSetup}
                                        className="text-[10px] bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-xl border border-slate-600 font-bold uppercase tracking-wider transition"
                                    >
                                        ⚡ Fast Setup
                                    </button>
                                </div>

                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-700/50">
                                            <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider font-bold">Your TWD Balance</p>
                                            <p className="text-2xl font-mono font-bold text-white">{twdBalance}</p>
                                        </div>
                                        <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-700/50">
                                            <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider font-bold">Your USDT Balance</p>
                                            <p className="text-2xl font-mono font-bold text-teal-400">{usdtBalance}</p>
                                        </div>
                                    </div>

                                    {exchangeRate !== null && (
                                        <div className="bg-slate-900 border border-slate-700/50 p-4 rounded-2xl flex justify-between items-center">
                                            <div>
                                                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1">Live Exchange Rate</p>
                                                <p className="text-lg font-mono text-teal-400">1 TWD = ${exchangeRate.toFixed(4)} USD</p>
                                            </div>
                                            {amount && !isNaN(parseFloat(amount)) && (
                                                <div className="text-right">
                                                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1">Estimated Output</p>
                                                    <p className="text-lg font-mono font-bold text-white">~ {(parseFloat(amount) * exchangeRate).toFixed(2)} USDT</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Input Token Mint (Bank Reserve)</label>
                                        <input
                                            type="text"
                                            className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-4 font-mono text-sm outline-none focus:ring-2 focus:ring-teal-500 transition"
                                            value={usdcMint}
                                            onChange={(e) => setUsdcMint(e.target.value)}
                                            placeholder="Bank TWD Mint Address"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Amount to Remit (TWD)</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-5 text-3xl font-bold outline-none focus:ring-2 focus:ring-teal-500 transition"
                                                value={amount}
                                                onChange={(e) => setAmount(e.target.value)}
                                                placeholder="0.00"
                                            />
                                            <div className="absolute right-5 top-1/2 -translate-y-1/2 bg-slate-800 px-3 py-1 rounded-lg text-xs font-bold text-slate-400">TWD</div>
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleMint}
                                        disabled={loading || !amount || wallet.disconnecting}
                                        className="w-full bg-gradient-to-r from-teal-500 to-blue-600 hover:from-teal-400 hover:to-blue-500 py-5 rounded-2xl font-bold text-xl shadow-lg shadow-teal-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                                    >
                                        {loading ? <TrendingUp className="animate-pulse" /> : <ChevronRight />}
                                        Initialize Remittance
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {step === 2 && (
                            <motion.div
                                key="step2"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 p-10 rounded-[2.5rem] shadow-2xl"
                            >
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-400">
                                        <Globe className="w-8 h-8" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold">Cross-Border Transfer</h2>
                                        <p className="text-slate-400 text-sm">Funds move instantly across the Solana network.</p>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="bg-blue-500/5 border border-blue-500/10 p-5 rounded-2xl flex items-center gap-4">
                                        <div className="flex-1">
                                            <p className="text-xs text-blue-400 mb-1 font-bold">Transaction Ready</p>
                                            <p className="text-lg font-mono">{amount} USDT</p>
                                        </div>
                                        <div className="w-px h-10 bg-blue-500/20" />
                                        <div className="flex-1 text-right">
                                            <p className="text-xs text-slate-500 mb-1 font-bold">Solana Network</p>
                                            <p className="text-xs text-slate-400">Fee: ~0.000005 SOL</p>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Recipient Wallet Address (USA)</label>
                                        <div className="flex bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 transition">
                                            <input
                                                type="text"
                                                className="flex-1 bg-transparent p-4 font-mono text-sm outline-none"
                                                value={recipient}
                                                onChange={(e) => setRecipient(e.target.value)}
                                                placeholder="Paste Receiver's Solana Address"
                                            />
                                            {receiverKeypair && receiverKeypair.publicKey.toBase58() === recipient && (
                                                <div className="bg-indigo-500/20 text-indigo-400 px-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest border-l border-slate-700">
                                                    <CheckCircle2 className="w-4 h-4" /> App Built-in Wallet
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex justify-end pt-1">
                                            <button
                                                onClick={generateNewReceiver}
                                                className="text-[11px] bg-slate-800 hover:bg-indigo-600/30 text-indigo-400 px-4 py-2 rounded-xl transition uppercase font-bold tracking-widest flex items-center gap-2 border border-slate-700 hover:border-indigo-500/50"
                                            >
                                                <Send className="w-3 h-3" /> Create New Demo US Wallet
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex gap-4">
                                        <button
                                            onClick={() => setStep(1)}
                                            className="flex-1 bg-slate-700 hover:bg-slate-600 py-5 rounded-2xl font-bold transition flex items-center justify-center gap-2"
                                        >
                                            <ChevronLeft className="w-5 h-5" /> Back
                                        </button>
                                        <button
                                            onClick={handleTransfer}
                                            disabled={loading || !recipient}
                                            className="flex-[2] bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 py-5 rounded-2xl font-bold text-xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
                                        >
                                            {loading ? <Globe className="animate-spin" /> : <Send className="w-5 h-5" />}
                                            Send to USA
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {step === 3 && (
                            <motion.div
                                key="step3"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 p-10 rounded-[2.5rem] shadow-2xl"
                            >
                                <div className="flex items-center gap-4 mb-8">
                                    <div className="p-3 bg-purple-500/10 rounded-2xl text-purple-400">
                                        <DollarSign className="w-8 h-8" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold">Receiver: US Leg</h2>
                                        <p className="text-slate-400 text-sm">Convert USDT to actual USD bank funds.</p>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-700/50">
                                            <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider font-bold">Receiver USDT</p>
                                            <p className="text-2xl font-mono font-bold text-teal-400">{receiverUsdtBalance}</p>
                                        </div>
                                        <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-700/50">
                                            <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider font-bold">Receiver USD</p>
                                            <p className="text-2xl font-mono font-bold text-emerald-400">{receiverUsdBalance}</p>
                                        </div>
                                    </div>

                                    <div className="bg-slate-900 p-5 rounded-2xl border border-slate-700/50 flex flex-col items-center justify-center py-8 text-center">
                                        <p className="text-sm text-slate-400 mb-2">Funds Arrived in Recipient Wallet</p>
                                        <p className="text-3xl font-bold text-white mb-4">{amount} USDT</p>
                                        <p className="text-xs text-slate-500 max-w-xs mx-auto">The recipient must now "burn" these stablecoins to unlock the corresponding fiat reserves in the USA Bank Vault.</p>
                                    </div>

                                    <button
                                        onClick={handleRedeem}
                                        disabled={loading}
                                        className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 py-5 rounded-2xl font-bold text-xl shadow-lg shadow-purple-500/20 transition-all flex items-center justify-center gap-2"
                                    >
                                        {loading ? <Milestone className="animate-bounce" /> : <TrendingUp className="w-5 h-5 rotate-180" />}
                                        Withdraw as USD
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {step === 4 && (
                            <motion.div
                                key="step4"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="bg-slate-800/50 backdrop-blur-xl border border-teal-500/20 p-12 rounded-[2.5rem] shadow-2xl text-center"
                            >
                                <div className="w-24 h-24 bg-teal-500/20 rounded-full flex items-center justify-center mx-auto mb-8">
                                    <CheckCircle2 className="w-12 h-12 text-teal-400" />
                                </div>
                                <h2 className="text-4xl font-extrabold mb-4">Transfer Complete!</h2>
                                <p className="text-slate-400 mb-8 max-w-md mx-auto">
                                    You have successfully simulated a cross-border remittance from Taiwan to the USA using the Solana blockchain and bank-issued stablecoins.
                                </p>

                                <div className="bg-slate-900 rounded-3xl p-6 border border-slate-700 mb-10 text-left space-y-3">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-500">Source</span>
                                        <span className="font-bold">Taiwan (TWD)</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-500">Destination</span>
                                        <span className="font-bold">USA (USD)</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-slate-500">Total Amount</span>
                                        <span className="font-mono text-teal-400 font-bold">{amount} USDT</span>
                                    </div>
                                    {txHash && (
                                        <div className="pt-3 border-t border-slate-700 mt-2">
                                            <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Final Transaction Hash</p>
                                            <p className="text-[10px] font-mono break-all text-slate-400">{txHash}</p>
                                        </div>
                                    )}
                                </div>

                                <button
                                    onClick={() => { setStep(1); setAmount(""); setRecipient(""); }}
                                    className="w-full bg-slate-700 hover:bg-slate-600 py-4 rounded-2xl font-bold transition"
                                >
                                    Start New Remittance
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {status && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-8 p-4 bg-slate-900 border border-slate-700 rounded-2xl flex items-center gap-3"
                    >
                        {loading ? <TrendingUp className="w-4 h-4 text-teal-400 animate-pulse" /> : <AlertCircle className="w-4 h-4 text-blue-400" />}
                        <p className="text-xs font-mono text-slate-400">
                            {status}
                        </p>
                    </motion.div>
                )}
            </div>
        </main>
    );
}
