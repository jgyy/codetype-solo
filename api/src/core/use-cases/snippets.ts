import { isErr, ok, type ApiError, type Language, type Result } from "@codetype/shared";
import type { SnippetRow, SnippetsPort } from "../ports";

export type SnippetDeps = { snippets: SnippetsPort };

export const getSnippet =
    (d: SnippetDeps) =>
    (input: { lang: Language; id: string }): Promise<Result<SnippetRow, ApiError>> =>
        d.snippets.get(input.lang, input.id);

export const retractSnippet =
    (d: SnippetDeps) =>
    async (input: { lang: Language; id: string }): Promise<Result<{ retired: true }, ApiError>> => {
        const r = await d.snippets.retract(input.lang, input.id);
        if (isErr(r)) return r as Result<never, ApiError>;
        return ok({ retired: true });
    };
