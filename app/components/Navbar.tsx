"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "./SessionProvider";
import { Shield, User, LogOut } from "lucide-react";

export function Navbar() {
    const pathname = usePathname();
    const router = useRouter();
    const { isAuthenticated, role, logout } = useSession();

    const handleLogout = () => {
        logout();
        router.push("/login");
    };

    const navLinks = isAuthenticated
        ? role === "admin"
            ? [{ name: "Admin Portal", href: "/admin", icon: <Shield size={16} /> }]
            : [
                { name: "Dashboard", href: "/dashboard", icon: <User size={16} /> },
                { name: "Transfer Hub", href: "/dashboard", icon: <Shield size={16} /> }, // Redirecting to dashboard tabs
            ]
        : [];

    return (
        <nav className="w-full bg-slate-950/80 backdrop-blur-md border-b border-slate-900 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center gap-8">
                        <Link href="/" className="text-xl font-black bg-gradient-to-r from-teal-400 to-blue-500 bg-clip-text text-transparent">
                            YTP Platform
                        </Link>

                        <div className="hidden md:block">
                            <div className="flex items-baseline space-x-2">
                                {navLinks.map((link) => {
                                    const isActive = pathname === link.href;
                                    return (
                                        <Link
                                            key={link.name}
                                            href={link.href}
                                            className={`${isActive
                                                ? "bg-slate-900 text-teal-400 border border-slate-800"
                                                : "text-slate-400 hover:text-white"
                                                } px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2`}
                                        >
                                            {link.icon}
                                            {link.name}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {isAuthenticated && (
                        <button
                            onClick={handleLogout}
                            className="text-slate-500 hover:text-red-400 transition-colors p-2"
                            title="Logout"
                        >
                            <LogOut size={20} />
                        </button>
                    )}
                </div>
            </div>
        </nav>
    );
}
