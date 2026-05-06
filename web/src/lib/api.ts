"use client";

import type { Attempt, Language } from "@codetype/shared";
import { CONFIG } from "./config";
import { currentSession } from "./auth";

async function authHeaders(): Promise<HeadersInit> {
  const s = await currentSession();
  return s ? { authorization: `Bearer ${s.idToken}` } : {};
}

async function jsonFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = {
    "content-type": "application/json",
    ...(await authHeaders()),
    ...(init.headers ?? {}),
  };
  const res = await fetch(`${CONFIG.apiUrl}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${path}`);
  return (await res.json()) as T;
}

export type AttemptItem = Attempt & {
  PK: string;
  SK: string;
  GSI1SK: string;
  wpm_mismatch?: boolean;
};

export async function postAttempt(a: Attempt): Promise<{ ok: boolean }> {
  return jsonFetch("/attempts", { method: "POST", body: JSON.stringify(a) });
}

export async function listAttempts(from: string, to: string): Promise<{ items: AttemptItem[] }> {
  return jsonFetch(`/attempts?from=${from}&to=${to}`);
}

export type DailySeed = { snippet_id: string; language: Language };

export async function getDaily(date: string): Promise<DailySeed> {
  return jsonFetch(`/daily?date=${date}`);
}

export async function getSnippet(language: Language, id: string) {
  return jsonFetch<{ code: string; title: string; language: Language }>(
    `/snippets/${language}/${id}`,
  );
}

export async function upsertProfile(): Promise<{ ok: boolean; created: boolean }> {
  return jsonFetch("/profile", { method: "POST", body: "{}" });
}
