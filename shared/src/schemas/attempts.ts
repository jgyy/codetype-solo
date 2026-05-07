import { z } from "zod";

export const LanguageSchema = z.enum(["js", "py", "c", "go"]);

export const PostAttemptBody = z
  .object({
    client_attempt_id: z.string().min(1).max(64),
    snippet_id: z.string().min(1).max(128),
    language: LanguageSchema,
    duration_ms: z.number().int().positive().max(30 * 60_000),
    chars_total: z.number().int().positive().max(10_000),
    chars_correct: z.number().int().nonnegative(),
    errors: z.number().int().nonnegative().max(100_000),
    accuracy: z.number().min(0).max(1),
    wpm_gross: z.number().nonnegative().max(10_000),
    wpm_net: z.number().nonnegative().max(10_000),
    wpm_scaled: z.number().nonnegative().max(10_000),
  })
  .refine((b) => b.chars_correct <= b.chars_total, {
    path: ["chars_correct"],
    message: "chars_correct > chars_total",
  });
export type PostAttemptBody = z.infer<typeof PostAttemptBody>;

export const ListAttemptsQuery = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD")
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "to must be YYYY-MM-DD")
    .optional(),
});
export type ListAttemptsQuery = z.infer<typeof ListAttemptsQuery>;
