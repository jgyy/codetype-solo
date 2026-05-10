// Response shapes for each endpoint. The OpenAPI generator uses these to
// fill in the success-data branch; the standard envelope { ok, data | error }
// is added by the generator itself.

import { z } from "zod";
import { LanguageSchema, TimelineSchema } from "./attempts";
import { LbEntryDto } from "./leaderboard";
import { SubmissionStatus } from "./submissions";

export const PostAttemptResponse = z.union([
    z.object({
        sk: z.string(),
        wpm_mismatch: z.boolean(),
        cheat_score: z.number().min(0).max(1).optional(),
        cheat_reasons: z.array(z.string()).optional(),
    }),
    z.object({
        sk: z.string(),
        duplicate: z.literal(true),
    }),
]);
export type PostAttemptResponse = z.infer<typeof PostAttemptResponse>;

export const AttemptItemSchema = z.object({
    PK: z.string(),
    SK: z.string(),
    GSI1SK: z.string(),
    snippet_id: z.string(),
    language: LanguageSchema,
    wpm_gross: z.number(),
    wpm_net: z.number(),
    wpm_scaled: z.number(),
    accuracy: z.number(),
    errors: z.number(),
    duration_ms: z.number(),
    chars_total: z.number(),
    chars_correct: z.number(),
    created_at: z.string(),
    wpm_mismatch: z.boolean().optional(),
    cheat_score: z.number().optional(),
    cheat_reasons: z.array(z.string()).optional(),
    timeline: TimelineSchema.optional(),
});
export type AttemptItemSchema = z.infer<typeof AttemptItemSchema>;

export const ListAttemptsResponse = z.object({
    items: z.array(AttemptItemSchema),
});
export type ListAttemptsResponse = z.infer<typeof ListAttemptsResponse>;

export const DailyResponse = z.object({
    PK: z.literal("DAILY"),
    SK: z.string(),
    entity: z.literal("DAILY"),
    snippet_id: z.string(),
    language: LanguageSchema,
});
export type DailyResponse = z.infer<typeof DailyResponse>;

export const SnippetResponse = z.object({
    PK: z.string(),
    SK: z.string(),
    entity: z.enum(["SNIPPET", "SNIPPET_RETIRED"]),
    id: z.string().optional(),
    language: LanguageSchema,
    title: z.string(),
    code: z.string(),
    difficulty: z.number(),
});
export type SnippetResponse = z.infer<typeof SnippetResponse>;

export const ProfileResponse = z.object({
    created: z.boolean(),
    handle: z.string().optional(),
    leaderboard_optin: z.boolean().optional(),
    display_name: z.string().optional(),
});
export type ProfileResponse = z.infer<typeof ProfileResponse>;

export const LeaderboardResponseSchema = z.object({
    lang: LanguageSchema,
    week: z.string(),
    entries: z.array(LbEntryDto),
});
export type LeaderboardResponseSchema = z.infer<typeof LeaderboardResponseSchema>;

export const SubmissionDtoSchema = z.object({
    id: z.string(),
    status: SubmissionStatus,
    language: LanguageSchema,
    title: z.string(),
    code: z.string(),
    difficulty: z.number(),
    submitter_sub: z.string(),
    created_at: z.string(),
    decided_at: z.string().optional(),
    decided_by: z.string().optional(),
    reject_reason: z.string().optional(),
    approved_snippet_id: z.string().optional(),
});
export type SubmissionDtoSchema = z.infer<typeof SubmissionDtoSchema>;

export const SubmitResponse = z.object({
    id: z.string(),
    created_at: z.string(),
    status: z.literal("PENDING"),
});
export type SubmitResponse = z.infer<typeof SubmitResponse>;

export const ListSubmissionsResponse = z.object({
    items: z.array(SubmissionDtoSchema),
});
export type ListSubmissionsResponse = z.infer<typeof ListSubmissionsResponse>;

export const ApproveResponse = z.object({ snippetId: z.string() });
export type ApproveResponse = z.infer<typeof ApproveResponse>;

export const RejectResponse = z.object({ ok: z.literal(true) });
export type RejectResponse = z.infer<typeof RejectResponse>;

export const RetractResponse = z.object({ retired: z.literal(true) });
export type RetractResponse = z.infer<typeof RetractResponse>;
