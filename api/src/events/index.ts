import type { Projector } from "./types";
import { leaderboardProjector } from "./projectors/leaderboard";
import { streakAuditProjector } from "./projectors/streak-audit";
import { achievementsProjector } from "./projectors/achievements";

export const projectors: readonly Projector[] = [
    leaderboardProjector,
    streakAuditProjector,
    achievementsProjector,
];

export type { DomainEvent, DomainEventType, Projector, ProjectorCtx } from "./types";
export { decode } from "./decode";
