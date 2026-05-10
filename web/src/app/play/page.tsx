"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ReplayPlayer } from "@/components/ReplayPlayer";
import { ResultCard } from "@/components/ResultCard";
import { TypingArea, type TypingResult } from "@/components/TypingArea";
import { persistAttempt } from "@/lib/persist";
import { getDaily, getSnippet } from "@/lib/api";
import { apiConfigured } from "@/lib/config";
import { pickRandom, SNIPPETS } from "@/lib/snippets";
import {
  accuracyScaledWpm,
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

  useEffect(() => {
    let cancelled = false;
    setResult(null);
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
      if (!cancelled) setSnippet(pickRandom(language));
    })();
    return () => {
      cancelled = true;
    };
  }, [language, nonce, isDaily]);

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
