"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../components/SessionProvider";
import { Loader2 } from "lucide-react";

export default function Home() {
  const { isAuthenticated, role } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
    } else {
      router.push(role === "admin" ? "/admin" : "/dashboard");
    }
  }, [isAuthenticated, role, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-white">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="animate-spin text-teal-500" size={48} />
        <p className="text-slate-500 font-bold animate-pulse">Redirecting to YTP Platform...</p>
      </div>
    </main>
  );
}
