import { apiError, STATUS_BY_CODE, type ApiError, type Envelope, type Result } from "@codetype/shared";
import type { APIGatewayProxyResultV2 } from "aws-lambda";
import type { ApiHandler, Ctx, DomainHandler, Logger, Mw } from "./types";

export type ComposeOptions<T = unknown> = {
    successStatus?: number | ((value: T) => number);
};

const NOOP_LOG: Logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
};

const DEFAULT_STATUS_BY_METHOD: Record<string, number> = {
    POST: 201,
    PUT: 200,
    PATCH: 200,
    GET: 200,
    DELETE: 200,
};

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

export function compose<T = unknown>(...mws: Mw[]): (
    h: DomainHandler<T>,
    options?: ComposeOptions<T>,
) => ApiHandler {
    return (domain, options) => {
        const chain = chainOf(mws, domain as DomainHandler);
        return async (event) => {
            // Initial context — middleware populates fields. repos defaults to
            // a sentinel that fails loudly if a handler tries to use it without
            // withRepos in the chain.
            const ctx: Ctx = {
                event,
                requestId: "",
                log: NOOP_LOG,
                caller: null,
                body: undefined,
                repos: undefined as unknown as Ctx["repos"],
            };

            let result: Result<unknown, ApiError>;
            try {
                result = await chain(ctx);
            } catch (e) {
                // Defense in depth: withErrorEnvelope should have caught this,
                // but if it's missing from the chain (or threw itself) we still
                // produce a clean envelope.
                const meta = e instanceof Error ? { name: e.name, message: e.message } : { value: String(e) };
                // eslint-disable-next-line no-console
                console.error("compose_unhandled", { requestId: ctx.requestId, ...meta });
                result = { ok: false, error: apiError("internal", "internal_error") };
            }

            if (result.ok) {
                const ss = options?.successStatus;
                const fallback =
                    DEFAULT_STATUS_BY_METHOD[event.requestContext?.http?.method ?? "GET"] ?? 200;
                const status =
                    typeof ss === "function" ? ss(result.value as T) : (ss ?? fallback);
                return respond(status, { ok: true, data: result.value }, ctx.requestId);
            }
            return respond(
                STATUS_BY_CODE[result.error.code],
                { ok: false, error: result.error },
                ctx.requestId,
            );
        };
    };
}
