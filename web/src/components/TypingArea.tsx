"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

import type { Timeline } from "@codetype/shared";

export type TypingResult = {
  charsTotal: number;
  charsCorrect: number;
  errors: number;
  durationMs: number;
  timeline: Timeline;
};

type Props = {
  target: string;
  onComplete: (result: TypingResult) => void;
};

export function TypingArea({ target, onComplete }: Props) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [typed, setTyped] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  // Keystroke timeline: each entry is one user-visible character change.
  // Paste produces multiple entries with near-identical t — anticheat picks that up.
  const tlRef = useRef<{ t: number[]; k: number[]; c: (0 | 1)[] }>({ t: [], k: [], c: [] });

  const focus = useCallback(() => inputRef.current?.focus(), []);
  useEffect(() => focus(), [focus]);

  const handleChange = (next: string) => {
    if (done) return;
    if (next.length > target.length) return;
    const now = performance.now();
    let begin = startedAt;
    if (begin === null && next.length > 0) {
      begin = now;
      setStartedAt(now);
    }

    // Diff the previous typed string to recover per-character events.
    const prev = typed;
    const t = Math.max(0, Math.round(now - (begin ?? now)));
    if (next.length > prev.length) {
      // Forward typing or paste: emit one event per added char.
      for (let i = prev.length; i < next.length; i++) {
        const ch = next[i]!;
        tlRef.current.t.push(t);
        tlRef.current.k.push(ch.codePointAt(0) ?? 0);
        tlRef.current.c.push(ch === target[i] ? 1 : 0);
      }
    } else if (next.length < prev.length) {
      // Backspace(s): emit one BACKSPACE event per removed char.
      for (let i = 0; i < prev.length - next.length; i++) {
        tlRef.current.t.push(t);
        tlRef.current.k.push(-1);
        tlRef.current.c.push(1);
      }
    }

    setTyped(next);

    if (next.length === target.length) {
      const charsCorrect = countCorrect(next, target);
      const startedAtFinal = begin ?? now;
      setDone(true);
      onComplete({
        charsTotal: target.length,
        charsCorrect,
        errors: target.length - charsCorrect,
        durationMs: now - startedAtFinal,
        timeline: { v: 1, t: tlRef.current.t, k: tlRef.current.k, c: tlRef.current.c },
      });
    }
  };

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

  return (
    <div
      className="rounded-lg border border-zinc-800 bg-zinc-950 p-6 cursor-text leading-relaxed text-lg"
      onClick={focus}
    >
      <pre className="whitespace-pre-wrap break-words font-mono m-0">
        {spans.map((s, i) => (
          <span
            key={i}
            className={cn(
              s.state === "correct" && "text-emerald-400",
              s.state === "incorrect" && "bg-red-500/30 text-red-300",
              s.state === "pending" && "text-zinc-500",
              s.isCursor && "border-l-2 border-amber-400 -ml-px",
            )}
          >
            {s.ch === "\n" ? "↵\n" : s.ch}
          </span>
        ))}
      </pre>
      <textarea
        ref={inputRef}
        value={typed}
        onChange={(e) => handleChange(e.target.value)}
        className="sr-only"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        disabled={done}
        aria-label="Typing input"
      />
    </div>
  );
}

function countCorrect(typed: string, target: string): number {
  let n = 0;
  const len = Math.min(typed.length, target.length);
  for (let i = 0; i < len; i++) if (typed[i] === target[i]) n++;
  return n;
}
