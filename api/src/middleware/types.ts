import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import type { ApiError, Result } from "@codetype/shared";
import type { Caller } from "../lib/auth";
import type { Repos } from "../repos";

export type { Logger } from "../lib/logger";
import type { Logger } from "../lib/logger";

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
