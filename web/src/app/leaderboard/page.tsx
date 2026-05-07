"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Language, LeaderboardResponse } from "@codetype/shared";
import { getLeaderboard } from "@/lib/api";
import { apiConfigured } from "@/lib/config";

const LANGS: Language[] = ["js", "py", "c", "go"];

export default function LeaderboardPage() {
    const [lang, setLang] = useState<Language>("js");
    const [data, setData] = useState<LeaderboardResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!apiConfigured()) {
            setError("Leaderboard requires the API to be configured.");
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        getLeaderboard(lang)
            .then((r) => {
                if (!cancelled) setData(r);
            })
            .catch((e) => {
                if (!cancelled) setError(e instanceof Error ? e.message : String(e));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [lang]);

    return (
        <div className="space-y-6">
            <header className="space-y-2">
                <h1 className="text-2xl font-semibold">Leaderboard</h1>
                <p className="text-sm text-zinc-400">
                    Top 50 by accuracy-scaled WPM, this ISO week. Opt-in only — set a handle and
                    enable leaderboards in your <Link href="/dashboard" className="underline hover:text-amber-400">profile settings</Link>.
                </p>
                <p className="text-xs text-amber-400">
                    Early access — no cheat detection yet.
                </p>
            </header>

            <nav className="flex gap-2">
                {LANGS.map((l) => (
                    <button
                        key={l}
                        onClick={() => setLang(l)}
                        className={`rounded-md px-3 py-1 text-sm uppercase ${
                            lang === l
                                ? "bg-amber-500 text-zinc-950"
                                : "bg-zinc-900 text-zinc-400 hover:text-amber-400"
                        }`}
                    >
                        {l}
                    </button>
                ))}
            </nav>

            {loading && <p className="text-zinc-500">Loading…</p>}
            {error && <p className="text-rose-400">{error}</p>}

            {data && (
                <section>
                    <p className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
                        {data.lang} · {data.week}
                    </p>
                    {data.entries.length === 0 ? (
                        <p className="text-zinc-500">No entries yet this week.</p>
                    ) : (
                        <ol className="space-y-1">
                            {data.entries.map((e) => (
                                <li
                                    key={`${e.rank}-${e.handle}`}
                                    className="flex items-baseline justify-between rounded-md border border-zinc-800 bg-zinc-950 px-4 py-2"
                                >
                                    <span className="flex items-baseline gap-3">
                                        <span className="w-8 text-right font-mono text-zinc-500">
                                            {e.rank}
                                        </span>
                                        <span className="font-semibold">{e.handle}</span>
                                    </span>
                                    <span className="flex items-baseline gap-4 text-sm text-zinc-400">
                                        <span>{e.attempts} attempts</span>
                                        <span className="font-mono text-amber-400 text-base">
                                            {e.wpm_scaled.toFixed(1)} WPM
                                        </span>
                                    </span>
                                </li>
                            ))}
                        </ol>
                    )}
                </section>
            )}
        </div>
    );
}
