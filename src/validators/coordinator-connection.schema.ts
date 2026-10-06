import { z } from "zod";

// Either side can initiate: a Coordinator sending a request to a participant
// they know, or a Participant sending an enquiry from a coordinator's public
// profile (SC-C01-C05 / coordinator "enquiries inbox").
// SC-C02/C03 — a Coordinator may identify an existing participant by email or
// mobile instead of an id, and state the permissions they are asking for.
// targetUserId is still accepted so existing callers are unaffected.
export const createCoordinatorConnectionSchema = z.object({
  targetUserId: z.string().uuid().optional(),
  email:        z.string().email().optional(),
  mobile:       z.string().min(6).max(20).optional(),
  message:      z.string().max(500).optional(),
  permissions:  z.object({
    canViewInfo:           z.boolean().optional(),
    canPostRequests:       z.boolean().optional(),
    canShortlist:          z.boolean().optional(),
    canMessage:            z.boolean().optional(),
    canConfirmBookings:    z.boolean().optional(),
    canManageReplacements: z.boolean().optional(),
  }).strict().optional(),
}).strict().refine((d) => !!(d.targetUserId || d.email || d.mobile), {
  message: "Provide the participant's email address or mobile number",
  path: ["email"],
});

export const respondCoordinatorConnectionSchema = z.object({
  action: z.enum(["ACCEPT", "DECLINE"]),
}).strict();

// SC-P01 — coordinator asks the participant to approve this specific posting
// instead of self-certifying authority.
export const requestPostingApprovalSchema = z.object({
  participantUserId: z.string().uuid(),
}).strict();

export const respondPostingApprovalSchema = z.object({
  action: z.enum(["APPROVE", "DECLINE"]),
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

// SC-PT04 — coordinator requests one or more additional permissions the
// participant hasn't granted yet.
export const requestPermissionsSchema = z.object({
  participantUserId: z.string().uuid(),
  requested: z.object({
    canViewInfo:           z.boolean().optional(),
    canPostRequests:       z.boolean().optional(),
    canShortlist:          z.boolean().optional(),
    canMessage:            z.boolean().optional(),
    canConfirmBookings:    z.boolean().optional(),
    canManageReplacements: z.boolean().optional(),
  }).strict(),
}).strict();

export const respondPermissionRequestSchema = z.object({
  action: z.enum(["APPROVE", "DECLINE"]),
}).strict();

export type CreateCoordinatorConnectionInput  = z.infer<typeof createCoordinatorConnectionSchema>;
export type RespondCoordinatorConnectionInput = z.infer<typeof respondCoordinatorConnectionSchema>;
export type UpdateCoordinatorConnectionPermissionsInput = z.infer<typeof updateCoordinatorConnectionPermissionsSchema>;
export type RequestPostingApprovalInput = z.infer<typeof requestPostingApprovalSchema>;
export type RespondPostingApprovalInput = z.infer<typeof respondPostingApprovalSchema>;
export type RequestPermissionsInput = z.infer<typeof requestPermissionsSchema>;
export type RespondPermissionRequestInput = z.infer<typeof respondPermissionRequestSchema>;
