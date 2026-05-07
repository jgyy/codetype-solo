import { z } from "zod";
import { LanguageSchema } from "./attempts";

export const SubmissionStatus = z.enum(["PENDING", "APPROVED", "REJECTED"]);
export type SubmissionStatus = z.infer<typeof SubmissionStatus>;

export const SubmissionBody = z.object({
    language: LanguageSchema,
    title: z.string().min(3).max(80),
    code: z.string().min(20).max(400),
    difficulty: z.union([
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
        z.literal(5),
    ]),
});
export type SubmissionBody = z.infer<typeof SubmissionBody>;

export const ListSubmissionsQuery = z.object({
    mine: z.string().optional(), // "true" string, since query strings come as strings
    status: SubmissionStatus.optional(),
});
export type ListSubmissionsQuery = z.infer<typeof ListSubmissionsQuery>;

export const RejectBody = z.object({
    reason: z.string().min(1).max(280),
});
export type RejectBody = z.infer<typeof RejectBody>;

export const SubmissionIdParam = z.object({
    id: z.string().min(1).max(64),
});
export type SubmissionIdParam = z.infer<typeof SubmissionIdParam>;

export const RetractParam = z.object({
    lang: LanguageSchema,
    id: z.string().min(1).max(128),
});
export type RetractParam = z.infer<typeof RetractParam>;

export type SubmissionDto = {
    id: string;
    status: SubmissionStatus;
    language: z.infer<typeof LanguageSchema>;
    title: string;
    code: string;
    difficulty: number;
    submitter_sub: string;
    created_at: string;
    decided_at?: string;
    decided_by?: string;
    reject_reason?: string;
    approved_snippet_id?: string;
};
