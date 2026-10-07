import { z } from "zod";

export const createDirectConnectSchema = z.object({
  workerUserId: z.string().uuid(),
  message:      z.string().max(500).optional(),
}).strict();

export const respondDirectConnectSchema = z.object({
  action: z.enum(["ACCEPT", "DECLINE"]),
}).strict();

export type CreateDirectConnectInput  = z.infer<typeof createDirectConnectSchema>;
export type RespondDirectConnectInput = z.infer<typeof respondDirectConnectSchema>;
