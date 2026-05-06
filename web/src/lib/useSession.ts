"use client";

import { useEffect, useState } from "react";
import { currentSession, type Session } from "./auth";
import { authConfigured } from "./config";

export type SessionState =
  | { status: "loading" }
  | { status: "guest" }
  | { status: "signedIn"; session: Session };

export function useSession(): SessionState & { refresh: () => void } {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!authConfigured()) {
      setState({ status: "guest" });
      return;
    }
    currentSession().then((s) => {
      if (cancelled) return;
      setState(s ? { status: "signedIn", session: s } : { status: "guest" });
    });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { ...state, refresh: () => setTick((n) => n + 1) };
}
