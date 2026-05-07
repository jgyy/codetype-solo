import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import type { ApiError, Result } from "@codetype/shared";
import type { Caller } from "../lib/auth";
import type { Repos } from "../repos";

export type Logger = {
    info(msg: string, meta?: Record<string, unknown>): void;
    warn(msg: string, meta?: Record<string, unknown>): void;
    error(msg: string, meta?: Record<string, unknown>): void;
};

// Fixed-shape context. Middleware POPULATES fields; it does not extend the type.
export type Ctx = {
    event: APIGatewayProxyEventV2WithJWTAuthorizer;
    requestId: string;
    log: Logger;
    caller: Caller | null;
    body: unknown;
    repos: Repos;
};

export type DomainHandler<TOut = unknown> = (ctx: Ctx) => Promise<Result<TOut, ApiError>>;

export type Mw = (next: DomainHandler) => DomainHandler;

export type ApiHandler = (
    event: APIGatewayProxyEventV2WithJWTAuthorizer,
) => Promise<APIGatewayProxyResultV2>;
