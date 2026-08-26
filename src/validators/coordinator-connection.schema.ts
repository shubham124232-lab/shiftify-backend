import { z } from "zod";

// Either side can initiate: a Coordinator sending a request to a participant
// they know, or a Participant sending an enquiry from a coordinator's public
// profile (SC-C01-C05 / coordinator "enquiries inbox").
export const createCoordinatorConnectionSchema = z.object({
  targetUserId: z.string().uuid(),
  message:      z.string().max(500).optional(),
}).strict();

export const respondCoordinatorConnectionSchema = z.object({
  action: z.enum(["ACCEPT", "DECLINE"]),
}).strict();

// Participant adjusts what an already-accepted coordinator can do (SC-C01-C05
// granular permissions). Partial — only the flags being changed need be sent.
export const updateCoordinatorConnectionPermissionsSchema = z.object({
  canViewInfo:           z.boolean().optional(),
  canPostRequests:       z.boolean().optional(),
  canShortlist:          z.boolean().optional(),
  canMessage:            z.boolean().optional(),
  canConfirmBookings:    z.boolean().optional(),
  canManageReplacements: z.boolean().optional(),
}).strict();

export type CreateCoordinatorConnectionInput  = z.infer<typeof createCoordinatorConnectionSchema>;
export type RespondCoordinatorConnectionInput = z.infer<typeof respondCoordinatorConnectionSchema>;
export type UpdateCoordinatorConnectionPermissionsInput = z.infer<typeof updateCoordinatorConnectionPermissionsSchema>;
