"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export type TypingResult = {
  charsTotal: number;
  charsCorrect: number;
  errors: number;
  durationMs: number;
};

type Props = {
  target: string;
  onComplete: (result: TypingResult) => void;
};

export function TypingArea({ target, onComplete }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [done, setDone] = useState(false);

  const focus = useCallback(() => inputRef.current?.focus(), []);
  useEffect(() => focus(), [focus]);

  const handleChange = (next: string) => {
    if (done) return;
    if (next.length > target.length) return;
    if (startedAt === null && next.length > 0) setStartedAt(performance.now());
    setTyped(next);

    if (next.length === target.length) {
      const charsCorrect = countCorrect(next, target);
      const begin = startedAt ?? performance.now();
      setDone(true);
      onComplete({
        charsTotal: target.length,
        charsCorrect,
        errors: target.length - charsCorrect,
        durationMs: performance.now() - begin,
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
      <input
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
