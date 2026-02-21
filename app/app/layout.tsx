import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { WalletContextProvider } from "../components/WalletContextProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Solana Stablecoin",
  description: "Compliant Stablecoin System on Solana",
};

import { Navbar } from "../components/Navbar";
import { SessionProvider } from "../components/SessionProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <SessionProvider>
          <WalletContextProvider>
            <Navbar />
            {children}
          </WalletContextProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
