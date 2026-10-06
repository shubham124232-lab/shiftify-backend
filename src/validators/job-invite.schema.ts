import { z } from "zod";

export const createJobInviteSchema = z.object({
  invitedUserId: z.string().uuid(),
  message:       z.string().max(500).optional(),
}).strict();
export type CreateJobInviteInput = z.infer<typeof createJobInviteSchema>;

export const respondJobInviteSchema = z.object({
  action: z.enum(["ACCEPT", "DECLINE"]),
  // SW v3.0 Window 20 — required when accepting (Connect).
  acknowledged: z.boolean().optional(),
}).strict();
export type RespondJobInviteInput = z.infer<typeof respondJobInviteSchema>;
