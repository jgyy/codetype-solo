import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { z } from "zod";
import {
  apiError,
  err,
  ok,
  STATUS_BY_CODE,
  type ApiError,
  type Envelope,
  type Result,
} from "@codetype/shared";
import { getCaller, type Caller } from "./auth";

export function parseWith<S extends z.ZodTypeAny>(
  schema: S,
  raw: unknown,
): Result<z.infer<S>, ApiError> {
  const r = schema.safeParse(raw);
  if (r.success) return ok(r.data);
  return err(apiError("bad_request", "validation_failed", r.error.issues));
}

export function parseJsonBody<S extends z.ZodTypeAny>(
  schema: S,
  rawBody: string | null | undefined,
): Result<z.infer<S>, ApiError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody ?? "{}");
  } catch {
    return err(apiError("bad_request", "invalid json"));
  }
  return parseWith(schema, parsed);
}

export type HandlerCtx = {
  event: APIGatewayProxyEventV2WithJWTAuthorizer;
  caller: Caller | null;
  requestId: string;
};

export type Handler<T> = (ctx: HandlerCtx) => Promise<Result<T, ApiError>>;

export type ApiHandler = (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
) => Promise<APIGatewayProxyResultV2>;

const SUCCESS_STATUS_BY_METHOD: Record<string, number> = {
  POST: 201,
  PUT: 200,
  PATCH: 200,
  GET: 200,
  DELETE: 200,
};

export type SuccessStatus<T> = number | ((value: T) => number);

export function httpAdapter<T>(
  h: Handler<T>,
  options?: { successStatus?: SuccessStatus<T> },
): ApiHandler {
  return async (event) => {
    const requestId = event.requestContext?.requestId ?? "";
    const caller = getCaller(event);
    let result: Result<T, ApiError>;
    try {
      result = await h({ event, caller, requestId });
    } catch (e) {
      // Programming bug or unhandled AWS error. Never leak details to client.
      console.error("unhandled_handler_error", { requestId, err: serializeError(e) });
      return respond(500, { ok: false, error: apiError("internal", "internal_error") }, requestId);
    }
    if (result.ok) {
      const ss = options?.successStatus;
      const fallback =
        SUCCESS_STATUS_BY_METHOD[event.requestContext?.http?.method ?? "GET"] ?? 200;
      const status =
        typeof ss === "function" ? ss(result.value) : (ss ?? fallback);
      return respond(status, { ok: true, data: result.value }, requestId);
    }
    const status = STATUS_BY_CODE[result.error.code];
    return respond(status, { ok: false, error: result.error }, requestId);
  };
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

function serializeError(e: unknown): Record<string, unknown> {
  if (e instanceof Error) return { name: e.name, message: e.message, stack: e.stack };
  return { value: String(e) };
}
