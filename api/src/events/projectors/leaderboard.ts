import { ok } from "@codetype/shared";
import type { Projector } from "../types";

// Phase 1: skeleton. Phase 2 will replace `handle` with a call into
// `syncLeaderboardForUser` from api/src/lib/lb-sync.ts, gated on the cheat
// score already stamped on the attempt image.
export const leaderboardProjector: Projector = {
    name: "leaderboard",
    handles: ["AttemptRecorded"],
    async handle(event, ctx) {
        ctx.log.info("projector_skipped_stub", {
            projector: "leaderboard",
            event_type: event.type,
        });
        return ok(undefined);
    },
};
