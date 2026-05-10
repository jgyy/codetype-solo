import { CHEAT_THRESHOLD, apiError, err, ok } from "@codetype/shared";
import { syncLeaderboardForUser } from "../../lib/lb-sync";
import type { Projector } from "../types";

export const leaderboardProjector: Projector = {
    name: "leaderboard",
    handles: ["AttemptRecorded"],
    async handle(event, ctx) {
        if (event.type !== "AttemptRecorded") return ok(undefined);
        const score = event.image.cheat_score;
        if (typeof score === "number" && score >= CHEAT_THRESHOLD) {
            ctx.log.info("lb_skipped_cheat", { sub: event.sub, score });
            return ok(undefined);
        }
        try {
            const result = await syncLeaderboardForUser(
                ctx.repos,
                event.sub,
                event.language,
            );
            ctx.log.info("lb_synced", { sub: event.sub, kind: result.kind });
            return ok(undefined);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            ctx.log.warn("lb_sync_failed", { sub: event.sub, err: message });
            return err(apiError("internal", "lb_sync_failed"));
        }
    },
};
