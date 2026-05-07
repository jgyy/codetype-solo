import { z } from "zod";
import { apiError, err, ok, type ApiError, type Result } from "@codetype/shared";
import type { Mw } from "./types";

export type SchemaSource = "body" | "query" | "path";

function readSource(ctx: { event: import("aws-lambda").APIGatewayProxyEventV2WithJWTAuthorizer }, source: SchemaSource): Result<unknown, ApiError> {
    if (source === "body") {
        try {
            return ok(JSON.parse(ctx.event.body ?? "{}"));
        } catch {
            return err(apiError("bad_request", "invalid json"));
        }
    }
    if (source === "query") return ok(ctx.event.queryStringParameters ?? {});
    return ok(ctx.event.pathParameters ?? {});
}

export function withSchema<S extends z.ZodTypeAny>(
    schema: S,
    source: SchemaSource = "body",
): Mw {
    return (next) => async (ctx) => {
        const raw = readSource(ctx, source);
        if (!raw.ok) return raw;
        const parsed = schema.safeParse(raw.value);
        if (!parsed.success) {
            return err(apiError("bad_request", "validation_failed", parsed.error.issues));
        }
        ctx.body = parsed.data;
        return next(ctx);
    };
}
