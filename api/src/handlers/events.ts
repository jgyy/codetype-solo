import { randomUUID } from "node:crypto";
import type { DynamoDBStreamHandler } from "aws-lambda";
import { decode, projectors } from "../events";
import type { DomainEvent, ProjectorCtx } from "../events";
import { makeLogger } from "../lib/logger";
import { composeRepos, type Repos } from "../repos";

// Lazy-built so the Lambda warm path reuses one Repos instance across
// invocations, mirroring how the HTTP handlers work today.
let cachedRepos: Repos | null = null;
function getRepos(): Repos {
    if (cachedRepos === null) cachedRepos = composeRepos();
    return cachedRepos;
}

async function dispatch(event: DomainEvent, ctx: ProjectorCtx): Promise<void> {
    const targets = projectors.filter((p) => p.handles.includes(event.type));
    if (targets.length === 0) return;

    const settled = await Promise.allSettled(
        targets.map(async (p) => {
            const r = await p.handle(event, ctx);
            return { name: p.name, result: r };
        }),
    );

    for (const s of settled) {
        if (s.status === "rejected") {
            ctx.log.error("projector_threw", s.reason, { event_type: event.type });
            continue;
        }
        if (!s.value.result.ok) {
            ctx.log.warn("projector_failed", {
                projector: s.value.name,
                event_type: event.type,
                error: s.value.result.error,
            });
        }
    }
}

export const handler: DynamoDBStreamHandler = async (e) => {
    const log = makeLogger({ requestId: randomUUID(), route: "DDB_STREAM" });
    const ctx: ProjectorCtx = { repos: getRepos(), log };

    log.info("stream_batch_received", { records: e.Records.length });

    let decoded = 0;
    for (const record of e.Records) {
        const ev = decode(record);
        if (!ev) continue;
        decoded++;
        try {
            await dispatch(ev, ctx);
        } catch (err) {
            // dispatch already swallows per-projector failures via
            // allSettled; reaching here means infra-level failure (e.g. a
            // throw outside the projectors). Re-throwing surfaces the batch
            // for Lambda's retry + DLQ contract.
            log.error("dispatch_failed", err, { event_type: ev.type });
            throw err;
        }
    }

    log.info("stream_batch_processed", {
        records: e.Records.length,
        decoded,
        ignored: e.Records.length - decoded,
    });
};
