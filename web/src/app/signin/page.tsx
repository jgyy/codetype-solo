"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmSignUp, signIn, signUp } from "@/lib/auth";
import { upsertProfile } from "@/lib/api";

type Mode = "signin" | "signup" | "confirm";

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signin") {
        await signIn(email, password);
        await upsertProfile().catch(() => undefined);
        router.push("/");
      } else if (mode === "signup") {
        await signUp(email, password);
        setMode("confirm");
      } else {
        await confirmSignUp(email, code);
        setMode("signin");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="space-y-6 max-w-sm">
      <h1 className="text-2xl font-bold">
        {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Confirm email"}
      </h1>

      <form onSubmit={submit} className="space-y-3">
        <input
          type="email"
          required
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md bg-zinc-950 border border-zinc-800 px-3 py-2"
          autoComplete="email"
        />
        {mode !== "confirm" && (
          <input
            type="password"
            required
            minLength={8}
            placeholder="password (≥8 chars, 1 lower, 1 number)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md bg-zinc-950 border border-zinc-800 px-3 py-2"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />
        )}
        {mode === "confirm" && (
          <input
            required
            placeholder="confirmation code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full rounded-md bg-zinc-950 border border-zinc-800 px-3 py-2"
          />
        )}
        <button
          disabled={busy}
          className="w-full rounded-md bg-amber-500 px-4 py-2 font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
        >
          {busy ? "…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Confirm"}
        </button>
      </form>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="text-sm text-zinc-400 space-x-4">
        {mode !== "signin" && (
          <button onClick={() => setMode("signin")} className="hover:text-amber-400">Sign in</button>
        )}
        {mode !== "signup" && (
          <button onClick={() => setMode("signup")} className="hover:text-amber-400">Create account</button>
        )}
        {mode !== "confirm" && (
          <button onClick={() => setMode("confirm")} className="hover:text-amber-400">Have a code?</button>
        )}
      </div>
    </main>
  );
}
