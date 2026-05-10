import { ok } from "@codetype/shared";
import type { Projector } from "../types";

// Phase 1: stub for spec 015. The contract is fixed now so spec 015 only
// needs to fill in `handle` — no plumbing changes elsewhere.
//
// Idempotency contract (spec 011 §Idempotency): writes go to
// `USER#<sub> / ACHIEVEMENT#<id>` with `attribute_not_exists(SK)`, so
// re-delivery of the same event is a no-op.
export const achievementsProjector: Projector = {
    name: "achievements",
    handles: ["AttemptRecorded", "ProfileUpdated"],
    async handle(event, ctx) {
        ctx.log.info("projector_skipped_stub", {
            projector: "achievements",
            event_type: event.type,
        });
        return ok(undefined);
    },
};
