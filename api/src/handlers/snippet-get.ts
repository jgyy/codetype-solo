import {
    GetSnippetParams,
    isErr,
    type ApiError,
    type Result,
} from "@codetype/shared";
import { httpAdapter, parseWith, type HandlerCtx } from "../lib/http";
import type { SnippetRow } from "../repos";

export async function getSnippetLogic(
    ctx: HandlerCtx,
): Promise<Result<SnippetRow, ApiError>> {
    const p = parseWith(GetSnippetParams, ctx.event.pathParameters ?? {});
    if (isErr(p)) return p;
    return ctx.repos.snippets.get(p.value.lang, p.value.id);
}

export const handler = httpAdapter(getSnippetLogic, { successStatus: 200 });
