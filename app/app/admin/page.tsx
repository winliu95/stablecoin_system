"use client";

import { useState, useEffect } from "react";
import { useAnchorProgram } from "../../hooks/useAnchorProgram";
import { PublicKey, SystemProgram, Transaction, Keypair, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { useConnection } from "@solana/wallet-adapter-react";
import {
    TOKEN_PROGRAM_ID,
    MINT_SIZE,
    createInitializeMintInstruction,
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountInstruction,
    createMintToInstruction
} from "@solana/spl-token";
import { useSession } from "../../components/SessionProvider";
import { useRouter } from "next/navigation";
import {
    Shield,
    Settings,
    Activity,
    Users,
    Coins,
    AlertCircle,
    CheckCircle2,
    RefreshCw,
    LogOut,
    PlusCircle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function AdminPage() {
    const { getProgram } = useAnchorProgram();
    const { connection } = useConnection();
    const { isAuthenticated, role, logout, keypair } = useSession();
    const router = useRouter();

    const [activeTab, setActiveTab] = useState<"monitor" | "config">("monitor");
    const [status, setStatus] = useState("");
    const [positions, setPositions] = useState<any[]>([]);
    const [globalState, setGlobalState] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);

    // --- Config State ---
    const [collateralMint, setCollateralMint] = useState("");
    const [oracle, setOracle] = useState("");
    const [mcr, setMcr] = useState("150");
    const [ltr, setLtr] = useState("120");
    const [penalty, setPenalty] = useState("10");
    const [psmMint, setPsmMint] = useState("");
    const [psmOracle, setPsmOracle] = useState("");
    const [psmFee, setPsmFee] = useState("10"); // 0.1%
    const [mockUsdc, setMockUsdc] = useState("Eu5sxWCpeYewZDE5Xy5wmBx3TNKjTL6ZYPWNRKMz3Dwm");
    const [mockCollateral, setMockCollateral] = useState("5Yt9gRBDV7NRpNjEzPGgdptamh3w6uCLupotCEY1sXtQ");

    // Guard: Admin only
    useEffect(() => {
        if (!isAuthenticated || role !== "admin") {
            router.push("/login");
        }
    }, [isAuthenticated, role, router]);

    // Pre-fill Defaults
    useEffect(() => {
        const program = getProgram();
        if (program) {
            const [oraclePda] = PublicKey.findProgramAddressSync([Buffer.from("mock_oracle")], program.programId);
            setOracle(oraclePda.toBase58());
            setPsmOracle(oraclePda.toBase58());
            if (!psmMint) setPsmMint(mockUsdc);
            if (!collateralMint) setCollateralMint(mockCollateral);
        }
    }, [getProgram, mockUsdc, mockCollateral]);

    // Fetch All Positions
    const fetchData = async () => {
        const program = getProgram();
        if (!program) return;

        setIsLoading(true);
        try {
            // Fetch Positions
            const allPositions = await (program.account as any).position.all();
            setPositions(allPositions.map((p: any) => ({
                publicKey: p.publicKey.toBase58(),
                ...p.account
            })));

            // Fetch Global State
            const [globalStatePda] = PublicKey.findProgramAddressSync([Buffer.from("global_state")], program.programId);
            const state = await (program.account as any).globalState.fetch(globalStatePda);
            setGlobalState(state);
        } catch (e) {
            console.error("Failed to fetch admin data:", e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isAuthenticated && role === "admin" && activeTab === "monitor") {
            fetchData();
        }
    }, [isAuthenticated, role, activeTab]);

    const handleLogout = () => {
        logout();
        router.push("/login");
    };

    // Initialize System
    const initialize = async () => {
        const program = getProgram();
        if (!program || !keypair) return;

        try {
            setStatus("Initializing System...");
            const [globalState] = PublicKey.findProgramAddressSync([Buffer.from("global_state")], program.programId);
            const [usdtMint] = PublicKey.findProgramAddressSync([Buffer.from("mint")], program.programId);

            const tx = await program.methods.initialize()
                .accounts({
                    admin: keypair.publicKey,
                    globalState: globalState,
                    usdtMint: usdtMint,
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                } as any).rpc();

            setStatus("System Initialized! Tx: " + tx);
        } catch (e: any) {
            setStatus("Error: " + (e.message || e.toString()));
        }
    };

    const configureCollateral = async () => {
        const program = getProgram();
        if (!program || !keypair) return;

        try {
            setStatus("Configuring Collateral...");
            const mintPubkey = new PublicKey(collateralMint);
            const oraclePubkey = new PublicKey(oracle);

            const tx = await program.methods.configureCollateral(
                new BN(parseInt(mcr)),
                new BN(parseInt(ltr)),
                new BN(parseInt(penalty))
            ).accounts({
                admin: keypair.publicKey,
                collateralMint: mintPubkey,
                oracle: oraclePubkey,
            } as any).rpc();

            setStatus("Collateral Configured! Tx: " + tx);
        } catch (e: any) {
            setStatus("Error: " + (e.message || e.toString()));
        }
    };

    const configurePsm = async () => {
        const program = getProgram();
        if (!program || !keypair) return;

        try {
            setStatus("Configuring PSM...");
            const mintPubkey = new PublicKey(psmMint);
            const oraclePubkey = new PublicKey(psmOracle);
            const feeBN = new BN(parseInt(psmFee));

            const [globalState] = PublicKey.findProgramAddressSync([Buffer.from("global_state")], program.programId);
            const [psmConfigPda] = PublicKey.findProgramAddressSync([Buffer.from("psm"), mintPubkey.toBuffer()], program.programId);
            const [psmVaultPda] = PublicKey.findProgramAddressSync([Buffer.from("psm_vault"), mintPubkey.toBuffer()], program.programId);
            const [psmAuthorityPda] = PublicKey.findProgramAddressSync([Buffer.from("psm_authority")], program.programId);

            const tx = await program.methods.configurePsm(feeBN)
                .accounts({
                    admin: keypair.publicKey,
                    globalState: globalState,
                    tokenMint: mintPubkey,
                    oracle: oraclePubkey,
                    psmConfig: psmConfigPda,
                    psmVault: psmVaultPda,
                    psmAuthority: psmAuthorityPda,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                    rent: SYSVAR_RENT_PUBKEY,
                } as any).rpc();

            setStatus("PSM Configured! Tx: " + tx);
        } catch (e: any) {
            setStatus("Error: " + (e.message || e.toString()));
        }
    };

    const setupMocks = async () => {
        if (!keypair) return;
        try {
            setStatus("Preparing Mock Setup...");
            const transaction = new Transaction();
            const usdcMint = Keypair.generate();
            const collMint = Keypair.generate();
            const lamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);

            transaction.add(
                SystemProgram.createAccount({
                    fromPubkey: keypair.publicKey,
                    newAccountPubkey: usdcMint.publicKey,
                    space: MINT_SIZE,
                    lamports,
                    programId: TOKEN_PROGRAM_ID,
                }),
                createInitializeMintInstruction(usdcMint.publicKey, 6, keypair.publicKey, keypair.publicKey),
                SystemProgram.createAccount({
                    fromPubkey: keypair.publicKey,
                    newAccountPubkey: collMint.publicKey,
                    space: MINT_SIZE,
                    lamports,
                    programId: TOKEN_PROGRAM_ID,
                }),
                createInitializeMintInstruction(collMint.publicKey, 6, keypair.publicKey, keypair.publicKey)
            );

            const userUsdcAta = getAssociatedTokenAddressSync(usdcMint.publicKey, keypair.publicKey);
            const userCollAta = getAssociatedTokenAddressSync(collMint.publicKey, keypair.publicKey);

            transaction.add(
                createAssociatedTokenAccountInstruction(keypair.publicKey, userUsdcAta, keypair.publicKey, usdcMint.publicKey),
                createMintToInstruction(usdcMint.publicKey, userUsdcAta, keypair.publicKey, 1000 * 1_000_000),
                createAssociatedTokenAccountInstruction(keypair.publicKey, userCollAta, keypair.publicKey, collMint.publicKey),
                createMintToInstruction(collMint.publicKey, userCollAta, keypair.publicKey, 1000 * 1_000_000)
            );

            transaction.feePayer = keypair.publicKey;
            transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
            transaction.partialSign(keypair, usdcMint, collMint);

            const txid = await connection.sendRawTransaction(transaction.serialize());
            await connection.confirmTransaction(txid);
            setMockUsdc(usdcMint.publicKey.toBase58());
            setMockCollateral(collMint.publicKey.toBase58());
            setStatus(`Mocks Created! Tx: ${txid.slice(0, 8)}...`);
        } catch (e: any) {
            setStatus("Setup Failed: " + (e.message || e.toString()));
        }
    };

    if (!isAuthenticated || role !== "admin") return null;

    return (
        <main className="min-h-screen bg-slate-950 text-white p-8">
            <div className="max-w-6xl mx-auto">
                <header className="flex justify-between items-center mb-12">
                    <div className="flex items-center gap-4">
                        <div className="bg-blue-600 p-3 rounded-2xl shadow-lg shadow-blue-500/20">
                            <Shield size={28} />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black">Admin Portal</h1>
                            <p className="text-slate-500 text-sm">System Governance & Monitoring</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl flex items-center gap-3">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
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

                {/* Tabs */}
                <div className="flex gap-2 mb-8 bg-slate-900/50 p-1.5 rounded-2xl border border-slate-800 w-fit">
                    <button
                        onClick={() => setActiveTab("monitor")}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${activeTab === 'monitor' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                    >
                        <Activity size={18} /> Monitoring
                    </button>
                    <button
                        onClick={() => setActiveTab("config")}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${activeTab === 'config' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                    >
                        <Settings size={18} /> Configuration
                    </button>
                </div>

                <AnimatePresence mode="wait">
                    {activeTab === "monitor" ? (
                        <motion.div
                            key="monitor"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-6"
                        >
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                <StatsCard title="Active Users" value={positions.length.toString()} icon={<Users />} color="blue" />
                                <StatsCard
                                    title="Active Debt"
                                    value={`$${((positions.reduce((acc, p) => acc + p.debtAmount.toNumber(), 0)) / 1_000_000).toLocaleString()}`}
                                    icon={<Coins />}
                                    color="teal"
                                />
                                <StatsCard
                                    title="System MNTD"
                                    value={`${((positions.reduce((acc, p) => acc + p.collateralAmount.toNumber(), 0)) / 1_000_000).toLocaleString()}`}
                                    icon={<RefreshCw />}
                                    color="purple"
                                />
                                <StatsCard
                                    title="MUSD Supply"
                                    value={globalState ? `$${(globalState.totalSupply?.toNumber() / 1_000_000 || 0).toLocaleString()}` : "..."}
                                    icon={<Activity />}
                                    color="orange"
                                />
                            </div>

                            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
                                <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                                    <h3 className="text-lg font-bold">User Positions (CDP)</h3>
                                    <button onClick={fetchData} className="text-slate-400 hover:text-white transition">
                                        {isLoading ? <RefreshCw className="animate-spin" size={18} /> : <RefreshCw size={18} />}
                                    </button>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead className="text-xs text-slate-500 uppercase font-bold bg-slate-900/50">
                                            <tr>
                                                <th className="px-6 py-4">Owner</th>
                                                <th className="px-6 py-4">Collateral (MNTD)</th>
                                                <th className="px-6 py-4">Debt (MUSD)</th>
                                                <th className="px-6 py-4">Status</th>
                                                <th className="px-6 py-4 text-right">Last Update</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800">
                                            {positions.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500 italic">
                                                        No active positions found in the system.
                                                    </td>
                                                </tr>
                                            ) : (
                                                positions.map((p, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                                                        <td className="px-6 py-4 font-mono text-xs text-blue-400">
                                                            {p.owner.toBase58().slice(0, 8)}...{p.owner.toBase58().slice(-8)}
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="flex flex-col">
                                                                <span className="font-bold">{(p.collateralAmount.toNumber() / 1_000_000).toLocaleString()}</span>
                                                                <span className="text-[10px] text-slate-500 uppercase">{p.collateralMint.toBase58().slice(0, 4)}...</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 font-bold text-teal-400">
                                                            {(p.debtAmount.toNumber() / 1_000_000).toLocaleString()}
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            {p.isFrozen ? (
                                                                <span className="flex items-center gap-1.5 text-xs text-red-400 bg-red-400/10 px-2.5 py-1 rounded-full w-fit border border-red-400/20">
                                                                    <AlertCircle size={14} /> Frozen
                                                                </span>
                                                            ) : (
                                                                <span className="flex items-center gap-1.5 text-xs text-green-400 bg-green-400/10 px-2.5 py-1 rounded-full w-fit border border-green-400/20">
                                                                    <CheckCircle2 size={14} /> Healthy
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4 text-right text-xs text-slate-500">
                                                            {new Date(p.lastUpdated.toNumber() * 1000).toLocaleString()}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="config"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="grid grid-cols-1 md:grid-cols-2 gap-8"
                        >
                            {/* 1. Initialize */}
                            <ConfigSection title="1. Initialize System" description="One-time system broad setup.">
                                <button
                                    onClick={initialize}
                                    className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-2xl font-bold transition flex items-center justify-center gap-2"
                                >
                                    <PlusCircle size={20} /> Initialize Program
                                </button>
                            </ConfigSection>

                            {/* 2. PSM */}
                            <ConfigSection title="2. PSM Governance" description="Configure MNTD/MUSD swap parameters.">
                                <div className="space-y-4">
                                    <ConfigInput label="MNTD Mint (USDC)" value={psmMint} onChange={setPsmMint} placeholder="Address" />
                                    <ConfigInput label="Oracle Feed" value={psmOracle} onChange={setPsmOracle} placeholder="Oracle Address" />
                                    <ConfigInput label="Swap Fee (bps)" value={psmFee} onChange={setPsmFee} type="number" />
                                    <button
                                        onClick={configurePsm}
                                        className="w-full bg-slate-800 hover:bg-slate-700 py-4 border border-slate-700 rounded-2xl font-bold transition"
                                    >
                                        Update PSM Config
                                    </button>
                                </div>
                            </ConfigSection>

                            {/* 3. Collateral */}
                            <ConfigSection title="3. CDP Parameters" description="Update risk levels for stablecoin loans." className="md:col-span-2">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <ConfigInput label="Collateral Mint" value={collateralMint} onChange={setCollateralMint} />
                                    <ConfigInput label="Price Oracle" value={oracle} onChange={setOracle} />
                                    <div className="flex gap-4">
                                        <ConfigInput label="MCR %" value={mcr} onChange={setMcr} type="number" />
                                        <ConfigInput label="LTR %" value={ltr} onChange={setLtr} type="number" />
                                    </div>
                                    <ConfigInput label="Liq. Penalty %" value={penalty} onChange={setPenalty} type="number" />
                                </div>
                                <button
                                    onClick={configureCollateral}
                                    className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-2xl font-bold transition mt-6 shadow-lg shadow-blue-500/20"
                                >
                                    Save System Risk Parameters
                                </button>
                            </ConfigSection>

                            {/* 4. Mock Setup */}
                            <ConfigSection title="4. Rapid Testing Tools" description="Generate test mints and initial liquidity." className="md:col-span-2 border-teal-500/30">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex justify-between items-center group">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Mock USDC</span>
                                            <span className="font-mono text-xs text-blue-400">{mockUsdc.slice(0, 16)}...</span>
                                        </div>
                                        <button onClick={() => setPsmMint(mockUsdc)} className="opacity-0 group-hover:opacity-100 text-xs text-blue-500 font-bold transition">USE</button>
                                    </div>
                                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex justify-between items-center group">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Mock COLL</span>
                                            <span className="font-mono text-xs text-purple-400">{mockCollateral.slice(0, 16)}...</span>
                                        </div>
                                        <button onClick={() => setCollateralMint(mockCollateral)} className="opacity-0 group-hover:opacity-100 text-xs text-purple-500 font-bold transition">USE</button>
                                    </div>
                                </div>
                                <button
                                    onClick={setupMocks}
                                    className="w-full bg-gradient-to-r from-teal-500 to-blue-600 hover:from-teal-400 hover:to-blue-500 py-5 rounded-[24px] font-black text-lg transition-all shadow-xl shadow-teal-500/10"
                                >
                                    🚀 DEPLOY MOCK ASSETS
                                </button>
                            </ConfigSection>
                        </motion.div>
                    )}
                </AnimatePresence>

                {status && (
                    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 max-w-lg w-full px-6 z-50">
                        <div className="bg-slate-900 border border-slate-700 p-4 rounded-2xl shadow-2xl flex items-center gap-3">
                            <InfoCircle className="text-blue-400 shrink-0" size={20} />
                            <p className="text-xs font-mono text-slate-300 break-all">{status}</p>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}

// Components
function StatsCard({ title, value, icon, color }: any) {
    const colorClasses: any = {
        blue: "text-blue-400 bg-blue-500/10",
        teal: "text-teal-400 bg-teal-500/10",
        purple: "text-purple-400 bg-purple-500/10",
        orange: "text-orange-400 bg-orange-500/10"
    };
    return (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-[32px] flex items-center gap-6">
            <div className={`p-4 rounded-2xl ${colorClasses[color]}`}>
                {icon}
            </div>
            <div>
                <p className="text-slate-500 text-xs uppercase font-black tracking-widest mb-1">{title}</p>
                <p className="text-2xl font-black">{value}</p>
            </div>
        </div>
    );
}

function ConfigSection({ title, description, children, className }: any) {
    return (
        <div className={`bg-slate-900 border border-slate-800 p-8 rounded-[40px] shadow-sm ${className}`}>
            <h2 className="text-2xl font-black mb-1">{title}</h2>
            <p className="text-slate-500 text-xs mb-8">{description}</p>
            {children}
        </div>
    );
}

function ConfigInput({ label, value, onChange, type = "text", placeholder = "" }: any) {
    return (
        <div className="flex flex-col gap-1.5 flex-1">
            <label className="text-[10px] uppercase font-black text-slate-500 tracking-widest px-2">{label}</label>
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-sm font-mono focus:border-blue-500 outline-none transition"
            />
        </div>
    );
}

function InfoCircle(props: any) {
    return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>;
}
