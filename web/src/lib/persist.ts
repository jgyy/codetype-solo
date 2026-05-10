"use client";

import type { Attempt } from "@codetype/shared";
import { postAttempt } from "./api";
import { apiConfigured } from "./config";
import { saveAttempt as saveGuest } from "./guest-store";
import { currentSession } from "./auth";

export type PersistResult = {
  destination: "api" | "guest";
  cheatScore?: number;
  cheatReasons?: string[];
};

export async function persistAttempt(a: Attempt): Promise<PersistResult> {
  if (apiConfigured()) {
    const s = await currentSession();
    if (s) {
      try {
        const r = await postAttempt(a);
        if ("duplicate" in r) {
          return { destination: "api" };
        }
        return {
          destination: "api",
          cheatScore: r.cheat_score,
          cheatReasons: r.cheat_reasons,
        };
      } catch (err) {
        console.error("postAttempt failed; falling back to guest", err);
      }
    }
  }
  saveGuest(a);
  return { destination: "guest" };
}
