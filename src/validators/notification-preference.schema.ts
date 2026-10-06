import { z } from "zod";

export const updateNotificationPreferenceSchema = z.object({
  pushEnabled:           z.boolean().optional(),
  emailEnabled:          z.boolean().optional(),
  smsEnabled:            z.boolean().optional(),
  jobUpdates:            z.boolean().optional(),
  messages:              z.boolean().optional(),
  connectionsAndInvites: z.boolean().optional(),
  marketingTips:         z.boolean().optional(),
  // Provider doc PR-N02 — organisation-level controls.
  providerPrefs: z.object({
    quietHoursEnabled:  z.boolean().optional(),
    quietStart:         z.string().regex(/^\d{2}:\d{2}$/).optional(),
    quietEnd:           z.string().regex(/^\d{2}:\d{2}$/).optional(),
    urgentExceptions:   z.boolean().optional(),
    locationFilter:     z.array(z.string().max(80)).max(30).optional(),
    serviceFilter:      z.array(z.string().max(80)).max(30).optional(),
    assignedAdminId:    z.string().uuid().nullable().optional(),
    backupAdminId:      z.string().uuid().nullable().optional(),
    channelByUrgency:   z.object({
      RAPID:       z.array(z.enum(["PUSH", "SMS", "EMAIL"])).optional(),
      URGENT:      z.array(z.enum(["PUSH", "SMS", "EMAIL"])).optional(),
      LAST_MINUTE: z.array(z.enum(["PUSH", "SMS", "EMAIL"])).optional(),
      ROUTINE:     z.array(z.enum(["PUSH", "SMS", "EMAIL"])).optional(),
    }).optional(),
  }).strict().optional(),
}).strict();

export type UpdateNotificationPreferenceInput = z.infer<typeof updateNotificationPreferenceSchema>;
