"use client";

import { useEffect, useState } from "react";
import { getErrorModel, type ErrorModelView } from "@/lib/api";

// Spec 013: surfaces the user's top weaknesses from the per-user error model.
// Hidden until the model has merged at least one attempt.
export function WeaknessWidget() {
    const [view, setView] = useState<ErrorModelView | null>(null);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        getErrorModel()
            .then((v) => !cancelled && setView(v))
            .catch((e) => !cancelled && setErr(String(e?.message ?? e)));
        return () => {
            cancelled = true;
        };
    }, []);

    if (err) return null;
    if (!view || !view.error_model) return null;

    const m = view.error_model;
    const topBigrams = m.bigrams.slice(0, 5);
    const topClasses = m.classes.slice(0, 5);
    if (topBigrams.length === 0 && topClasses.length === 0) return null;

    return (
        <section className="space-y-2">
            <h2 className="text-sm uppercase tracking-wide text-zinc-500">
                Your top weaknesses
                {!view.warmed_up && (
                    <span className="ml-2 text-xs normal-case text-zinc-600">
                        (warming up — needs ≥5 attempts)
                    </span>
                )}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Card title="Bigrams" rows={topBigrams.map((x) => [x.b, x.weight])} />
                <Card title="Symbol classes" rows={topClasses.map((x) => [x.c, x.weight])} />
            </div>
        </section>
    );
}

function Card({ title, rows }: { title: string; rows: Array<[string, number]> }) {
    return (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
            <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">{title}</div>
            {rows.length === 0 ? (
                <div className="text-sm text-zinc-600">none yet</div>
            ) : (
                <ul className="space-y-1 font-mono text-sm">
                    {rows.map(([k, w]) => (
                        <li key={k} className="flex items-center gap-2">
                            <span className="w-24 truncate text-zinc-300">{display(k)}</span>
                            <Bar weight={w} />
                            <span className="w-10 text-right text-xs text-zinc-500">
                                {w.toFixed(2)}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function Bar({ weight }: { weight: number }) {
    const pct = Math.max(2, Math.min(100, weight * 100));
    return (
        <div className="h-2 flex-1 overflow-hidden rounded bg-zinc-800">
            <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
        </div>
    );
}

const display = (s: string): string => (s === " " ? "␠" : s.replace(/\n/g, "\\n"));
