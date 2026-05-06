import type { Attempt } from "@codetype/shared";

const KEY = "codetype.attempts.v1";

export function loadAttempts(): Attempt[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Attempt[]) : [];
  } catch {
    return [];
  }
}

export function saveAttempt(a: Attempt): void {
  if (typeof window === "undefined") return;
  const all = loadAttempts();
  all.push(a);
  window.localStorage.setItem(KEY, JSON.stringify(all));
}

export function clearAttempts(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
