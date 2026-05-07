import { z } from "zod";
import { HandleSchema } from "./leaderboard";

export const UpsertProfileBody = z.object({
    handle: HandleSchema.optional(),
    leaderboard_optin: z.boolean().optional(),
    display_name: z.string().min(1).max(48).optional(),
});
export type UpsertProfileBody = z.infer<typeof UpsertProfileBody>;
