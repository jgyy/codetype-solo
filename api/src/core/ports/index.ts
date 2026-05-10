export type { ClockPort } from "./clock-port";
export type { IdPort } from "./id-port";

// Repo interfaces are re-exported here so use-cases import from `core/ports/*`
// instead of reaching into adapter folders.
export type { AttemptsRepo as AttemptsPort, NewAttempt, AttemptRow } from "../../repos/attempts";
export type { DailyRepo as DailyPort, DailySeedRow } from "../../repos/daily";
export type { ProfileRepo as ProfilePort } from "../../repos/profile";
export type {
    SnippetsRepo as SnippetsPort,
    SnippetRow,
} from "../../repos/snippets";
export type { LeaderboardRepo as LeaderboardPort } from "../../repos/leaderboard";
export type { SubmissionsRepo as SubmissionsPort } from "../../repos/submissions";
