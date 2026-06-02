import { z } from "zod";

export const createPmConnectionSchema = z.object({
  planManagerUserId: z.string().uuid(),
});

export const respondPmConnectionSchema = z.object({
  action: z.enum(["ACCEPT", "DECLINE"]),
});

export type CreatePmConnectionInput  = z.infer<typeof createPmConnectionSchema>;
export type RespondPmConnectionInput = z.infer<typeof respondPmConnectionSchema>;
