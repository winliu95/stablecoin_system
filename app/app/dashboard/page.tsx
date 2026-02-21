"use client";

import { useState, useEffect, useCallback } from "react";
import { useAnchorProgram } from "../../hooks/useAnchorProgram";
import { PublicKey, SystemProgram, Transaction, Keypair } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { useConnection } from "@solana/wallet-adapter-react";
import {
    getAssociatedTokenAddressSync,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createTransferCheckedInstruction,
    createAssociatedTokenAccountInstruction
} from "@solana/spl-token";
import { useSession } from "../../components/SessionProvider";
import { useRouter } from "next/navigation";
import {
    Wallet,
    ArrowUpRight,
    ArrowDownLeft,
    Send,
    RefreshCw,
    LayoutDashboard,
    Globe,
    CreditCard,
    Plus,
    History,
    LogOut,
    CheckCircle2,
    AlertCircle,
    Landmark,
    DollarSign,
    ChevronRight,
    ChevronLeft,
    TrendingUp,
    Milestone
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function UserDashboard() {
    const { getProgram } = useAnchorProgram();
    const { connection } = useConnection();
    const { isAuthenticated, role, logout, keypair, fiatBalances, updateFiatBalance, mockStablecoinBalances, updateMockStablecoinBalance } = useSession();
    const router = useRouter();

    const [activeTab, setActiveTab] = useState<"summary" | "remit">("summary");
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState("");

    // Mint/Redeem Modal State
    const [isMintModalOpen, setIsMintModalOpen] = useState(false);
    const [mintCurrency, setMintCurrency] = useState<"ntd" | "usd">("ntd");
    const [mintAmount, setMintAmount] = useState("");

    const [isRedeemModalOpen, setIsRedeemModalOpen] = useState(false);
    const [redeemCurrency, setRedeemCurrency] = useState<"mntd" | "musd">("mntd");
    const [redeemAmount, setRedeemAmount] = useState("");

    // Swap Modal State
    const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
    const [swapFromToken, setSwapFromToken] = useState<"mntd" | "musd">("mntd");
    const [swapAmount, setSwapAmount] = useState("");

    // --- User Data ---
    const [balances, setBalances] = useState({
        mntd: "0",
        musd: "0",
        sol: "0"
    });
    const [position, setPosition] = useState<any>(null);
    const [musdMint, setMusdMint] = useState<PublicKey | null>(null);

    // --- Remittance State ---
    const [remitStep, setRemitStep] = useState(1);
    const [remitStatus, setRemitStatus] = useState("");
    const [remitAmount, setRemitAmount] = useState("");
    const [remitSourceCurrency, setRemitSourceCurrency] = useState<"ntd" | "usd">("ntd");
    const [remitStablecoin, setRemitStablecoin] = useState<"mntd" | "musd">("mntd");
    const [recipient, setRecipient] = useState("");
    const [receiverKeypair, setReceiverKeypair] = useState<Keypair | null>(null);
    const [exchangeRate, setExchangeRate] = useState<number | null>(null);
    const [psmOracle, setPsmOracle] = useState<PublicKey | null>(null);
    const [receiverBalances, setReceiverBalances] = useState({ usdt: "0", usd: "0" });

    const USDC_MINT = "Eu5sxWCpeYewZDE5Xy5wmBx3TNKjTL6ZYPWNRKMz3Dwm"; // MNTD
    const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"; // MUSD

    // Guard: Regular user only
    useEffect(() => {
        if (!isAuthenticated || role !== "user") {
            router.push("/login");
        }
    }, [isAuthenticated, role, router]);

    const fetchData = useCallback(async () => {
        if (!keypair) return;
        const program = getProgram();
        if (!program) return;

        setIsLoading(true);
        try {
            const [uMint] = PublicKey.findProgramAddressSync([Buffer.from("mint")], program.programId);
            setMusdMint(uMint);

            // SOL Balance
            const solBal = await connection.getBalance(keypair.publicKey);

            // MNTD (Mock USDC) Balance
            let mntdBal = "0";
            try {
                const mntdAta = getAssociatedTokenAddressSync(new PublicKey(USDC_MINT), keypair.publicKey);
                const bal = await connection.getTokenAccountBalance(mntdAta);
                mntdBal = bal.value.uiAmountString || "0";
            } catch (e) { }

            // MUSD Balance
            let musdBal = "0";
            try {
                const musdAta = getAssociatedTokenAddressSync(uMint, keypair.publicKey);
                const bal = await connection.getTokenAccountBalance(musdAta);
                musdBal = bal.value.uiAmountString || "0";
            } catch (e) { }

            setBalances({
                sol: (solBal / 1_000_000_000).toFixed(4),
                mntd: (parseFloat(mntdBal) + mockStablecoinBalances.mntd).toString(),
                musd: (parseFloat(musdBal) + mockStablecoinBalances.musd).toString()
            });

            // CDP Position
            try {
                const [positionPda] = PublicKey.findProgramAddressSync(
                    [Buffer.from("position"), keypair.publicKey.toBuffer(), new PublicKey(USDC_MINT).toBuffer()],
                    program.programId
                );
                const posData = await (program.account as any).position.fetch(positionPda);
                setPosition(posData);
            } catch (e) {
                setPosition(null);
            }

            // Oracle for Remit
            try {
                const [psmConfigPda] = PublicKey.findProgramAddressSync([Buffer.from("psm"), new PublicKey(USDC_MINT).toBuffer()], program.programId);
                const psmConfigData = await (program.account as any).psmConfig.fetch(psmConfigPda);
                setPsmOracle(psmConfigData.oracle);

                const oracleAcc = await connection.getAccountInfo(psmConfigData.oracle);
                if (oracleAcc) {
                    const priceBuf = oracleAcc.data.slice(8, 16);
                    const price = new BN(priceBuf, 'le').toNumber();
                    setExchangeRate(price / 1_000_000);
                } else {
                    setExchangeRate(31.25);
                }
            } catch (e) {
                setExchangeRate(31.25);
            }

        } catch (e) {
            console.error("Failed to fetch user data:", e);
        } finally {
            setIsLoading(false);
        }
    }, [keypair, connection, getProgram, mockStablecoinBalances]);

    useEffect(() => {
        if (isAuthenticated && role === "user") {
            fetchData();
        }
    }, [isAuthenticated, role, fetchData]);

    const handleLogout = () => {
        logout();
        router.push("/login");
    };

    // --- Bank <-> Blockchain (Mint/Redeem) ---
    const handleExecuteMint = async () => {
        if (!keypair) return;
        const amount = parseFloat(mintAmount);
        if (isNaN(amount) || amount <= 0) {
            setStatus("Invalid amount.");
            return;
        }
        if (fiatBalances[mintCurrency] < amount) {
            setStatus(`Insufficient ${mintCurrency.toUpperCase()} Bank Balance.`);
            return;
        }

        setIsLoading(true);
        const targetToken = mintCurrency === "ntd" ? "MNTD" : "MUSD";
        setStatus(`Minting ${amount} ${targetToken} from Bank...`);
        try {
            await new Promise(r => setTimeout(r, 1500));
            updateFiatBalance(mintCurrency, -amount);
            updateMockStablecoinBalance(mintCurrency === "ntd" ? "mntd" : "musd", amount);
            setStatus(`Success! ${amount} ${mintCurrency.toUpperCase()} successfully minted as ${targetToken}.`);
            setIsMintModalOpen(false);
            setMintAmount("");
            fetchData();
        } catch (e: any) {
            setStatus("Minting failed: " + e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExecuteRedeem = async () => {
        if (!keypair) return;
        const amount = parseFloat(redeemAmount);
        if (isNaN(amount) || amount <= 0) {
            setStatus("Invalid amount.");
            return;
        }
        const sourceBalance = mockStablecoinBalances[redeemCurrency];
        if (sourceBalance < amount) {
            setStatus(`Insufficient ${redeemCurrency.toUpperCase()} Wallet Balance.`);
            return;
        }

        setIsLoading(true);
        const targetFiat = redeemCurrency === "mntd" ? "NTD" : "USD";
        setStatus(`Redeeming ${amount} ${redeemCurrency.toUpperCase()} to Bank...`);
        try {
            await new Promise(r => setTimeout(r, 1500));
            updateMockStablecoinBalance(redeemCurrency, -amount);
            updateFiatBalance(redeemCurrency === "mntd" ? "ntd" : "usd", amount);
            setStatus(`Success! ${amount} ${redeemCurrency.toUpperCase()} successfully redeemed to ${targetFiat}.`);
            setIsRedeemModalOpen(false);
            setRedeemAmount("");
            fetchData();
        } catch (e: any) {
            setStatus("Redemption failed: " + e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExecuteSwap = async (from: "mntd" | "musd", amountStr: string, isRemit = false) => {
        if (!keypair) return;
        const amount = parseFloat(amountStr);
        if (isNaN(amount) || amount <= 0) return;

        setIsLoading(true);
        const to = from === "mntd" ? "musd" : "mntd";
        setStatus(`Swapping ${amount} ${from.toUpperCase()} to ${to.toUpperCase()}...`);
        try {
            // Simulated on-chain swap with exchange rate
            await new Promise(r => setTimeout(r, 1500));
            const resultAmount = from === "mntd" ? amount / (exchangeRate || 31.25) : amount * (exchangeRate || 31.25);
            updateMockStablecoinBalance(from, -amount);
            updateMockStablecoinBalance(to, resultAmount);
            setStatus(`Successfully swapped ${amount} ${from.toUpperCase()} to ${resultAmount.toFixed(2)} ${to.toUpperCase()}.`);
            if (!isRemit) {
                setIsSwapModalOpen(false);
                setSwapAmount("");
            }
            fetchData();
        } catch (e: any) {
            console.error(e);
            setStatus("Swap failed: " + e.message);
        } finally {
            setIsLoading(false);
        }
    };

    // --- Remit Actions ---
    const handleMint = async () => {
        const program = getProgram();
        if (!program || !keypair || !remitAmount) return;
        setIsLoading(true);
        setStatus("Depositing TWD to Mint USDT...");
        try {
            const amountBN = new BN(parseFloat(remitAmount) * 1_000_000);
            const usdcMintPubkey = new PublicKey(USDC_MINT);
            const [uMint] = PublicKey.findProgramAddressSync([Buffer.from("mint")], program.programId);
            const [globalState] = PublicKey.findProgramAddressSync([Buffer.from("global_state")], program.programId);
            const [psmVault] = PublicKey.findProgramAddressSync([Buffer.from("psm_vault"), usdcMintPubkey.toBuffer()], program.programId);
            const [psmConfig] = PublicKey.findProgramAddressSync([Buffer.from("psm"), usdcMintPubkey.toBuffer()], program.programId);
            const [psmAuthority] = PublicKey.findProgramAddressSync([Buffer.from("psm_authority")], program.programId);

            const userUsdcAta = getAssociatedTokenAddressSync(usdcMintPubkey, keypair.publicKey);
            const userUsdtAta = getAssociatedTokenAddressSync(uMint, keypair.publicKey);

            if (!psmOracle) throw new Error("PSM Oracle not found.");

            await program.methods.swapUsdcToUsdt(amountBN)
                .accounts({
                    user: keypair.publicKey,
                    psmConfig,
                    tokenMint: usdcMintPubkey,
                    oracle: psmOracle,
                    psmVault,
                    userTokenAccount: userUsdcAta,
                    usdtMint: uMint,
                    userUsdtAccount: userUsdtAta,
                    psmAuthority,
                    globalState,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                } as any).rpc();

            setStatus("TWD Deposited! USDT Minted.");
            fetchData();
            setTimeout(() => setRemitStep(2), 1000);
        } catch (e: any) {
            setStatus("Error: " + (e.message || e.toString()));
        } finally {
            setIsLoading(false);
        }
    };

    const handleTransfer = async () => {
        if (!keypair || !recipient || !remitAmount || !musdMint) return;
        setIsLoading(true);
        setRemitStatus("Sending funds to US recipient...");
        try {
            const senderAta = getAssociatedTokenAddressSync(musdMint, keypair.publicKey);
            const receiverAta = getAssociatedTokenAddressSync(musdMint, new PublicKey(recipient));

            const transaction = new Transaction();
            const info = await connection.getAccountInfo(receiverAta);
            if (!info) {
                transaction.add(
                    createAssociatedTokenAccountInstruction(keypair.publicKey, receiverAta, new PublicKey(recipient), musdMint)
                );
            }

            transaction.add(
                createTransferCheckedInstruction(
                    senderAta, musdMint, receiverAta, keypair.publicKey,
                    BigInt(Math.floor(parseFloat(remitAmount) * 1_000_000)), 6
                )
            );

            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = keypair.publicKey;
            transaction.partialSign(keypair);

            const txid = await connection.sendRawTransaction(transaction.serialize());
            await connection.confirmTransaction(txid);

            setRemitStatus("Transfer Complete!");
            fetchData();
            setTimeout(() => setRemitStep(4), 1000); // 4-step flow
        } catch (e: any) {
            setRemitStatus("Transfer failed: " + (e.message || e.toString()));
        } finally {
            setIsLoading(false);
        }
    };

    const handleRecipientRedeem = async () => {
        setIsLoading(true);
        setRemitStatus("Recipient is redeeming MUSD to USD (Bank)...");
        try {
            // Simulator: In a real system the recipient would perform this on their end.
            await new Promise(r => setTimeout(r, 2000));
            // For the sake of the demo, we show the end state
            setRemitStatus("Redeemed! Funds now available in recipient's USD account.");
            setRemitStep(5); // Completion step
        } catch (e: any) {
            setRemitStatus("Redeem failed: " + e.toString());
        } finally {
            setIsLoading(false);
        }
    };

    if (!isAuthenticated || role !== "user") return null;

    return (
        <main className="min-h-screen bg-slate-950 text-white p-8">
            <div className="max-w-6xl mx-auto">
                <header className="flex justify-between items-center mb-12">
                    <div className="flex items-center gap-4">
                        <div className="bg-teal-600 p-3 rounded-2xl shadow-lg shadow-teal-500/20">
                            <Wallet size={28} />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black">User Dashboard</h1>
                            <p className="text-slate-500 text-sm">Personal Asset Management</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button onClick={fetchData} className="p-3 text-slate-500 hover:text-white transition">
                            <RefreshCw size={20} className={isLoading ? "animate-spin" : ""} />
                        </button>
                        <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl flex items-center gap-3">
                            <div className="w-2 h-2 bg-teal-500 rounded-full animate-pulse" />
                            <span className="text-xs font-mono text-slate-400">
                                {keypair?.publicKey.toBase58().slice(0, 4)}...{keypair?.publicKey.toBase58().slice(-4)}
                            </span>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 p-3 rounded-xl transition-colors"
                        >
                            <LogOut size={20} />
                        </button>
                    </div>
                </header>

                <div className="flex gap-2 mb-8 bg-slate-900/50 p-1.5 rounded-2xl border border-slate-800 w-fit">
                    <button
                        onClick={() => setActiveTab("summary")}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${activeTab === 'summary' ? 'bg-teal-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                    >
                        <LayoutDashboard size={18} /> Summary
                    </button>
                    <button
                        onClick={() => setActiveTab("remit")}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${activeTab === 'remit' ? 'bg-teal-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                    >
                        <Globe size={18} /> Remittance
                    </button>
                </div>

                <AnimatePresence mode="wait">
                    {activeTab === "summary" ? (
                        <motion.div
                            key="summary"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.02 }}
                            className="grid grid-cols-1 md:grid-cols-3 gap-8"
                        >
                            {/* Balances Card */}
                            <div className="md:col-span-2 space-y-6">
                                <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-8 rounded-[40px] shadow-2xl relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/5 blur-[80px] -z-1" />
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div>
                                            <h4 className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-4">Institutional Bank</h4>
                                            <div className="space-y-4">
                                                <BalanceRow label="NTD (Bank)" value={fiatBalances.ntd.toString()} symbol="NTD" color="blue" />
                                                <BalanceRow label="USD (Bank)" value={fiatBalances.usd.toString()} symbol="USD" color="green" />
                                            </div>
                                        </div>
                                        <div className="border-l border-slate-800 pl-8">
                                            <h4 className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-4">Digital Wallet</h4>
                                            <div className="space-y-4">
                                                <BalanceRow label="MNTD (Stable)" value={balances.mntd} symbol="MNTD" color="teal" />
                                                <BalanceRow label="MUSD (Stable)" value={balances.musd} symbol="MUSD" color="orange" />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-8 pt-8 border-t border-slate-800 flex flex-wrap gap-4">
                                        <button
                                            onClick={() => { setMintCurrency("ntd"); setIsMintModalOpen(true); }}
                                            disabled={isLoading}
                                            className="flex-1 min-w-[140px] bg-teal-600 hover:bg-teal-500 py-4 rounded-2xl font-bold transition flex items-center justify-center gap-2"
                                        >
                                            <Plus size={20} /> Mint
                                        </button>
                                        <button
                                            onClick={() => { setSwapFromToken("mntd"); setIsSwapModalOpen(true); }}
                                            disabled={isLoading}
                                            className="flex-1 min-w-[140px] bg-blue-600 hover:bg-blue-500 py-4 rounded-2xl font-bold transition flex items-center justify-center gap-2"
                                        >
                                            <RefreshCw size={20} /> Swap
                                        </button>
                                        <button
                                            onClick={() => { setRedeemCurrency("mntd"); setIsRedeemModalOpen(true); }}
                                            disabled={isLoading}
                                            className="flex-1 min-w-[140px] bg-slate-800 hover:bg-slate-700 py-4 rounded-2xl font-bold transition flex items-center justify-center gap-2"
                                        >
                                            <ArrowDownLeft size={20} /> Redeem
                                        </button>
                                    </div>
                                </div>

                                {/* News/Actions */}
                                <div className="grid grid-cols-2 gap-6">
                                    <QuickAction icon={<CreditCard className="text-blue-400" />} title="Apply Card" desc="Get YTP Virtual Card" />
                                    <QuickAction icon={<ArrowUpRight className="text-purple-400" />} title="Invest" desc="Yield Farming v2" />
                                </div>
                            </div>

                            {/* Position Side Card */}
                            <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-[40px] flex flex-col">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="bg-teal-500/10 p-2 rounded-lg text-teal-400">
                                        <TrendingUp size={20} />
                                    </div>
                                    <h3 className="font-bold">CDP Position</h3>
                                </div>

                                {position ? (
                                    <div className="space-y-6 flex-1">
                                        <div>
                                            <p className="text-xs text-slate-500 mb-1">Active Debt</p>
                                            <p className="text-3xl font-black text-white">{(position.debtAmount.toNumber() / 1_000_000).toLocaleString()} <span className="text-sm font-normal text-slate-500">USDT</span></p>
                                        </div>
                                        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                                            <div className="flex justify-between text-xs mb-2">
                                                <span className="text-slate-500 uppercase font-bold">Collateral</span>
                                                <span className="font-mono text-teal-400">{(position.collateralAmount.toNumber() / 1_000_000).toLocaleString()} MNTD</span>
                                            </div>
                                            <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                                                <div className="bg-teal-500 h-full w-[65%]" />
                                            </div>
                                        </div>
                                        <button className="w-full bg-slate-800 hover:bg-red-500/20 hover:text-red-400 py-3 rounded-xl text-xs font-bold transition">Manage Loan</button>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-center">
                                        <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4 text-slate-600">
                                            <AlertCircle size={32} />
                                        </div>
                                        <p className="text-slate-500 text-sm mb-6">No active credit line found.</p>
                                        <button
                                            onClick={() => setStatus("CDP creation coming soon to this dashboard!")}
                                            className="bg-blue-600/10 text-blue-400 border border-blue-500/30 px-6 py-2 rounded-full text-xs font-bold hover:bg-blue-600 hover:text-white transition"
                                        >
                                            Open Position
                                        </button>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="remit"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="bg-slate-900 border border-slate-800 p-10 rounded-[40px] shadow-2xl"
                        >
                            {/* Remittance Wizard Inner UI (Simplified Version) */}
                            <div className="flex items-center justify-between mb-8 border-b border-slate-800 pb-8">
                                <div>
                                    <h2 className="text-2xl font-black">Cross-Border Remit Wizard</h2>
                                    <p className="text-slate-500 text-sm">Transfer funds instantly from Taiwan to the USA.</p>
                                </div>
                                <div className="flex gap-2">
                                    {[1, 2, 3, 4].map(i => (
                                        <div key={i} className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${remitStep >= i ? 'bg-teal-500 text-white' : 'bg-slate-800 text-slate-500'}`}>
                                            {i}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <AnimatePresence mode="wait">
                                {remitStep === 1 && (
                                    <motion.div key="r1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-slate-950 p-4 rounded-3xl border border-slate-800 text-center">
                                                <p className="text-[10px] text-slate-500 uppercase font-black mb-1">Available {remitSourceCurrency === 'ntd' ? 'MNTD' : 'MUSD'}</p>
                                                <p className="text-xl font-bold">{remitSourceCurrency === 'ntd' ? balances.mntd : balances.musd}</p>
                                            </div>
                                            <div className="bg-slate-950 p-4 rounded-3xl border border-slate-800 text-center">
                                                <p className="text-[10px] text-slate-500 uppercase font-black mb-1">Exchange Rate</p>
                                                <p className="text-xl font-bold text-teal-400">{exchangeRate?.toFixed(4) || "..."}</p>
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-2 gap-3">
                                                <button
                                                    onClick={() => setRemitSourceCurrency("ntd")}
                                                    className={`py-3 rounded-2xl font-bold transition ${remitSourceCurrency === 'ntd' ? 'bg-blue-600 text-white' : 'bg-slate-950 text-slate-500 border border-slate-800'}`}
                                                >
                                                    Send TWD
                                                </button>
                                                <button
                                                    onClick={() => setRemitSourceCurrency("usd")}
                                                    className={`py-3 rounded-2xl font-bold transition ${remitSourceCurrency === 'usd' ? 'bg-green-600 text-white' : 'bg-slate-950 text-slate-500 border border-slate-800'}`}
                                                >
                                                    Send USD
                                                </button>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-black text-slate-500 uppercase ml-2 tracking-widest">Amount to Transfer</label>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        value={remitAmount}
                                                        onChange={(e) => setRemitAmount(e.target.value)}
                                                        className="w-full bg-slate-950 border border-slate-800 p-6 rounded-3xl text-3xl font-black outline-none focus:border-teal-500 transition"
                                                        placeholder="0.00"
                                                    />
                                                    <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-500 font-bold">{remitSourceCurrency.toUpperCase()}</div>
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={async () => {
                                                const amount = parseFloat(remitAmount);
                                                if (isNaN(amount) || amount <= 0) {
                                                    setStatus("Invalid amount.");
                                                    return;
                                                }
                                                if (fiatBalances[remitSourceCurrency] < amount) {
                                                    setStatus(`Insufficient Bank ${remitSourceCurrency.toUpperCase()}.`);
                                                    return;
                                                }
                                                setIsLoading(true);
                                                const stable = remitSourceCurrency === "ntd" ? "mntd" : "musd";
                                                setRemitStablecoin(stable);
                                                setRemitStatus(`Initiating Bank Mint to ${stable.toUpperCase()}...`);
                                                await new Promise(r => setTimeout(r, 1000));
                                                updateFiatBalance(remitSourceCurrency, -amount);
                                                updateMockStablecoinBalance(stable, amount);
                                                setRemitStatus(`${remitSourceCurrency.toUpperCase()} successfully moved to Blockchain as ${stable.toUpperCase()}.`);
                                                setIsLoading(false);
                                                setRemitStep(2);
                                            }}
                                            disabled={!remitAmount || isLoading}
                                            className="w-full bg-teal-600 hover:bg-teal-500 py-5 rounded-3xl font-black text-xl transition flex items-center justify-center gap-2"
                                        >
                                            {isLoading ? <RefreshCw className="animate-spin" /> : <>Next: Prepare Funds <ChevronRight /></>}
                                        </button>
                                    </motion.div>
                                )}
                                {remitStep === 2 && (
                                    <motion.div key="r2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                                        <div className="bg-teal-600/5 border border-teal-500/20 p-6 rounded-3xl flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-teal-500/20 p-2 rounded-lg text-teal-400"><CheckCircle2 size={18} /></div>
                                                <span className="font-bold">{remitStablecoin.toUpperCase()} Minted:</span>
                                            </div>
                                            <span className="font-black text-xl text-teal-400">{remitAmount} {remitStablecoin.toUpperCase()}</span>
                                        </div>
                                        <div className="p-6 bg-slate-950 border border-slate-800 rounded-3xl text-center">
                                            <p className="text-xs text-slate-500 uppercase font-bold mb-2">
                                                {remitStablecoin === "mntd" ? "Convert to MUSD (Swap Fee: 0%)" : "Funds Ready for Transfer"}
                                            </p>
                                            <p className="text-3xl font-black text-white">
                                                {remitStablecoin === "mntd"
                                                    ? `${(parseFloat(remitAmount) / (exchangeRate || 31.25)).toFixed(2)} MUSD`
                                                    : `${remitAmount} MUSD`
                                                }
                                            </p>
                                        </div>
                                        <div className="flex gap-4">
                                            <button onClick={() => setRemitStep(1)} className="flex-1 bg-slate-800 hover:bg-slate-700 py-4 rounded-2xl font-bold">Back</button>
                                            <button
                                                onClick={async () => {
                                                    if (remitStablecoin === "mntd") {
                                                        await handleExecuteSwap("mntd", remitAmount, true);
                                                        setRemitStablecoin("musd");
                                                    }
                                                    setRemitStep(3);
                                                }}
                                                disabled={isLoading}
                                                className="flex-[2] bg-teal-600 hover:bg-teal-500 py-5 rounded-3xl font-black text-xl transition flex items-center justify-center gap-2"
                                            >
                                                {isLoading ? <RefreshCw className="animate-spin" /> : <>Next: {remitStablecoin === 'mntd' ? 'Swap to MUSD' : 'Proceed to Transfer'} <ChevronRight size={18} /></>}
                                            </button>
                                        </div>
                                    </motion.div>
                                )}
                                {remitStep === 3 && (
                                    <motion.div key="r3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                                        <div className="bg-blue-600/5 border border-blue-500/20 p-6 rounded-3xl flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-blue-500/20 p-2 rounded-lg text-blue-400"><CheckCircle2 size={18} /></div>
                                                <span className="font-bold">MUSD Prepared:</span>
                                            </div>
                                            <span className="font-black text-xl text-teal-400">
                                                {remitSourceCurrency === 'ntd'
                                                    ? (parseFloat(remitAmount) / (exchangeRate || 31.25)).toFixed(2)
                                                    : parseFloat(remitAmount).toFixed(2)
                                                } MUSD
                                            </span>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-black text-slate-500 uppercase ml-2 tracking-widest">US Recipient Address (Solana)</label>
                                            <input
                                                type="text"
                                                value={recipient}
                                                onChange={(e) => setRecipient(e.target.value)}
                                                className="w-full bg-slate-950 border border-slate-800 p-5 rounded-3xl font-mono text-sm outline-none focus:border-blue-500 transition"
                                                placeholder="Recipient Solana Public Key"
                                            />
                                        </div>
                                        <div className="flex gap-4">
                                            <button onClick={() => setRemitStep(2)} className="flex-1 bg-slate-800 hover:bg-slate-700 py-4 rounded-2xl font-bold">Back</button>
                                            <button
                                                onClick={handleTransfer}
                                                disabled={!recipient || isLoading}
                                                className="flex-[2] bg-blue-600 hover:bg-blue-500 py-4 rounded-2xl font-black flex items-center justify-center gap-2"
                                            >
                                                {isLoading ? <RefreshCw className="animate-spin" /> : <>Send to USA <Send size={18} /></>}
                                            </button>
                                        </div>
                                    </motion.div>
                                )}

                                {remitStep === 4 && (
                                    <motion.div key="r4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 text-center">
                                        <div className="w-20 h-20 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <Landmark className="text-blue-400" size={40} />
                                        </div>
                                        <div>
                                            <h3 className="text-2xl font-black">Final Step: Withdraw to Bank</h3>
                                            <p className="text-slate-500 text-sm mt-2">The recipient has received MUSD in their digital wallet. Proceed to deposit into their US Bank Account.</p>
                                        </div>
                                        <div className="bg-slate-950 p-6 rounded-3xl border border-dashed border-slate-800">
                                            <p className="text-xs text-slate-500 uppercase font-bold mb-2">Redemption Value</p>
                                            <p className="text-3xl font-black text-white">
                                                $ {remitSourceCurrency === 'ntd'
                                                    ? (parseFloat(remitAmount) / (exchangeRate || 31.25)).toFixed(2)
                                                    : parseFloat(remitAmount).toFixed(2)
                                                } USD
                                            </p>
                                        </div>
                                        <button
                                            onClick={async () => {
                                                setIsLoading(true);
                                                setStatus("Simulating Recipient Bank Redemption...");
                                                await new Promise(r => setTimeout(r, 2000));
                                                setStatus("Success! Recipient received USD in their bank account.");
                                                setIsLoading(false);
                                                setRemitStep(5);
                                            }}
                                            disabled={isLoading}
                                            className="w-full bg-blue-600 hover:bg-blue-500 py-5 rounded-3xl font-black text-xl transition flex items-center justify-center gap-2"
                                        >
                                            {isLoading ? <RefreshCw className="animate-spin" /> : <>Redeem to US Bank <ArrowDownLeft size={22} /></>}
                                        </button>
                                    </motion.div>
                                )}

                                {remitStep === 5 && (
                                    <motion.div key="r5" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8">
                                        <div className="w-20 h-20 bg-teal-600/20 rounded-full flex items-center justify-center mx-auto mb-6">
                                            <CheckCircle2 className="text-teal-400" size={40} />
                                        </div>
                                        <h3 className="text-2xl font-black mb-2">Remittance Complete!</h3>
                                        <p className="text-slate-500 mb-8">NTD converted to USD and deposited into the US recipient's account.</p>
                                        <button
                                            onClick={() => { setRemitStep(1); setRemitAmount(""); setRecipient(""); setRemitStatus(""); }}
                                            className="bg-slate-800 hover:bg-slate-700 px-8 py-3 rounded-2xl font-bold transition"
                                        >
                                            Close Wizard
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Mint Modal */}
                {isMintModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="absolute inset-0 bg-black/80 backdrop-blur-md"
                            onClick={() => setIsMintModalOpen(false)}
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            className="relative bg-slate-900 border border-slate-800 w-full max-w-md p-8 rounded-[40px] shadow-2xl"
                        >
                            <h3 className="text-xl font-bold mb-6">Mint Stablecoin</h3>

                            <div className="space-y-6">
                                <div>
                                    <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-2 block">Source Currency</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => setMintCurrency("ntd")}
                                            className={`py-3 rounded-2xl font-bold transition ${mintCurrency === 'ntd' ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-950 text-slate-500 border border-slate-800'}`}
                                        >
                                            NTD (Bank)
                                        </button>
                                        <button
                                            onClick={() => setMintCurrency("usd")}
                                            className={`py-3 rounded-2xl font-bold transition ${mintCurrency === 'usd' ? 'bg-green-600 text-white shadow-lg' : 'bg-slate-950 text-slate-500 border border-slate-800'}`}
                                        >
                                            USD (Bank)
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1 block">Amount to Mint</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={mintAmount}
                                            onChange={(e) => setMintAmount(e.target.value)}
                                            className="w-full bg-slate-950 border border-slate-800 p-5 rounded-3xl text-2xl font-black outline-none focus:border-teal-500 transition"
                                            placeholder="0.00"
                                            autoFocus
                                        />
                                        <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-500 font-bold uppercase">{mintCurrency}</div>
                                    </div>
                                    <p className="text-[10px] text-slate-600 px-2 italic">Result: {mintAmount || "0"} {mintCurrency === "ntd" ? "MNTD" : "MUSD"} (1:1 Peg)</p>
                                </div>

                                <div className="flex gap-4 pt-4">
                                    <button
                                        onClick={() => setIsMintModalOpen(false)}
                                        className="flex-1 bg-slate-800 hover:bg-slate-700 py-4 rounded-2xl font-bold transition"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleExecuteMint}
                                        disabled={!mintAmount || isLoading}
                                        className="flex-[2] bg-teal-600 hover:bg-teal-500 py-4 rounded-2xl font-black transition flex items-center justify-center gap-2"
                                    >
                                        {isLoading ? <RefreshCw className="animate-spin" /> : <>Mint Token <ChevronRight size={18} /></>}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Redeem Modal */}
                {isRedeemModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="absolute inset-0 bg-black/80 backdrop-blur-md"
                            onClick={() => setIsRedeemModalOpen(false)}
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            className="relative bg-slate-900 border border-slate-800 w-full max-w-md p-8 rounded-[40px] shadow-2xl"
                        >
                            <h3 className="text-xl font-bold mb-6">Redeem to Bank</h3>

                            <div className="space-y-6">
                                <div>
                                    <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-2 block">Source Stablecoin</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => setRedeemCurrency("mntd")}
                                            className={`py-3 rounded-2xl font-bold transition ${redeemCurrency === 'mntd' ? 'bg-teal-600 text-white shadow-lg' : 'bg-slate-950 text-slate-500 border border-slate-800'}`}
                                        >
                                            MNTD (Wallet)
                                        </button>
                                        <button
                                            onClick={() => setRedeemCurrency("musd")}
                                            className={`py-3 rounded-2xl font-bold transition ${redeemCurrency === 'musd' ? 'bg-orange-600 text-white shadow-lg' : 'bg-slate-950 text-slate-500 border border-slate-800'}`}
                                        >
                                            MUSD (Wallet)
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1 block">Amount to Redeem</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={redeemAmount}
                                            onChange={(e) => setRedeemAmount(e.target.value)}
                                            className="w-full bg-slate-950 border border-slate-800 p-5 rounded-3xl text-2xl font-black outline-none focus:border-teal-500 transition"
                                            placeholder="0.00"
                                            autoFocus
                                        />
                                        <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-500 font-bold uppercase">{redeemCurrency}</div>
                                    </div>
                                    <p className="text-[10px] text-slate-600 px-2 italic">Result: {redeemAmount || "0"} {redeemCurrency === "mntd" ? "NTD" : "USD"} (1:1 Peg)</p>
                                </div>

                                <div className="flex gap-4 pt-4">
                                    <button
                                        onClick={() => setIsRedeemModalOpen(false)}
                                        className="flex-1 bg-slate-800 hover:bg-slate-700 py-4 rounded-2xl font-bold transition"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleExecuteRedeem}
                                        disabled={!redeemAmount || isLoading}
                                        className="flex-[2] bg-teal-600 hover:bg-teal-500 py-4 rounded-2xl font-black transition flex items-center justify-center gap-2"
                                    >
                                        {isLoading ? <RefreshCw className="animate-spin" /> : <>Redeem to Bank <ChevronRight size={18} /></>}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Swap Modal */}
                {isSwapModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="absolute inset-0 bg-black/80 backdrop-blur-md"
                            onClick={() => setIsSwapModalOpen(false)}
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                            className="relative bg-slate-900 border border-slate-800 w-full max-w-md p-8 rounded-[40px] shadow-2xl"
                        >
                            <h3 className="text-xl font-bold mb-6">Asset Swap</h3>

                            <div className="space-y-6">
                                <div>
                                    <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-2 block">From Token</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => setSwapFromToken("mntd")}
                                            className={`py-3 rounded-2xl font-bold transition ${swapFromToken === 'mntd' ? 'bg-teal-600 text-white shadow-lg' : 'bg-slate-950 text-slate-500 border border-slate-800'}`}
                                        >
                                            MNTD
                                        </button>
                                        <button
                                            onClick={() => setSwapFromToken("musd")}
                                            className={`py-3 rounded-2xl font-bold transition ${swapFromToken === 'musd' ? 'bg-orange-600 text-white shadow-lg' : 'bg-slate-950 text-slate-500 border border-slate-800'}`}
                                        >
                                            MUSD
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1 block">Amount to Swap</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={swapAmount}
                                            onChange={(e) => setSwapAmount(e.target.value)}
                                            className="w-full bg-slate-950 border border-slate-800 p-5 rounded-3xl text-2xl font-black outline-none focus:border-teal-500 transition"
                                            placeholder="0.00"
                                            autoFocus
                                        />
                                        <div className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-500 font-bold uppercase">{swapFromToken}</div>
                                    </div>
                                    <div className="flex justify-between px-2">
                                        <p className="text-[10px] text-slate-600 italic">
                                            Result: {swapAmount || "0"} {swapFromToken === "mntd"
                                                ? (parseFloat(swapAmount || "0") / (exchangeRate || 31.25)).toFixed(2) + " MUSD"
                                                : (parseFloat(swapAmount || "0") * (exchangeRate || 31.25)).toFixed(0) + " MNTD"}
                                        </p>
                                        <p className="text-[10px] text-slate-500">Fee: $0.00</p>
                                    </div>
                                </div>

                                <div className="flex gap-4 pt-4">
                                    <button
                                        onClick={() => setIsSwapModalOpen(false)}
                                        className="flex-1 bg-slate-800 hover:bg-slate-700 py-4 rounded-2xl font-bold transition"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => handleExecuteSwap(swapFromToken, swapAmount)}
                                        disabled={!swapAmount || isLoading}
                                        className="flex-[2] bg-blue-600 hover:bg-blue-500 py-4 rounded-2xl font-black transition flex items-center justify-center gap-2"
                                    >
                                        {isLoading ? <RefreshCw className="animate-spin" /> : <>Swap Assets <RefreshCw size={18} /></>}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}

                {status && (
                    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 max-w-lg w-full px-6 z-50">
                        <div className="bg-slate-900 border border-slate-700 p-4 rounded-2xl shadow-2xl flex items-center gap-3">
                            <AlertCircle className="text-teal-400 shrink-0" size={20} />
                            <p className="text-xs font-mono text-slate-300 break-all">{status}</p>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}

function BalanceRow({ label, value, symbol, color }: any) {
    const dotColors: any = {
        blue: "bg-blue-400",
        teal: "bg-teal-400",
        orange: "bg-orange-400",
        green: "bg-green-400",
        purple: "bg-purple-400"
    };
    return (
        <div className="flex justify-between items-center group">
            <div className="flex items-center gap-4">
                <div className={`w-1.5 h-1.5 rounded-full ${dotColors[color]}`} />
                <span className="text-slate-400 text-sm font-medium">{label}</span>
            </div>
            <div className="text-right">
                <span className="text-xl font-bold tabular-nums">{parseFloat(value).toLocaleString()}</span>
                <span className="text-[10px] ml-2 text-slate-500 uppercase font-black">{symbol}</span>
            </div>
        </div>
    );
}

function QuickAction({ icon, title, desc }: any) {
    return (
        <button className="bg-slate-900/50 border border-slate-800 p-6 rounded-[32px] text-left hover:bg-slate-900 hover:border-slate-700 transition-all group">
            <div className="bg-slate-950 w-12 h-12 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                {icon}
            </div>
            <h4 className="font-bold text-sm mb-1">{title}</h4>
            <p className="text-slate-500 text-[10px]">{desc}</p>
        </button>
    );
}
