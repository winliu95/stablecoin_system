"use client";

import React, { useState } from "react";
import { useSession } from "../../components/SessionProvider";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, User, Key, ArrowRight, Loader2 } from "lucide-react";

export default function LoginPage() {
    const { login } = useSession();
    const router = useRouter();
    const [role, setRole] = useState<"admin" | "user" | null>(null);
    const [privateKey, setPrivateKey] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!role || !privateKey) return;

        setIsLoading(true);
        setError("");

        try {
            // Artificial delay for "premium" feel
            await new Promise(r => setTimeout(r, 800));
            login(privateKey, role);
            router.push(role === "admin" ? "/admin" : "/dashboard");
        } catch (err: any) {
            setError(err.message || "Login failed");
        } finally {
            setIsLoading(false);
        }
    };



    return (
        <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white overflow-hidden relative">
            {/* Background elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-20">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-teal-600 rounded-full blur-[120px]" />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-sm z-10"
            >
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-teal-400 mb-2">
                        YTP Platform
                    </h1>
                    <p className="text-slate-400 text-sm">Secure access using Solana Private Key</p>
                </div>

                <AnimatePresence mode="wait">
                    {!role ? (
                        <motion.div
                            key="role-selection"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="grid grid-cols-1 gap-4"
                        >
                            <button
                                onClick={() => setRole("admin")}
                                className="group bg-slate-900 border border-slate-800 hover:border-blue-500/50 p-6 rounded-3xl transition-all duration-300 text-left flex items-start gap-4"
                            >
                                <div className="bg-blue-500/10 p-3 rounded-2xl group-hover:bg-blue-500/20 transition-colors">
                                    <Shield className="text-blue-400" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg">Admin Portal</h3>
                                    <p className="text-slate-500 text-sm mt-1">Configure system parameters and monitor all users.</p>
                                </div>
                            </button>

                            <button
                                onClick={() => setRole("user")}
                                className="group bg-slate-900 border border-slate-800 hover:border-teal-500/50 p-6 rounded-3xl transition-all duration-300 text-left flex items-start gap-4"
                            >
                                <div className="bg-teal-500/10 p-3 rounded-2xl group-hover:bg-teal-500/20 transition-colors">
                                    <User className="text-teal-400" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg">User Dashboard</h3>
                                    <p className="text-slate-500 text-sm mt-1">Manage personal assets and initiate remittances.</p>
                                </div>
                            </button>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="login-form"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="bg-slate-900 border border-slate-800 p-8 rounded-[40px] shadow-2xl relative overflow-hidden"
                        >
                            <button
                                onClick={() => setRole(null)}
                                className="absolute top-6 left-6 text-slate-500 hover:text-white transition"
                            >
                                ← Back
                            </button>

                            <div className="mt-8 flex flex-col items-center mb-6">
                                <div className={`${role === 'admin' ? 'bg-blue-500/10 text-blue-400' : 'bg-teal-500/10 text-teal-400'} p-4 rounded-3xl mb-4`}>
                                    {role === 'admin' ? <Shield size={32} /> : <User size={32} />}
                                </div>
                                <h2 className="text-xl font-bold">
                                    {role === 'admin' ? 'Admin Login' : 'User Login'}
                                </h2>
                            </div>

                            <form onSubmit={handleLogin} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest px-2">
                                        Private Key (Base58)
                                    </label>
                                    <div className="relative">
                                        <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                        <input
                                            type="password"
                                            value={privateKey}
                                            onChange={(e) => setPrivateKey(e.target.value)}
                                            placeholder="Paste your key here..."
                                            className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 pl-12 pr-4 text-sm focus:border-blue-500 transition-all outline-none"
                                            required
                                        />
                                    </div>
                                </div>

                                {error && (
                                    <p className="text-red-400 text-xs px-2 text-center">{error}</p>
                                )}

                                <div className="flex justify-center">
                                    <button
                                        type="button"
                                        onClick={() => setPrivateKey(role === "admin"
                                            ? "GcedLtR9LvT6jtMFeh1dsPPz5r6CV9zEBSF8HzY5gbpLu4M1H7ocqR2BV7oLoD598RqKUt99eP774JmwzYDKewe"
                                            : "2reXpcGY6QomHeuK96mDnGmxg7Xq5pXcDeMoyZmPgPSmfMLLgUDxVugMahN2wvD6tU1MXPttwUSXGRcnGzLh7XLp"
                                        )}
                                        className={`text-[10px] ${role === 'admin' ? 'text-blue-500 hover:text-blue-400' : 'text-teal-500 hover:text-teal-400'} font-bold transition-colors uppercase tracking-widest`}
                                    >
                                        [ Autofill demo key ]
                                    </button>
                                </div>

                                <button
                                    disabled={isLoading}
                                    className={`w-full ${role === 'admin' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-teal-600 hover:bg-teal-500'} py-4 rounded-2xl font-bold transition-all shadow-lg flex items-center justify-center gap-2`}
                                >
                                    {isLoading ? <Loader2 className="animate-spin" /> : <>Enter System <ArrowRight size={18} /></>}
                                </button>
                            </form>

                            <p className="text-[10px] text-slate-600 mt-6 text-center">
                                Your key is only stored locally in your browser.
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </main>
    );
}
