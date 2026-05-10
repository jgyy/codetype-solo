import { ok } from "@codetype/shared";
import type { Projector } from "../types";

// Phase 1: skeleton. Phase 2 will:
//   1. Re-derive streak from last 7 days of attempts (AttemptsRepo.listByUser).
//   2. Compare against profile.streak_value.
//   3. On drift: conditional write `streak_value = :expected` to self-heal,
//      and emit a `streak_drift_corrected` warn log with old/new values.
export const streakAuditProjector: Projector = {
    name: "streak-audit",
    handles: ["AttemptRecorded"],
    async handle(event, ctx) {
        ctx.log.info("projector_skipped_stub", {
            projector: "streak-audit",
            event_type: event.type,
        });
        return ok(undefined);
    },
};
