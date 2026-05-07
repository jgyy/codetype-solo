import { z } from "zod";

// Profile upsert has no meaningful body today, but we declare an empty
// object schema so the validation pipeline is uniform across handlers.
export const UpsertProfileBody = z.object({}).passthrough();
export type UpsertProfileBody = z.infer<typeof UpsertProfileBody>;
