"use client";

import type { Attempt } from "@codetype/shared";
import { postAttempt } from "./api";
import { apiConfigured } from "./config";
import { saveAttempt as saveGuest } from "./guest-store";
import { currentSession } from "./auth";

export async function persistAttempt(a: Attempt): Promise<"api" | "guest"> {
  if (apiConfigured()) {
    const s = await currentSession();
    if (s) {
      try {
        await postAttempt(a);
        return "api";
      } catch (err) {
        console.error("postAttempt failed; falling back to guest", err);
      }
    }
  }
  saveGuest(a);
  return "guest";
}
