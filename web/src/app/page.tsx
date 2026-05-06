import Link from "next/link";
import type { Language } from "@codetype/shared";

const LANGS: { id: Language; label: string }[] = [
  { id: "js", label: "JavaScript" },
  { id: "py", label: "Python" },
  { id: "c", label: "C" },
  { id: "go", label: "Go" },
];

export default function Home() {
  return (
    <main className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">CodeType Solo</h1>
        <p className="text-zinc-400">
          Daily code-typing trainer. Pick a language to start. Guest mode keeps history in your browser.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-wide text-zinc-500">Pick a language</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {LANGS.map((l) => (
            <Link
              key={l.id}
              href={`/play?lang=${l.id}`}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-6 text-center hover:border-amber-500"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </section>

      <section>
        <Link
          href="/play?daily=1"
          className="block rounded-lg border border-amber-500/40 bg-amber-500/10 px-5 py-4 hover:bg-amber-500/20"
        >
          <div className="text-amber-400 font-semibold">Today’s daily challenge →</div>
          <div className="text-xs text-zinc-400">Same snippet for everyone, picked from the date.</div>
        </Link>
      </section>
    </main>
  );
}
