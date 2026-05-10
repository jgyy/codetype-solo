import {
    apiError,
    err,
    isErr,
    isWarmedUp,
    ok,
    pickSnippet,
    type ApiError,
    type ErrorModel,
    type Language,
    type Result,
    type Snippet,
} from "@codetype/shared";
import type { ProfilePort, RngPort, SnippetRow, SnippetsPort } from "../ports";

export type GetNextSnippetMode = "adaptive" | "random";

export type GetNextSnippetDeps = {
    snippets: SnippetsPort;
    profiles: ProfilePort;
    rng: RngPort;
};

export type GetNextSnippetInput = {
    sub: string | null; // null → guest; always falls back to random
    lang: Language;
    mode: GetNextSnippetMode;
    recentSnippetIds?: string[];
};

export type GetNextSnippetOutput = {
    snippet: SnippetRow;
    selection_mode: "adaptive" | "random" | "warming_up";
};

export const getNextSnippet =
    (d: GetNextSnippetDeps) =>
    async (input: GetNextSnippetInput): Promise<Result<GetNextSnippetOutput, ApiError>> => {
        const list = await d.snippets.listByLanguage(input.lang);
        if (isErr(list)) return list as Result<never, ApiError>;
        const pool = list.value;
        if (pool.length === 0) return err(apiError("not_found", "no snippets in language"));

        const random = (): GetNextSnippetOutput => ({
            snippet: pool[Math.floor(d.rng.random() * pool.length)]!,
            selection_mode: "random",
        });

        if (input.mode === "random" || !input.sub) return ok(random());

        const profile = await d.profiles.get(input.sub);
        if (isErr(profile)) return profile as Result<never, ApiError>;
        const model = profile.value?.error_model;
        if (!isWarmedUp(model)) {
            return ok({ ...random(), selection_mode: "warming_up" });
        }

        const snippets: Snippet[] = pool.map(rowToSnippet);
        const picked = pickSnippet(snippets, model as ErrorModel, () => d.rng.random(), {
            recentSnippetIds: input.recentSnippetIds,
        });
        const row = pool.find((p) => (p.id ?? p.SK.replace(/^SNIPPET#/, "")) === picked.id);
        return ok({ snippet: row ?? pool[0]!, selection_mode: "adaptive" });
    };

const rowToSnippet = (r: SnippetRow): Snippet => ({
    id: r.id ?? r.SK.replace(/^SNIPPET#/, ""),
    language: r.language,
    title: r.title,
    code: r.code,
    difficulty: (r.difficulty as 1 | 2 | 3 | 4 | 5) ?? 1,
});
