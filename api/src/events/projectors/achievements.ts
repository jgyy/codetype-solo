import { ok } from "@codetype/shared";
import type { Projector } from "../types";

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
