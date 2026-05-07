"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listAttempts } from "@/lib/api";
import { apiConfigured } from "@/lib/config";
import { loadAttempts } from "@/lib/guest-store";
import { useSession } from "@/lib/useSession";
import { WpmChart } from "@/components/WpmChart";
import { ProfileSettings } from "@/components/ProfileSettings";
import type { Attempt } from "@codetype/shared";

export default function DashboardPage() {
  const session = useSession();
  const [attempts, setAttempts] = useState<Attempt[]>([]);

  useEffect(() => {
    if (session.status === "loading") return;
    (async () => {
      if (session.status === "signedIn" && apiConfigured()) {
        try {
          const r = await listAttempts("1970-01-01", "9999-12-30");
          setAttempts(r.items);
          return;
        } catch (e) {
          console.error(e);
        }
      }
      setAttempts(loadAttempts());
    })();
  }, [session.status]);

  const avgNet = attempts.length
    ? attempts.reduce((s, a) => s + a.wpm_net, 0) / attempts.length
    : 0;
  const best = attempts.reduce((m, a) => Math.max(m, a.wpm_net), 0);

  return (
    <main className="space-y-6">
      <Link href="/" className="text-sm text-zinc-400 hover:text-amber-400">← Home</Link>
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Attempts" value={String(attempts.length)} />
        <Stat label="Avg WPM (net)" value={avgNet.toFixed(1)} />
        <Stat label="Best WPM (net)" value={best.toFixed(1)} />
      </div>

      <section className="space-y-2">
        <h2 className="text-sm uppercase tracking-wide text-zinc-500">Net WPM over time</h2>
        <WpmChart attempts={attempts} />
      </section>

      {session.status === "signedIn" && apiConfigured() && (
        <section className="space-y-2">
          <h2 className="text-sm uppercase tracking-wide text-zinc-500">Settings</h2>
          <ProfileSettings />
        </section>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-2xl font-mono">{value}</div>
    </div>
  );
}
