"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Navbar() {
    const pathname = usePathname();

    const navLinks = [
        { name: "Swap (PSM)", href: "/swap" },
        { name: "Remit", href: "/remit" },
        { name: "Loan (CDP)", href: "/loan" },
        { name: "Admin", href: "/admin" },
    ];

    return (
        <nav className="w-full bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center gap-8">
                        <Link href="/" className="text-xl font-bold bg-gradient-to-r from-teal-400 to-blue-500 bg-clip-text text-transparent">
                            YTP Stable
                        </Link>

                        <div className="hidden md:block">
                            <div className="flex items-baseline space-x-4">
                                {navLinks.map((link) => {
                                    const isActive = pathname === link.href;
                                    return (
                                        <Link
                                            key={link.name}
                                            href={link.href}
                                            className={`${isActive
                                                ? "bg-slate-800 text-teal-400"
                                                : "text-slate-300 hover:bg-slate-700 hover:text-white"
                                                } px-3 py-2 rounded-md text-sm font-medium transition-colors`}
                                        >
                                            {link.name}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    );
}
