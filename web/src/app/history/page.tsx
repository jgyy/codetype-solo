"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { listAttempts } from "@/lib/api";
import { apiConfigured } from "@/lib/config";
import { loadAttempts } from "@/lib/guest-store";
import { useSession } from "@/lib/useSession";
import { streak } from "@codetype/shared";
import type { Attempt } from "@codetype/shared";

export default function HistoryPage() {
  const session = useSession();
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [source, setSource] = useState<"api" | "guest">("guest");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session.status === "loading") return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (session.status === "signedIn" && apiConfigured()) {
        try {
          const r = await listAttempts("1970-01-01", "9999-12-30");
          if (!cancelled) {
            setAttempts(r.items);
            setSource("api");
          }
        } catch (err) {
          console.error("list failed; falling back to guest", err);
          if (!cancelled) {
            setAttempts(loadAttempts());
            setSource("guest");
          }
        }
      } else {
        setAttempts(loadAttempts());
        setSource("guest");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [session.status]);

  const today = new Date().toISOString().slice(0, 10);
  const dates = useMemo(() => attempts.map((a) => a.created_at.slice(0, 10)), [attempts]);
  const currentStreak = streak(dates, today);
  const sorted = useMemo(
    () => [...attempts].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [attempts],
  );

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-zinc-400 hover:text-amber-400">← Home</Link>
        <span className="text-sm text-zinc-400">
          Streak: <span className="text-amber-400 font-semibold">{currentStreak}</span> day{currentStreak === 1 ? "" : "s"}
          <span className="ml-3 text-xs text-zinc-500">({source})</span>
        </span>
      </div>
      <h1 className="text-2xl font-bold">History</h1>

      {loading ? (
        <p className="text-zinc-500">Loading…</p>
      ) : sorted.length === 0 ? (
        <p className="text-zinc-500">No attempts yet. <Link className="text-amber-400" href="/">Start one</Link>.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="py-2">When</th>
              <th>Lang</th>
              <th>WPM (net)</th>
              <th>Accuracy</th>
              <th>Errors</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a) => (
              <tr key={a.client_attempt_id || a.created_at} className="border-t border-zinc-800">
                <td className="py-2">{new Date(a.created_at).toLocaleString()}</td>
                <td>{a.language}</td>
                <td className="font-mono">{a.wpm_net.toFixed(1)}</td>
                <td>{(a.accuracy * 100).toFixed(1)}%</td>
                <td>{a.errors}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
