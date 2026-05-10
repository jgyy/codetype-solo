import { apiError, STATUS_BY_CODE, type ApiError, type Envelope, type Result } from "@codetype/shared";
import type { APIGatewayProxyResultV2 } from "aws-lambda";
import { emitEmf } from "../lib/metrics";
import { systemClock } from "../adapters/clock/system";
import { uuidId } from "../adapters/id/uuid";
import type { ApiHandler, Ctx, DomainHandler, Logger, Mw } from "./types";

export type ComposeOptions<T = unknown> = {
    successStatus?: number | ((value: T) => number);
    emitMetrics?: boolean;
};

const NOOP_LOG: Logger = {
    info: () => { },
    warn: () => { },
    error: () => { },
};

const DEFAULT_STATUS_BY_METHOD: Record<string, number> = {
    POST: 201,
    PUT: 200,
    PATCH: 200,
    GET: 200,
    DELETE: 200,
};

let coldStart = true;
export function resetColdStartForTest(): void {
    coldStart = true;
}

function chainOf(mws: Mw[], domain: DomainHandler): DomainHandler {
    let chain = domain;
    for (let i = mws.length - 1; i >= 0; i--) chain = mws[i]!(chain);
    return chain;
}

function respond<T>(
    statusCode: number,
    body: Envelope<T>,
    requestId: string,
): APIGatewayProxyResultV2 {
    return {
        statusCode,
        headers: {
            "content-type": "application/json",
            ...(requestId ? { "x-request-id": requestId } : {}),
        },
        body: JSON.stringify(body),
    };
}

function deriveRoute(event: Ctx["event"]): string {
    const rc = event.requestContext;
    const key = rc?.routeKey;
    if (key && key !== "$default") return key;
    const m = rc?.http?.method ?? "?";
    const p = rc?.http?.path ?? "?";
    return `${m} ${p}`;
}

export function compose<T = unknown>(...mws: Mw[]): (
    h: DomainHandler<T>,
    options?: ComposeOptions<T>,
) => ApiHandler {
    return (domain, options) => {
        const chain = chainOf(mws, domain as DomainHandler);
        const metricsEnabled = options?.emitMetrics !== false;
        return async (event) => {
            const start = performance.now();
            const isCold = coldStart;
            coldStart = false;

            const ctx: Ctx = {
                event,
                requestId: "",
                log: NOOP_LOG,
                caller: null,
                body: undefined,
                repos: undefined as unknown as Ctx["repos"],
                clock: systemClock(),
                id: uuidId(),
            };

            let result: Result<unknown, ApiError>;
            try {
                result = await chain(ctx);
            } catch (e) {
                const meta = e instanceof Error ? { name: e.name, message: e.message } : { value: String(e) };
                console.error("compose_unhandled", { requestId: ctx.requestId, ...meta });
                result = { ok: false, error: apiError("internal", "internal_error") };
            }

            const latencyMs = Math.max(0, Math.round(performance.now() - start));
            const route = deriveRoute(event);

            let response: APIGatewayProxyResultV2;
            if (result.ok) {
                const ss = options?.successStatus;
                const fallback =
                    DEFAULT_STATUS_BY_METHOD[event.requestContext?.http?.method ?? "GET"] ?? 200;
                const status = typeof ss === "function" ? ss(result.value as T) : (ss ?? fallback);
                response = respond(status, { ok: true, data: result.value }, ctx.requestId);
            } else {
                response = respond(
                    STATUS_BY_CODE[result.error.code],
                    { ok: false, error: result.error },
                    ctx.requestId,
                );
            }

            if (metricsEnabled) {
                const outcome = result.ok ? "success" : result.error.code;
                const metrics: { name: string; unit: "Count" | "Milliseconds"; value: number }[] = [
                    { name: "RequestCount", unit: "Count", value: 1 },
                    { name: "RequestLatencyMs", unit: "Milliseconds", value: latencyMs },
                ];
                if (!result.ok) metrics.push({ name: "ErrorCount", unit: "Count", value: 1 });
                if (isCold) metrics.push({ name: "ColdStarts", unit: "Count", value: 1 });
                try {
                    emitEmf({
                        dimensions: { Route: route, Outcome: outcome },
                        metrics,
                        extras: { requestId: ctx.requestId },
                    });
                } catch {
                }
            }

            return response;
        };
    };
}
