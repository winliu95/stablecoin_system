"use client";

import Link from "next/link";
import { AppWalletMultiButton } from "../components/AppWalletMultiButton";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-slate-900 text-white">
      <div className="text-center space-y-8 max-w-3xl">
        <h1 className="text-6xl font-extrabold bg-gradient-to-r from-teal-400 via-blue-500 to-purple-600 bg-clip-text text-transparent">
          Solana Compliant Stablecoin
        </h1>
        <p className="text-xl text-slate-400">
          The ultimate platform for remittances and decentralized credit.
          Choose your module to get started.
        </p>

        <div className="flex justify-center pt-4">
          <AppWalletMultiButton />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">
          <Link
            href="/swap"
            className="group relative bg-slate-800 p-8 rounded-3xl border border-slate-700 hover:border-teal-500 transition-all hover:shadow-2xl hover:shadow-teal-500/10"
          >
            <div className="absolute top-4 right-4 text-teal-500 opacity-0 group-hover:opacity-100 transition-opacity">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-3 text-teal-400">Swap (PSM)</h2>
            <p className="text-slate-400 text-sm">
              Instantly exchange USDC for our regulated USDT with a 1:1 peg and minimal fees. Best for remittances.
            </p>
          </Link>

          <Link
            href="/loan"
            className="group relative bg-slate-800 p-8 rounded-3xl border border-slate-700 hover:border-purple-500 transition-all hover:shadow-2xl hover:shadow-purple-500/10"
          >
            <div className="absolute top-4 right-4 text-purple-500 opacity-0 group-hover:opacity-100 transition-opacity">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-3 text-purple-400">Loan (CDP)</h2>
            <p className="text-slate-400 text-sm">
              Deposit collateral assets to mint USDT. Manage your risk, monitor health ratios, and access credit.
            </p>
          </Link>

          <Link
            href="/remit"
            className="group relative bg-slate-800 p-8 rounded-3xl border border-slate-700 hover:border-orange-500 transition-all hover:shadow-2xl hover:shadow-orange-500/10 md:col-span-2"
          >
            <div className="absolute top-4 right-4 text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-3 text-orange-400">Remit Wizard</h2>
            <p className="text-slate-400 text-sm">
              Step-by-step cross-border remittance simulation. Taiwan TWD to USA USD in minutes.
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}
