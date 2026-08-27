import { z } from "zod";

// Shared shape for both /linking/workers and /linking/participants.
// MANAGED accounts have username + password only — no email, no phone.
const managedAccountSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(40, "Username must be at most 40 characters")
    .regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dot, dash, or underscore"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).max(120),
}).strict();

// POST /linking/workers — Provider creates a MANAGED SUPPORT_WORKER as a DRAFT.
// Profile, availability, service area and documents are filled in afterwards
// against the draft — the account becomes ACTIVE only once the provider
// explicitly activates it (see activateWorker).
export const createWorkerSchema = managedAccountSchema;
export type CreateWorkerInput = z.infer<typeof createWorkerSchema>;

// POST /linking/participants — Coordinator creates a MANAGED PARTICIPANT.
// SC-N01-N04: the coordinator must declare their authority to act for this
// participant and explicitly confirm it — this is a submission/declaration
// gate, not a doc-verification gate (see CLAUDE.md Document Verification Policy).
const PARTICIPANT_TYPES = [
  "PARTICIPANT",
  "NOMINEE",
  "GUARDIAN",
  "AUTHORISED_REPRESENTATIVE",
  "PARENT_FAMILY_REPRESENTATIVE",
  "OTHER",
] as const;

export const createParticipantSchema = managedAccountSchema
  .extend({
    // SC-N01
    preferredName: z.string().min(1).max(120),
    ageGroup: z.enum(["CHILD", "TEENAGER", "ADULT", "OLDER_ADULT"]),
    suburb: z.string().min(1),
    postcode: z.string().min(1),
    contactEmail: z.string().email().optional(),
    contactPhone: z.string().min(1).optional(),
    // SC-N02
    participantType: z.enum(PARTICIPANT_TYPES),
    authorisingPersonName: z.string().min(1).max(120).optional(),
    authorisingPersonRelationship: z.string().min(1).max(120).optional(),
    authorisingPersonNote: z.string().max(500).optional(),
    // SC-N03 — two separate confirmations
    authorityConfirmed: z.literal(true, {
      errorMap: () => ({ message: "You must confirm you're authorised to source support for this participant" }),
    }),
    infoAccuracyConfirmed: z.literal(true, {
      errorMap: () => ({ message: "You must confirm you understand access may be reviewed and managed" }),
    }),
  })
  .refine(
    (data) => data.participantType === "PARTICIPANT" || (!!data.authorisingPersonName && !!data.authorisingPersonRelationship),
    {
      message: "Authorising person's name and relationship are required for this authority type",
      path: ["authorisingPersonName"],
    },
  );
export type CreateParticipantInput = z.infer<typeof createParticipantSchema>;

// POST /linking/participants/:id/invite
export const sendParticipantInvitationSchema = z.object({
  method: z.enum(["EMAIL", "SMS"]),
}).strict();
export type SendParticipantInvitationInput = z.infer<typeof sendParticipantInvitationSchema>;
