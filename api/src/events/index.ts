import type { Projector } from "./types";
import { leaderboardProjector } from "./projectors/leaderboard";
import { streakAuditProjector } from "./projectors/streak-audit";
import { achievementsProjector } from "./projectors/achievements";

// Order is informational only — the events Lambda fans out via
// `Promise.allSettled` so projectors run concurrently and do not depend on
// each other. Projector SK namespaces must remain disjoint (spec 011 risk
// register).
export const projectors: readonly Projector[] = [
    leaderboardProjector,
    streakAuditProjector,
    achievementsProjector,
];

export type { DomainEvent, DomainEventType, Projector, ProjectorCtx } from "./types";
export { decode } from "./decode";
