"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Timeline } from "@codetype/shared";

type Props = {
    target: string;
    timeline: Timeline;
};

const SPEEDS = [0.5, 1, 2] as const;
type Speed = (typeof SPEEDS)[number];

// Reconstruct the typed string at a given event index. We replay events
// purely from the timeline (no server round-trips).
function snapshotAt(target: string, timeline: Timeline, eventIdx: number): string {
    let buf = "";
    for (let i = 0; i <= eventIdx && i < timeline.k.length; i++) {
        const k = timeline.k[i]!;
        if (k === -1) {
            buf = buf.slice(0, -1); // backspace
        } else if (k > 0) {
            buf += String.fromCodePoint(k);
        }
    }
    // Cap length to target so the renderer doesn't go past the snippet.
    return buf.slice(0, target.length);
}

export function ReplayPlayer({ target, timeline }: Props) {
    const [idx, setIdx] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [speed, setSpeed] = useState<Speed>(1);
    const rafRef = useRef<number | null>(null);
    const playStartRef = useRef<{ wallClockMs: number; baseTimelineMs: number } | null>(null);

    const lastT = timeline.t[timeline.t.length - 1] ?? 0;

    useEffect(() => {
        if (!playing) {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
            playStartRef.current = null;
            return;
        }
        playStartRef.current = {
            wallClockMs: performance.now(),
            baseTimelineMs: timeline.t[idx] ?? 0,
        };
        const tick = () => {
            const start = playStartRef.current;
            if (!start) return;
            const elapsed = (performance.now() - start.wallClockMs) * speed;
            const targetMs = start.baseTimelineMs + elapsed;
            // Advance index to the latest event whose t <= targetMs.
            let next = idx;
            while (next + 1 < timeline.t.length && timeline.t[next + 1]! <= targetMs) {
                next++;
            }
            if (next !== idx) setIdx(next);
            if (next + 1 >= timeline.t.length) {
                setPlaying(false);
                return;
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playing, speed]);

    const typed = useMemo(
        () => snapshotAt(target, timeline, idx),
        [target, timeline, idx],
    );

    const spans = useMemo(() => {
        const out: { ch: string; state: "correct" | "incorrect" | "pending"; isCursor: boolean }[] = [];
        for (let i = 0; i < target.length; i++) {
            const ch = target[i]!;
            let state: "correct" | "incorrect" | "pending" = "pending";
            if (i < typed.length) state = typed[i] === ch ? "correct" : "incorrect";
            out.push({ ch, state, isCursor: i === typed.length });
        }
        return out;
    }, [target, typed]);

    const progressPct = lastT === 0 ? 0 : Math.min(100, Math.round(((timeline.t[idx] ?? 0) / lastT) * 100));

    return (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 space-y-3">
            <div className="text-xs uppercase tracking-wide text-zinc-500">Replay</div>
            <pre className="whitespace-pre-wrap break-words font-mono m-0 text-sm leading-relaxed">
                {spans.map((s, i) => (
                    <span
                        key={i}
                        className={
                            s.state === "correct"
                                ? "text-emerald-400"
                                : s.state === "incorrect"
                                  ? "bg-red-500/30 text-red-300"
                                  : "text-zinc-500"
                        }
                    >
                        {s.ch === "\n" ? "↵\n" : s.ch}
                    </span>
                ))}
            </pre>
            <div className="flex items-center gap-3 text-xs text-zinc-400">
                <button
                    onClick={() => {
                        if (idx >= timeline.t.length - 1) setIdx(0);
                        setPlaying((p) => !p);
                    }}
                    className="rounded-md border border-zinc-700 px-2 py-1 hover:border-amber-400 hover:text-amber-400"
                >
                    {playing ? "Pause" : idx >= timeline.t.length - 1 ? "Restart" : "Play"}
                </button>
                <button
                    onClick={() => {
                        setPlaying(false);
                        setIdx(0);
                    }}
                    className="rounded-md border border-zinc-700 px-2 py-1 hover:border-amber-400 hover:text-amber-400"
                >
                    Reset
                </button>
                <input
                    type="range"
                    min={0}
                    max={Math.max(0, timeline.t.length - 1)}
                    value={idx}
                    onChange={(e) => {
                        setPlaying(false);
                        setIdx(Number(e.target.value));
                    }}
                    className="flex-1"
                />
                <span className="font-mono w-10 text-right">{progressPct}%</span>
                <div className="flex gap-1">
                    {SPEEDS.map((s) => (
                        <button
                            key={s}
                            onClick={() => setSpeed(s)}
                            className={`rounded-md px-2 py-1 ${
                                speed === s
                                    ? "bg-amber-500 text-zinc-950"
                                    : "border border-zinc-700 hover:border-amber-400"
                            }`}
                        >
                            {s}×
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
