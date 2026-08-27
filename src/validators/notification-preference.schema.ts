import { z } from "zod";

export const updateNotificationPreferenceSchema = z.object({
  pushEnabled:           z.boolean().optional(),
  emailEnabled:          z.boolean().optional(),
  smsEnabled:            z.boolean().optional(),
  jobUpdates:            z.boolean().optional(),
  messages:              z.boolean().optional(),
  connectionsAndInvites: z.boolean().optional(),
  marketingTips:         z.boolean().optional(),
}).strict();

export type UpdateNotificationPreferenceInput = z.infer<typeof updateNotificationPreferenceSchema>;
