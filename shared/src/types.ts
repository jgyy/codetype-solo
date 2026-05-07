export type Language = "js" | "py" | "c" | "go";

export type Snippet = {
  id: string;
  language: Language;
  title: string;
  code: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
};

// Optional `timeline` carries a compressed keystroke trace for replay /
// anti-cheat (spec 007). Old clients omitting it are still accepted.
import type { Timeline } from "./anticheat";

export type Attempt = {
  snippet_id: string;
  language: Language;
  wpm_gross: number;
  wpm_net: number;
  wpm_scaled: number;
  accuracy: number;
  errors: number;
  duration_ms: number;
  chars_total: number;
  chars_correct: number;
  created_at: string;
  client_attempt_id: string;
  timeline?: Timeline;
};

export type DailySeed = {
  date: string;
  snippet_id: string;
  language: Language;
};
