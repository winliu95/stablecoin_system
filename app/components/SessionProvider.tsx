"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

type Role = "admin" | "user";

// Two hardcoded demo accounts for the PoC
export const DEMO_ACCOUNTS = {
    A: {
        label: "Account A (Alice)",
        privateKey: "2reXpcGY6QomHeuK96mDnGmxg7Xq5pXcDeMoyZmPgPSmfMLLgUDxVugMahN2wvD6tU1MXPttwUSXGRcnGzLh7XLp",
        defaultFiat: { ntd: 100000, usd: 5000 },
        defaultStable: { mntd: 0, musd: 0 },
    },
    B: {
        label: "Account B (Bob)",
        privateKey: "4WmNjddHG4bg6HPagpWRSBpqqRoXBdRB83gwdQeAcaTdfjQUPavpMCpD8hXJoX6diMjj8J4PLy8L5gPtZWvQAUwU",
        defaultFiat: { ntd: 50000, usd: 2500 },
        defaultStable: { mntd: 0, musd: 0 },
    },
};

export type AccountBalances = {
    ntd: number;
    usd: number;
    mntd: number;
    musd: number;
};

export type KnownAccounts = {
    [pubkey: string]: AccountBalances & { label?: string };
};

export type TransferRecord = {
    id: string; // Transaction Hash / ID
    timestamp: number;
    sender: string;
    recipient: string;
    currency: "mntd" | "musd";
    amount: number;
};

const KNOWN_ACCOUNTS_KEY = "ytp_known_accounts";

// Helper to get/set per-account balances from localStorage
function loadAccountBalances(pubkey: string, defaults: { ntd: number; usd: number; mntd: number; musd: number }): AccountBalances {
    if (typeof window === "undefined") return defaults;
    const ntd = localStorage.getItem(`ytp_fiat_ntd_${pubkey}`);
    const usd = localStorage.getItem(`ytp_fiat_usd_${pubkey}`);
    const mntd = localStorage.getItem(`ytp_mock_mntd_${pubkey}`);
    const musd = localStorage.getItem(`ytp_mock_musd_${pubkey}`);
    return {
        ntd: ntd !== null ? parseFloat(ntd) : defaults.ntd,
        usd: usd !== null ? parseFloat(usd) : defaults.usd,
        mntd: mntd !== null ? parseFloat(mntd) : defaults.mntd,
        musd: musd !== null ? parseFloat(musd) : defaults.musd,
    };
}

function saveAccountBalances(pubkey: string, balances: AccountBalances) {
    if (typeof window === "undefined") return;
    localStorage.setItem(`ytp_fiat_ntd_${pubkey}`, balances.ntd.toString());
    localStorage.setItem(`ytp_fiat_usd_${pubkey}`, balances.usd.toString());
    localStorage.setItem(`ytp_mock_mntd_${pubkey}`, balances.mntd.toString());
    localStorage.setItem(`ytp_mock_musd_${pubkey}`, balances.musd.toString());

    // Update the known accounts registry
    const existing = JSON.parse(localStorage.getItem(KNOWN_ACCOUNTS_KEY) || "{}");
    existing[pubkey] = { ...existing[pubkey], ...balances };
    localStorage.setItem(KNOWN_ACCOUNTS_KEY, JSON.stringify(existing));
}

function registerKnownAccount(pubkey: string, label?: string) {
    if (typeof window === "undefined") return;
    const existing = JSON.parse(localStorage.getItem(KNOWN_ACCOUNTS_KEY) || "{}");
    if (!existing[pubkey]) {
        existing[pubkey] = { label: label || pubkey.slice(0, 8) + "..." };
    } else if (label && !existing[pubkey].label) {
        existing[pubkey].label = label;
    }
    localStorage.setItem(KNOWN_ACCOUNTS_KEY, JSON.stringify(existing));
}

export function getAllKnownAccounts(): KnownAccounts {
    if (typeof window === "undefined") return {};
    const registry = JSON.parse(localStorage.getItem(KNOWN_ACCOUNTS_KEY) || "{}");
    const result: KnownAccounts = {};
    for (const [pubkey, meta] of Object.entries(registry as any)) {
        const balances = loadAccountBalances(pubkey, { ntd: 0, usd: 0, mntd: 0, musd: 0 });
        result[pubkey] = { ...balances, label: (meta as any).label };
    }
    return result;
}

interface SessionContextType {
    keypair: Keypair | null;
    role: Role | null;
    login: (privateKey: string, role: Role) => void;
    logout: () => void;
    isAuthenticated: boolean;
    fiatBalances: { ntd: number; usd: number };
    mockStablecoinBalances: { mntd: number; musd: number };
    updateFiatBalance: (currency: "ntd" | "usd", amount: number) => void;
    updateMockStablecoinBalance: (currency: "mntd" | "musd", amount: number) => void;
    transferToAccount: (recipientPubkey: string, currency: "mntd" | "musd", amount: number, txHash?: string) => void;
    knownAccounts: KnownAccounts;
    refreshKnownAccounts: () => void;
    transferHistory: TransferRecord[];
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

// Seed default demo account balances if they don't exist yet
function seedDemoAccounts() {
    for (const [key, account] of Object.entries(DEMO_ACCOUNTS)) {
        try {
            const decoded = bs58.decode(account.privateKey);
            const kp = Keypair.fromSecretKey(decoded);
            const pubkey = kp.publicKey.toBase58();
            registerKnownAccount(pubkey, account.label);
            // Only seed if not already in localStorage
            if (localStorage.getItem(`ytp_fiat_ntd_${pubkey}`) === null) {
                saveAccountBalances(pubkey, {
                    ...account.defaultFiat,
                    ...account.defaultStable,
                });
            }
        } catch (e) {
            console.error("Failed to seed demo account:", key, e);
        }
    }
}

export const SessionProvider = ({ children }: { children: ReactNode }) => {
    const [keypair, setKeypair] = useState<Keypair | null>(null);
    const [role, setRole] = useState<Role | null>(null);
    const [fiatBalances, setFiatBalances] = useState({ ntd: 0, usd: 0 });
    const [mockStablecoinBalances, setMockStablecoinBalances] = useState({ mntd: 0, musd: 0 });
    const [knownAccounts, setKnownAccounts] = useState<KnownAccounts>({});
    const [transferHistory, setTransferHistory] = useState<TransferRecord[]>([]);

    const refreshKnownAccounts = useCallback(() => {
        setKnownAccounts(getAllKnownAccounts());
    }, []);

    useEffect(() => {
        // Seed demo accounts on first load
        seedDemoAccounts();
        refreshKnownAccounts();

        const savedKey = localStorage.getItem("ytp_session_key");
        const savedRole = localStorage.getItem("ytp_session_role") as Role;

        if (savedKey && savedRole) {
            try {
                const decoded = bs58.decode(savedKey);
                const kp = Keypair.fromSecretKey(decoded);
                setKeypair(kp);
                setRole(savedRole);

                // Find the matching demo label
                const matchedDemo = Object.values(DEMO_ACCOUNTS).find(a => a.privateKey === savedKey);
                const defaults = matchedDemo ? { ...matchedDemo.defaultFiat, ...matchedDemo.defaultStable } : { ntd: 0, usd: 0, mntd: 0, musd: 0 };
                const balances = loadAccountBalances(kp.publicKey.toBase58(), defaults);
                setFiatBalances({ ntd: balances.ntd, usd: balances.usd });
                setMockStablecoinBalances({ mntd: balances.mntd, musd: balances.musd });

                const history = JSON.parse(localStorage.getItem("ytp_transfer_history") || "[]");
                setTransferHistory(history);
            } catch (e) {
                console.error("Failed to restore session:", e);
                localStorage.removeItem("ytp_session_key");
                localStorage.removeItem("ytp_session_role");
            }
        }
    }, []);

    const login = (privateKey: string, selectedRole: Role) => {
        try {
            const decoded = bs58.decode(privateKey);
            const kp = Keypair.fromSecretKey(decoded);
            const pubkey = kp.publicKey.toBase58();

            // Find matching demo account for label and defaults
            const matchedDemo = Object.values(DEMO_ACCOUNTS).find(a => a.privateKey === privateKey);
            const defaults = matchedDemo ? { ...matchedDemo.defaultFiat, ...matchedDemo.defaultStable } : { ntd: 0, usd: 0, mntd: 0, musd: 0 };
            const label = matchedDemo?.label;

            registerKnownAccount(pubkey, label);
            const balances = loadAccountBalances(pubkey, defaults);

            setKeypair(kp);
            setRole(selectedRole);
            setFiatBalances({ ntd: balances.ntd, usd: balances.usd });
            setMockStablecoinBalances({ mntd: balances.mntd, musd: balances.musd });

            localStorage.setItem("ytp_session_key", privateKey);
            localStorage.setItem("ytp_session_role", selectedRole);

            refreshKnownAccounts();
        } catch (e) {
            throw new Error("Invalid Private Key format. Please use Base58.");
        }
    };

    const logout = () => {
        setKeypair(null);
        setRole(null);
        setFiatBalances({ ntd: 0, usd: 0 });
        setMockStablecoinBalances({ mntd: 0, musd: 0 });
        localStorage.removeItem("ytp_session_key");
        localStorage.removeItem("ytp_session_role");
    };

    const updateFiatBalance = (currency: "ntd" | "usd", amount: number) => {
        if (!keypair) return;
        const pubkey = keypair.publicKey.toBase58();
        setFiatBalances(prev => {
            const next = { ...prev, [currency]: Math.max(0, prev[currency] + amount) };
            const current = loadAccountBalances(pubkey, { ntd: 0, usd: 0, mntd: 0, musd: 0 });
            saveAccountBalances(pubkey, { ...current, [currency]: next[currency] });
            return next;
        });
        refreshKnownAccounts();
    };

    const updateMockStablecoinBalance = (currency: "mntd" | "musd", amount: number) => {
        if (!keypair) return;
        const pubkey = keypair.publicKey.toBase58();
        setMockStablecoinBalances(prev => {
            const next = { ...prev, [currency]: Math.max(0, prev[currency] + amount) };
            const current = loadAccountBalances(pubkey, { ntd: 0, usd: 0, mntd: 0, musd: 0 });
            saveAccountBalances(pubkey, { ...current, [currency]: next[currency] });
            return next;
        });
        refreshKnownAccounts();
    };

    const transferToAccount = (recipientPubkey: string, currency: "mntd" | "musd", amount: number, txHash?: string) => {
        if (!keypair) return;
        const senderPubkey = keypair.publicKey.toBase58();

        // Debit sender
        const senderBalances = loadAccountBalances(senderPubkey, { ntd: 0, usd: 0, mntd: 0, musd: 0 });
        const newSenderBalance = Math.max(0, senderBalances[currency] - amount);
        saveAccountBalances(senderPubkey, { ...senderBalances, [currency]: newSenderBalance });

        // Credit recipient 
        const recipientBalances = loadAccountBalances(recipientPubkey, { ntd: 0, usd: 0, mntd: 0, musd: 0 });
        const newRecipientBalance = recipientBalances[currency] + amount;
        saveAccountBalances(recipientPubkey, { ...recipientBalances, [currency]: newRecipientBalance });

        // Update sender's local state
        setMockStablecoinBalances(prev => ({ ...prev, [currency]: newSenderBalance }));

        // Log transaction
        const newRecord: TransferRecord = {
            id: txHash || `mock-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            timestamp: Date.now(),
            sender: senderPubkey,
            recipient: recipientPubkey,
            currency,
            amount,
        };
        const currentHistory = JSON.parse(localStorage.getItem("ytp_transfer_history") || "[]");
        const nextHistory = [newRecord, ...currentHistory];
        localStorage.setItem("ytp_transfer_history", JSON.stringify(nextHistory));
        setTransferHistory(nextHistory);

        refreshKnownAccounts();
    };

    return (
        <SessionContext.Provider value={{
            keypair, role, login, logout, isAuthenticated: !!keypair,
            fiatBalances, updateFiatBalance,
            mockStablecoinBalances, updateMockStablecoinBalance,
            transferToAccount, knownAccounts, refreshKnownAccounts,
            transferHistory
        }}>
            {children}
        </SessionContext.Provider>
    );
};

export const useSession = () => {
    const context = useContext(SessionContext);
    if (context === undefined) {
        throw new Error("useSession must be used within a SessionProvider");
    }
    return context;
};
