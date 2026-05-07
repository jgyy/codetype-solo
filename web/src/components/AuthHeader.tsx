"use client";

import Link from "next/link";
import { signOut } from "@/lib/auth";
import { authConfigured } from "@/lib/config";
import { useSession } from "@/lib/useSession";

export function AuthHeader() {
  const s = useSession();
  return (
    <div className="flex items-center justify-between text-sm pb-6 border-b border-zinc-800 mb-6">
      <Link href="/" className="font-semibold hover:text-amber-400">CodeType Solo</Link>
      <div className="flex items-center gap-4 text-zinc-400">
        <Link href="/history" className="hover:text-amber-400">History</Link>
        <Link href="/leaderboard" className="hover:text-amber-400">Leaderboard</Link>
        <Link href="/dashboard" className="hover:text-amber-400">Dashboard</Link>
        {s.status === "loading" ? (
          <span>…</span>
        ) : s.status === "signedIn" ? (
          <span className="flex items-center gap-2">
            <span className="text-emerald-400">{s.session.email}</span>
            <button
              onClick={() => {
                signOut();
                s.refresh();
              }}
              className="text-zinc-500 hover:text-amber-400"
            >
              Sign out
            </button>
          </span>
        ) : authConfigured() ? (
          <Link href="/signin" className="text-amber-400 hover:text-amber-300">Sign in</Link>
        ) : (
          <span className="text-zinc-500" title="Set NEXT_PUBLIC_COGNITO_* in .env.local">Guest mode</span>
        )}
      </div>
    </div>
  );
}
