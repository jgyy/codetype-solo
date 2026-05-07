"use client";

import type { Attempt } from "@codetype/shared";
import { postAttempt } from "./api";
import { apiConfigured } from "./config";
import { saveAttempt as saveGuest } from "./guest-store";
import { currentSession } from "./auth";

export type PersistResult = {
  destination: "api" | "guest";
  leaderboardUpdated: boolean;
};

export async function persistAttempt(a: Attempt): Promise<PersistResult> {
  if (apiConfigured()) {
    const s = await currentSession();
    if (s) {
      try {
        const r = await postAttempt(a);
        return { destination: "api", leaderboardUpdated: r.leaderboard_updated === true };
      } catch (err) {
        console.error("postAttempt failed; falling back to guest", err);
      }
    }
  }
  saveGuest(a);
  return { destination: "guest", leaderboardUpdated: false };
}
