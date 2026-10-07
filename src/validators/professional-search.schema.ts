// SC-F01-06 "Find directly" (Journey 9) — the coordinator's direct worker/
// provider search, distinct from GET /workers/available (the public "Post My
// Availability" feed several roles already use). Kept as its own schema so
// widening these filters can't ripple into that unrelated feed.
import { z } from "zod";
import { paginationSchema } from "./pagination.schema";

const coercedBoolean = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "string" ? v === "true" : v))
  .optional();

export const professionalSearchFiltersSchema = z.object({
  // SC-F01 — who to find. Defaults to both, matching "Suitable workers and
  // providers" on the SC-F04 results screen.
  searchType: z.enum(["SUPPORT_WORKER", "PROVIDER", "BOTH"]).default("BOTH"),

  // SC-F02 — optional participant context. When set, results carry a
  // participant fit summary and the caller must hold an ACCEPTED connection
  // with shortlist permission for this participant.
  forParticipantUserId: z.string().uuid().optional(),

  // SC-F03 filters — "Service and location required; all other filters optional".
  suburb: z.string().optional(),
  state: z.string().optional(),
  service: z.string().optional(), // matches against servicesOffered / coreServices

  genderRequirement: z.string().optional(), // matches WorkerProfile.gender
  language: z.string().optional(), // matches languagesSpoken (worker only)
  transportRequired: coercedBoolean, // canTransportParticipants / hasVehicle
  overnightRequired: coercedBoolean, // acceptsSleepoverShifts / acceptsActiveOvernightShifts
  rapidAvailability: coercedBoolean, // isAvailableNow
  highIntensityExperience: coercedBoolean, // non-empty highIntensitySkills (worker only)
  registeredProviderOnly: coercedBoolean, // ProviderProfile.ndisRegistered
  rateMin: z.coerce.number().nonnegative().optional(),
  rateMax: z.coerce.number().nonnegative().optional(),
  // Submission-only, per the locked Document Verification Policy — never a
  // VERIFIED/REJECTED filter, just "have their required documents been
  // submitted at all".
  documentsComplete: coercedBoolean,

  ...paginationSchema.shape,
});

export type ProfessionalSearchFiltersInput = z.infer<typeof professionalSearchFiltersSchema>;

// SC-F06 — how the coordinator wants to connect with a searched profile.
export const inviteFromSearchSchema = z.object({
  professionalUserId: z.string().uuid(),
  action: z.enum([
    "INVITE_TO_EXISTING_REQUEST",
    "SAVE_TO_SHORTLIST",
    "SAVE_AS_PREFERRED_BACKUP",
  ]),
  // Required when action is INVITE_TO_EXISTING_REQUEST.
  jobId: z.string().uuid().optional(),
  message: z.string().max(1000).optional(),
  forParticipantUserId: z.string().uuid().optional(),
  // Only used by SAVE_AS_PREFERRED_BACKUP — which saved-list bucket.
  listType: z.enum(["PREFERRED_WORKER", "PREFERRED_PROVIDER", "BACKUP"]).optional(),
});

export type InviteFromSearchInput = z.infer<typeof inviteFromSearchSchema>;
