"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Language } from "@codetype/shared";
import {
    ApiError,
    listMySubmissions,
    submitSnippet,
    type SubmissionDtoView,
} from "@/lib/api";
import { apiConfigured } from "@/lib/config";
import { useSession } from "@/lib/useSession";

const LANGS: Language[] = ["js", "py", "c", "go"];

export default function SubmitPage() {
    const session = useSession();
    const [language, setLanguage] = useState<Language>("js");
    const [title, setTitle] = useState("");
    const [code, setCode] = useState("");
    const [difficulty, setDifficulty] = useState<1 | 2 | 3 | 4 | 5>(2);
    const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
    const [message, setMessage] = useState<string | null>(null);
    const [mine, setMine] = useState<SubmissionDtoView[]>([]);

    async function refresh() {
        try {
            const r = await listMySubmissions();
            setMine(r.items);
        } catch (e) {
            // Stay quiet on read failure; surface only on submit.
            console.error(e);
        }
    }

    useEffect(() => {
        if (session.status === "signedIn" && apiConfigured()) refresh();
    }, [session.status]);

    if (!apiConfigured()) {
        return <p className="text-zinc-500">API not configured.</p>;
    }
    if (session.status !== "signedIn") {
        return (
            <p className="text-zinc-400">
                <Link href="/signin" className="underline hover:text-amber-400">Sign in</Link> to submit snippets.
            </p>
        );
    }

    async function submit() {
        setStatus("saving");
        setMessage(null);
        try {
            await submitSnippet({ language, title, code, difficulty });
            setTitle("");
            setCode("");
            setStatus("saved");
            setMessage("Submitted. A moderator will review shortly.");
            await refresh();
        } catch (e) {
            setStatus("error");
            if (e instanceof ApiError) {
                setMessage(`${e.code}: ${e.message}`);
            } else {
                setMessage(e instanceof Error ? e.message : String(e));
            }
        }
    }

    const codeTooShort = code.length < 20;
    const codeTooLong = code.length > 400;
    const titleInvalid = title.length < 3 || title.length > 80;
    const submitDisabled =
        status === "saving" || codeTooShort || codeTooLong || titleInvalid;

    return (
        <main className="space-y-6">
            <header>
                <h1 className="text-2xl font-semibold">Submit a snippet</h1>
                <p className="text-sm text-zinc-400">
                    Code 20–400 chars. Up to 5 submissions per 24 hours. A moderator approves before
                    it joins the daily pool.
                </p>
            </header>

            <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                        <span className="text-xs text-zinc-400">Language</span>
                        <select
                            value={language}
                            onChange={(e) => setLanguage(e.target.value as Language)}
                            className="block w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2"
                        >
                            {LANGS.map((l) => (
                                <option key={l} value={l}>
                                    {l}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-xs text-zinc-400">Difficulty (1–5)</span>
                        <select
                            value={difficulty}
                            onChange={(e) => setDifficulty(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
                            className="block w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2"
                        >
                            {[1, 2, 3, 4, 5].map((d) => (
                                <option key={d} value={d}>
                                    {d}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
                <label className="block">
                    <span className="text-xs text-zinc-400">Title (3–80 chars)</span>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. Promise.all map"
                        className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono"
                    />
                </label>
                <label className="block">
                    <span className="text-xs text-zinc-400">
                        Code ({code.length}/400)
                    </span>
                    <textarea
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        rows={8}
                        placeholder="One short, idiomatic snippet"
                        className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm"
                    />
                </label>
                <div className="flex items-center gap-3">
                    <button
                        onClick={submit}
                        disabled={submitDisabled}
                        className="rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
                    >
                        {status === "saving" ? "Submitting…" : "Submit"}
                    </button>
                    {message && (
                        <span className={status === "error" ? "text-rose-400 text-xs" : "text-zinc-500 text-xs"}>
                            {message}
                        </span>
                    )}
                </div>
            </section>

            <section className="space-y-2">
                <h2 className="text-sm uppercase tracking-wide text-zinc-500">My submissions</h2>
                {mine.length === 0 ? (
                    <p className="text-zinc-500 text-sm">None yet.</p>
                ) : (
                    <ul className="space-y-1">
                        {mine.map((s) => (
                            <li
                                key={s.id}
                                className="flex flex-col gap-1 rounded-md border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm"
                            >
                                <div className="flex items-baseline justify-between">
                                    <span className="font-semibold">{s.title}</span>
                                    <span
                                        className={
                                            s.status === "APPROVED"
                                                ? "text-emerald-400"
                                                : s.status === "REJECTED"
                                                  ? "text-rose-400"
                                                  : "text-amber-400"
                                        }
                                    >
                                        {s.status}
                                    </span>
                                </div>
                                <div className="text-xs text-zinc-500">
                                    {s.language} · diff {s.difficulty} · {s.created_at.slice(0, 10)}
                                </div>
                                {s.reject_reason && (
                                    <div className="text-xs text-rose-300">Reason: {s.reject_reason}</div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </main>
    );
}
