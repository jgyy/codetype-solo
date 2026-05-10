import { ok } from "@codetype/shared";
import type { Projector } from "../types";

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
