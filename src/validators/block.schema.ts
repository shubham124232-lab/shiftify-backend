import { z } from "zod";

export const blockUserSchema = z.object({
  blockedUserId: z.string().uuid(),
  blockMessages: z.boolean().optional(),
  hideProfile:   z.boolean().optional(),
  reportReason:  z.string().max(500).optional(),
}).strict();
export type BlockUserInput = z.infer<typeof blockUserSchema>;
