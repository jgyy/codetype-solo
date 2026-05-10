import {
    ListSubmissionsQuery,
    apiError,
    err,
} from "@codetype/shared";
import { useCases } from "../composition";
import {
    compose,
    withAuth,
    withErrorEnvelope,
    withLogger,
    withRepos,
    withRequestId,
    withSchema,
    type Ctx,
    type DomainHandler,
} from "../middleware";
import { prodRepos } from "../composition";
import type { ListSubmissionsOutput } from "../core/use-cases";

export const listSubmissionsLogic: DomainHandler<ListSubmissionsOutput> = async (ctx: Ctx) => {
    const q = ctx.body as { mine?: string; status?: string };
    const uc = useCases({ repos: ctx.repos, clock: ctx.clock, id: ctx.id });

    if (q.mine === "true") {
        if (!ctx.caller) return err(apiError("unauthorized", "missing caller"));
        return uc.listSubmissions({ mode: "mine", sub: ctx.caller.sub });
    }
    if (q.status) {
        if (!ctx.caller?.groups.includes("mods")) {
            return err(apiError("unauthorized", "moderator role required"));
        }
        if (q.status !== "PENDING") {
            return err(
                apiError("bad_request", "only PENDING listing is supported via this endpoint"),
            );
        }
        return uc.listSubmissions({ mode: "pending" });
    }
    return err(apiError("bad_request", "specify ?mine=true or ?status=PENDING"));
};

export const handler = compose<ListSubmissionsOutput>(
    withRequestId(),
    withLogger(),
    withErrorEnvelope(),
    withRepos(prodRepos()),
    withAuth({ required: true }),
    withSchema(ListSubmissionsQuery, "query"),
)(listSubmissionsLogic, { successStatus: 200 });
