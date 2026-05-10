"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ReplayPlayer } from "@/components/ReplayPlayer";
import { ResultCard } from "@/components/ResultCard";
import { TypingArea, type TypingResult } from "@/components/TypingArea";
import { persistAttempt } from "@/lib/persist";
import { getDaily, getDrillSnippet, getErrorModel, getNextSnippet, getSnippet, type ErrorModelView, type SelectionMode } from "@/lib/api";
import { apiConfigured } from "@/lib/config";
import { pickRandom, SNIPPETS } from "@/lib/snippets";
import {
  accuracyScaledWpm,
  detectClasses,
  grossWpm,
  netWpm,
  type Attempt,
  type Language,
  type Snippet,
} from "@codetype/shared";

const VALID: Language[] = ["js", "py", "c", "go"];

export default function PlayPage() {
  return (
    <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
      <PlayInner />
    </Suspense>
  );
}

function PlayInner() {
  const params = useSearchParams();
  const isDaily = params.get("daily") === "1";
  const lang = (params.get("lang") as Language) ?? "js";
  const language: Language = VALID.includes(lang) ? lang : "js";

  const [snippet, setSnippet] = useState<Snippet | null>(null);
  const [result, setResult] = useState<TypingResult | null>(null);
  const [nonce, setNonce] = useState(0);
  const [cheatScore, setCheatScore] = useState<number | undefined>(undefined);
  const [cheatReasons, setCheatReasons] = useState<string[] | undefined>(undefined);
  // Spec 013: selection mode. Adaptive falls back to random server-side
  // when the user is cold-started (attempts_merged < 5), surfaced via
  // selectionMode === "warming_up".
  const [mode, setMode] = useState<SelectionMode | "drill">("adaptive");
  const [drillClass, setDrillClass] = useState("arrow");
  const [selectionMode, setSelectionMode] = useState<"adaptive" | "random" | "warming_up" | null>(null);
  const [errorModel, setErrorModel] = useState<ErrorModelView | null>(null);

  useEffect(() => {
    if (!apiConfigured()) return;
    let cancelled = false;
    getErrorModel().then((v) => !cancelled && setErrorModel(v)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [result]); // refresh after each completed attempt

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setSelectionMode(null);
    (async () => {
      if (isDaily && apiConfigured()) {
        try {
          const date = new Date().toISOString().slice(0, 10);
          const seed = await getDaily(date);
          const fromApi = await getSnippet(seed.language, seed.snippet_id).catch(() => null);
          const local = SNIPPETS.find((s) => s.id === seed.snippet_id);
          if (cancelled) return;
          if (fromApi) {
            setSnippet({
              id: seed.snippet_id,
              language: seed.language,
              title: fromApi.title,
              code: fromApi.code,
              difficulty: 3,
            });
            return;
          }
          if (local) {
            setSnippet(local);
            return;
          }
        } catch (err) {
          console.error("daily fetch failed", err);
        }
      }

      // Spec 013: server-side selection when API is configured.
      if (apiConfigured() && !isDaily) {
        try {
          if (mode === "drill") {
            const d = await getDrillSnippet(language, drillClass);
            if (cancelled) return;
            setSnippet({
              id: d.id,
              language: d.language,
              title: d.title,
              code: d.code,
              difficulty: 1,
            });
            setSelectionMode(null);
            return;
          }
          const next = await getNextSnippet(language, mode);
          if (cancelled) return;
          setSnippet({
            id: next.snippet.id ?? next.snippet.SK.replace(/^SNIPPET#/, ""),
            language: next.snippet.language,
            title: next.snippet.title,
            code: next.snippet.code,
            difficulty: 3,
          });
          setSelectionMode(next.selection_mode);
          return;
        } catch (err) {
          console.error("server snippet selection failed; using local pool", err);
        }
      }
      if (!cancelled) setSnippet(pickRandom(language));
    })();
    return () => {
      cancelled = true;
    };
  }, [language, nonce, isDaily, mode, drillClass]);

  const onComplete = (r: TypingResult) => {
    setResult(r);
    setCheatScore(undefined);
    setCheatReasons(undefined);
    if (!snippet) return;
    const accuracy = r.charsTotal > 0 ? r.charsCorrect / r.charsTotal : 0;
    const a: Attempt = {
      snippet_id: snippet.id,
      language: snippet.language,
      wpm_gross: grossWpm(r),
      wpm_net: netWpm(r),
      wpm_scaled: accuracyScaledWpm(r),
      accuracy,
      errors: r.errors,
      duration_ms: Math.round(r.durationMs),
      chars_total: r.charsTotal,
      chars_correct: r.charsCorrect,
      created_at: new Date().toISOString(),
      client_attempt_id: crypto.randomUUID(),
      timeline: r.timeline,
    };
    persistAttempt(a).then((res) => {
      setCheatScore(res.cheatScore);
      setCheatReasons(res.cheatReasons);
    });
  };

  const headline = useMemo(() => (snippet ? `${snippet.title} · ${snippet.language}` : ""), [snippet]);

  // Spec 013: explain why this snippet was picked. Shown only when adaptive
  // selection actually fired (not warming-up, not random). The pick rationale
  // is the highest-weighted weakness that this snippet *contains*.
  const adaptiveReason = useMemo(() => {
    if (selectionMode !== "adaptive" || !snippet || !errorModel?.error_model) return null;
    const m = errorModel.error_model;
    const code = snippet.code;
    const bigramHit = m.bigrams.find((x) => x.weight > 0 && code.includes(x.b));
    const presentClasses = detectClasses(snippet.language, code);
    const classHit = m.classes.find(
      (x) => x.weight > 0 && (presentClasses.get(x.c) ?? 0) > 0,
    );
    const bigram = bigramHit?.b;
    const klass = classHit?.c;
    if (!bigram && !klass) return null;
    if (bigram && klass) return `targets your \`${bigram}\` and \`${klass}\` weakness`;
    return `targets your \`${(bigram ?? klass)!}\` weakness`;
  }, [selectionMode, snippet, errorModel]);

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-zinc-400 hover:text-amber-400">← Home</Link>
        <button
          onClick={() => setNonce((n) => n + 1)}
          className="text-sm text-zinc-400 hover:text-amber-400"
        >
          Skip / new snippet
        </button>
      </div>
      <h1 className="text-xl font-semibold">{headline}</h1>

      {!isDaily && apiConfigured() && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {(["adaptive", "random", "drill"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setNonce((n) => n + 1);
              }}
              className={
                "rounded px-3 py-1 " +
                (mode === m
                  ? "bg-amber-400 text-zinc-900"
                  : "bg-zinc-800 text-zinc-300 hover:text-amber-400")
              }
            >
              {m === "adaptive" ? "Adaptive" : m === "random" ? "Random" : "Drill"}
            </button>
          ))}
          {mode === "drill" && (
            <select
              value={drillClass}
              onChange={(e) => {
                setDrillClass(e.target.value);
                setNonce((n) => n + 1);
              }}
              className="rounded bg-zinc-800 px-2 py-1 text-zinc-200"
            >
              <option value="arrow">arrow</option>
              <option value="template-literal">template-literal</option>
            </select>
          )}
          {selectionMode === "warming_up" && (
            <span className="text-xs text-zinc-500">warming up — collect 5 attempts to unlock adaptive</span>
          )}
          {selectionMode === "adaptive" && (
            <span className="text-xs text-emerald-500">
              {adaptiveReason ?? "targeting your weakest patterns"}
            </span>
          )}
        </div>
      )}

      {snippet && !result && (
        <TypingArea key={snippet.id + ":" + nonce} target={snippet.code} onComplete={onComplete} />
      )}
      {result && (
        <ResultCard
          {...result}
          cheatScore={cheatScore}
          cheatReasons={cheatReasons}
          onAgain={() => setNonce((n) => n + 1)}
        />
      )}
      {result && snippet && (
        <ReplayPlayer target={snippet.code} timeline={result.timeline} />
      )}
    </main>
  );
}
