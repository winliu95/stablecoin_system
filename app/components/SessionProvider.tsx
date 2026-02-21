"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

type Role = "admin" | "user";

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
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionProvider = ({ children }: { children: ReactNode }) => {
    const [keypair, setKeypair] = useState<Keypair | null>(null);
    const [role, setRole] = useState<Role | null>(null);
    const [fiatBalances, setFiatBalances] = useState({ ntd: 100000, usd: 5000 });
    const [mockStablecoinBalances, setMockStablecoinBalances] = useState({ mntd: 0, musd: 0 });

    useEffect(() => {
        const savedKey = localStorage.getItem("ytp_session_key");
        const savedRole = localStorage.getItem("ytp_session_role") as Role;

        if (savedKey && savedRole) {
            try {
                const decoded = bs58.decode(savedKey);
                const kp = Keypair.fromSecretKey(decoded);
                setKeypair(kp);
                setRole(savedRole);
            } catch (e) {
                console.error("Failed to restore session:", e);
                localStorage.removeItem("ytp_session_key");
                localStorage.removeItem("ytp_session_role");
            }
        }

        const savedNtd = localStorage.getItem("ytp_fiat_ntd");
        const savedUsd = localStorage.getItem("ytp_fiat_usd");
        if (savedNtd !== null && savedUsd !== null) {
            setFiatBalances({ ntd: parseFloat(savedNtd), usd: parseFloat(savedUsd) });
        }

        const savedMockMntd = localStorage.getItem("ytp_mock_mntd");
        const savedMockMusd = localStorage.getItem("ytp_mock_musd");
        if (savedMockMntd !== null && savedMockMusd !== null) {
            setMockStablecoinBalances({ mntd: parseFloat(savedMockMntd), musd: parseFloat(savedMockMusd) });
        }
    }, []);

    const login = (privateKey: string, selectedRole: Role) => {
        try {
            const decoded = bs58.decode(privateKey);
            const kp = Keypair.fromSecretKey(decoded);
            setKeypair(kp);
            setRole(selectedRole);
            localStorage.setItem("ytp_session_key", privateKey);
            localStorage.setItem("ytp_session_role", selectedRole);
        } catch (e) {
            throw new Error("Invalid Private Key format. Please use Base58.");
        }
    };

    const logout = () => {
        setKeypair(null);
        setRole(null);
        localStorage.removeItem("ytp_session_key");
        localStorage.removeItem("ytp_session_role");
    };

    const updateFiatBalance = (currency: "ntd" | "usd", amount: number) => {
        setFiatBalances(prev => {
            const next = { ...prev, [currency]: prev[currency] + amount };
            localStorage.setItem(`ytp_fiat_${currency}`, next[currency].toString());
            return next;
        });
    };

    const updateMockStablecoinBalance = (currency: "mntd" | "musd", amount: number) => {
        setMockStablecoinBalances(prev => {
            const next = { ...prev, [currency]: prev[currency] + amount };
            localStorage.setItem(`ytp_mock_${currency}`, next[currency].toString());
            return next;
        });
    };

    return (
        <SessionContext.Provider value={{
            keypair, role, login, logout, isAuthenticated: !!keypair,
            fiatBalances, updateFiatBalance,
            mockStablecoinBalances, updateMockStablecoinBalance
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
