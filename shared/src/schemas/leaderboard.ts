import { z } from "zod";
import { LanguageSchema } from "./attempts";
import { ISO_WEEK_RE } from "../iso-week";

export const HandleSchema = z
    .string()
    .min(2)
    .max(24)
    .regex(/^[a-z0-9_-]+$/, "handle must match [a-z0-9_-]");

export const GetLeaderboardQuery = z.object({
    lang: LanguageSchema,
    week: z.string().regex(ISO_WEEK_RE, "week must be YYYY-Www").optional(),
});
export type GetLeaderboardQuery = z.infer<typeof GetLeaderboardQuery>;

export const LbEntryDto = z.object({
    rank: z.number().int().nonnegative(),
    handle: z.string(),
    wpm_scaled: z.number(),
    attempts: z.number().int().nonnegative(),
});
export type LbEntryDto = z.infer<typeof LbEntryDto>;

export const LeaderboardResponse = z.object({
    lang: LanguageSchema,
    week: z.string().regex(ISO_WEEK_RE),
    entries: z.array(LbEntryDto),
});
export type LeaderboardResponse = z.infer<typeof LeaderboardResponse>;
