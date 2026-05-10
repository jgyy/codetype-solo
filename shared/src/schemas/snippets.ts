import { z } from "zod";
import { LanguageSchema } from "./attempts";

export const GetSnippetParams = z.object({
    lang: LanguageSchema,
    id: z.string().min(1).max(128),
});
export type GetSnippetParams = z.infer<typeof GetSnippetParams>;

export const NextSnippetQuery = z.object({
    lang: LanguageSchema,
    mode: z.enum(["adaptive", "random"]).default("adaptive"),
});
export type NextSnippetQuery = z.infer<typeof NextSnippetQuery>;

export const DrillSnippetQuery = z.object({
    lang: LanguageSchema,
    class: z.string().min(1).max(64),
});
export type DrillSnippetQuery = z.infer<typeof DrillSnippetQuery>;

export const SnippetSeedRow = z.object({
    id: z.string().min(1).max(128),
    title: z.string().min(1).max(200),
    code: z.string().min(1).max(2_000),
    difficulty: z.number().int().min(1).max(5),
});
export type SnippetSeedRow = z.infer<typeof SnippetSeedRow>;
