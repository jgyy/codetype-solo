"use client";

import { useEffect, useState } from "react";
import { ApiError, upsertProfile, type ProfileResponse } from "@/lib/api";

type Status = "idle" | "saving" | "saved" | "error";

export function ProfileSettings() {
    const [handle, setHandle] = useState("");
    const [optin, setOptin] = useState(false);
    const [status, setStatus] = useState<Status>("idle");
    const [message, setMessage] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        upsertProfile()
            .then((p: ProfileResponse) => {
                if (cancelled) return;
                setHandle(p.handle ?? "");
                setOptin(p.leaderboard_optin ?? false);
            })
            .catch((e) => {
                if (!cancelled) setMessage(e instanceof Error ? e.message : String(e));
            })
            .finally(() => {
                if (!cancelled) setLoaded(true);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    async function save() {
        setStatus("saving");
        setMessage(null);
        try {
            const patch: { handle?: string; leaderboard_optin?: boolean } = {
                leaderboard_optin: optin,
            };
            if (handle.trim().length > 0) patch.handle = handle.trim();
            await upsertProfile(patch);
            setStatus("saved");
            setMessage("Saved.");
        } catch (e) {
            setStatus("error");
            if (e instanceof ApiError) {
                setMessage(`${e.code}: ${e.message}`);
            } else {
                setMessage(e instanceof Error ? e.message : String(e));
            }
        }
    }

    if (!loaded) return <p className="text-zinc-500">Loading profile…</p>;

    const handleInvalid = handle.length > 0 && !/^[a-z0-9_-]{2,24}$/.test(handle);

    return (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 space-y-3">
            <h3 className="text-sm uppercase tracking-wide text-zinc-500">Profile</h3>
            <label className="block space-y-1">
                <span className="text-xs text-zinc-400">Public handle (≥2, ≤24, [a-z0-9_-])</span>
                <input
                    type="text"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="kestrel"
                    className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono"
                />
                {handleInvalid && (
                    <span className="text-xs text-rose-400">
                        Use 2–24 lowercase letters, digits, hyphen or underscore.
                    </span>
                )}
            </label>
            <label className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={optin}
                    onChange={(e) => setOptin(e.target.checked)}
                />
                <span className="text-sm">Show me on the public leaderboard</span>
            </label>
            <div className="flex items-center gap-3">
                <button
                    onClick={save}
                    disabled={status === "saving" || handleInvalid}
                    className="rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
                >
                    {status === "saving" ? "Saving…" : "Save"}
                </button>
                {message && (
                    <span className={status === "error" ? "text-rose-400 text-xs" : "text-zinc-500 text-xs"}>
                        {message}
                    </span>
                )}
            </div>
        </div>
    );
}
