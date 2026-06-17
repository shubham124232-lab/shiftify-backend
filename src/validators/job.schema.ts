import { z } from "zod";

// ─── Enums (mirror Prisma) ────────────────────────────────────────────────────

const JobCategoryEnum = z.enum([
  "PERSONAL_CARE","COMMUNITY_ACCESS","DOMESTIC_ASSISTANCE","TRANSPORT",
  "SOCIAL_RECREATIONAL","NURSING_COMPLEX_CARE","THERAPY_ASSISTANCE",
  "OVERNIGHT_SUPPORT","BEHAVIOUR_SUPPORT","HIGH_INTENSITY","SIL_SUPPORT",
  "RESPITE","COMPANIONSHIP","MEDICATION_ASSISTANCE","MEAL_PREPARATION",
  "SHOPPING_ERRANDS","APPOINTMENT_SUPPORT","OTHER",
]);

const ShiftTypeEnum = z.enum([
  "STANDARD","SHORT_VISIT","LONG_SHIFT","ACTIVE_OVERNIGHT","SLEEPOVER",
  "TWENTY_FOUR_HOUR","DROP_IN","APPOINTMENT","TRANSPORT_ONLY","SPLIT",
]);

const FundingTypeEnum = z.enum([
  "SELF_MANAGED","PLAN_MANAGED","NDIA_MANAGED","PRIVATE","MIXED","DISCUSS",
]);

const UrgencyEnum = z.enum(["EMERGENCY","SAME_DAY","SCHEDULED"]);

// ─── Create / draft ───────────────────────────────────────────────────────────

export const createJobSchema = z.object({
  // ── Step 1: Service details ──────────────────────────────────────────────
  title:                  z.string().min(3).max(200),
  description:            z.string().max(5000).optional(),
  category:               JobCategoryEnum,
  subcategory:            z.string().max(100).optional(),
  supportGoal:            z.string().max(80).optional(),
  // ONE_TIME | TEMPORARY | RECURRING | ONGOING | TRIAL | EMERGENCY
  durationType:           z.string().max(40).optional(),
  // SELF | NOMINEE | FAMILY | COORDINATOR | GUARDIAN
  participantPostedAs:    z.string().max(40).optional(),

  // ── Step 2: Schedule ────────────────────────────────────────────────────
  urgency:                UrgencyEnum.default("SCHEDULED"),
  shiftType:              ShiftTypeEnum.optional(),
  // EXACT | FLEXIBLE_SLIGHT | FLEXIBLE_MORNING | FLEXIBLE_AFTERNOON | FLEXIBLE_EVENING | FLEXIBLE_ANYTIME | DISCUSS
  timeFlexibility:        z.string().max(40).optional(),
  scheduledStartAt:       z.string().datetime({ offset: true }),
  scheduledEndAt:         z.string().datetime({ offset: true }),
  totalHours:             z.number().positive().max(500).optional(),
  isRecurring:            z.boolean().default(false),
  recurrencePattern:      z.record(z.unknown()).optional(),
  applicationDeadlineAt:  z.string().datetime({ offset: true }).optional(),

  // ── Step 3: Location ────────────────────────────────────────────────────
  suburb:                 z.string().min(2).max(100),
  state:                  z.string().min(2).max(50),
  postcode:               z.string().max(10).optional(),
  addressLine:            z.string().max(200).optional(),  // shown only after booking
  // AT_HOME | COMMUNITY | PROVIDER | MULTIPLE | ONLINE | COMBINATION
  serviceDeliveryMode:    z.string().max(50).optional(),
  locationNotes:          z.string().max(1000).optional(),
  lat:                    z.number().min(-90).max(90).optional(),
  lng:                    z.number().min(-180).max(180).optional(),
  // NONE | LOCAL | MULTI_STOP | PARTICIPANT_TRANSPORT | LONG_DISTANCE
  travelRequired:         z.string().max(40).optional(),

  // ── Step 6: Budget / Funding ─────────────────────────────────────────────
  fundingType:            FundingTypeEnum.optional(),
  // FIXED_HOURLY | FIXED_TOTAL | OPEN | NDIS | DISCUSS
  budgetType:             z.string().max(40).optional(),
  budgetPerHour:          z.number().min(0).max(9999).optional(),
  totalBudget:            z.number().min(0).max(999999).optional(),
  // INCLUDED | ADDITIONAL | DISCUSS | NOT_REQUIRED
  travelReimbursement:    z.string().max(40).optional(),

  // ── Step 7: Visibility & matching ────────────────────────────────────────
  // ALL | VERIFIED | PROVIDERS_ONLY | WORKERS_ONLY | INVITE_ONLY
  visibilityTarget:       z.string().max(40).optional(),
  maxApplicants:          z.number().int().min(1).max(999).optional(),
  hideParticipantName:    z.boolean().default(false),
  allowQuotes:            z.boolean().default(false),
  allowDirectMessages:    z.boolean().default(true),

  // ── Coordinator / PM extras (internal only) ──────────────────────────────
  workerPreferences:      z.record(z.unknown()).optional(),
  internalNote:           z.string().max(2000).optional(),
  caseReference:          z.string().max(120).optional(),
  // NEW_SUPPORT | REPLACEMENT | URGENT_INTERIM | HOSPITAL_DISCHARGE | SIL_SDA | etc.
  requestPurposeCategory: z.string().max(80).optional(),

  // ── Submit mode ──────────────────────────────────────────────────────────
  asDraft:                z.boolean().default(false),

  // ── Coordinator: participant selection ───────────────────────────────────
  forParticipantUserId:   z.string().uuid().optional(),
  inlineParticipant: z.object({
    name:   z.string().min(2).max(120),
    phone:  z.string().min(8).max(30).optional(),
    suburb: z.string().min(2).max(100).optional(),
  }).optional(),
});

// ─── Publish a draft ─────────────────────────────────────────────────────────

export const publishJobSchema = z.object({
  jobId: z.string().uuid(),
});

// ─── Filters (load board) ─────────────────────────────────────────────────────

export const jobFiltersSchema = z.object({
  // Text / location
  suburb:           z.string().optional(),
  state:            z.string().optional(),
  // Category
  category:         JobCategoryEnum.optional(),
  // Urgency
  urgency:          UrgencyEnum.optional(),
  // Status
  status:           z.enum(["DRAFT","OPEN","ASSIGNED","IN_PROGRESS","COMPLETED","CONFIRMED","CANCELLED"]).optional(),
  // New spec filters
  shiftType:        ShiftTypeEnum.optional(),
  fundingType:      FundingTypeEnum.optional(),
  isRecurring:      z.coerce.boolean().optional(),
  // SELF_MANAGED | PLAN_MANAGED | NDIA_MANAGED = who can see
  visibilityTarget: z.string().optional(),
  // Date filters
  startFrom:        z.string().datetime({ offset: true }).optional(),
  startTo:          z.string().datetime({ offset: true }).optional(),
  // Posted within N hours (e.g. 24 = posted today)
  postedWithinHours: z.coerce.number().int().min(1).max(720).optional(),
  // Poster role type filter
  postedByRole:     z.enum(["PARTICIPANT","COORDINATOR","PLAN_MANAGER"]).optional(),
  // Pagination
  page:             z.coerce.number().int().min(1).default(1),
  limit:            z.coerce.number().int().min(1).max(100).default(20),
  // Sort
  sortBy:           z.enum(["newest","urgency","startDate","bestMatch"]).default("urgency"),
});

// ─── Application (structured proposal) ───────────────────────────────────────

export const applyJobSchema = z.object({
  // Short legacy note still supported
  note:               z.string().max(1000).optional(),

  // Step 1: Availability confirmation
  // YES_EXACT | YES_ADJUSTED | PARTIAL | DISCUSS | UNAVAILABLE
  availabilityType:   z.string().max(40).optional(),

  // Step 3: Rate / commercial response
  // ACCEPT | OFFER_OWN | QUOTE_AFTER | DISCUSS
  rateResponse:       z.string().max(40).optional(),
  proposedRate:       z.number().min(0).max(9999).optional(),

  // Step 4: Introduction / proposal
  introduction:       z.string().max(3000).optional(),

  // Structured confirmations blob (suitability checkboxes, docs visibility, etc.)
  applicationData:    z.record(z.unknown()).optional(),
});

// ─── Cancel ──────────────────────────────────────────────────────────────────

export const cancelJobSchema = z.object({
  reason: z.string().max(500).optional(),
});

// ─── Provider assigns a worker after being selected ──────────────────────────

export const assignWorkerSchema = z.object({
  workerUserId: z.string().uuid(),
});

// ─── Messaging ───────────────────────────────────────────────────────────────

export const sendMessageSchema = z.object({
  body: z.string().min(1).max(5000),
});

// ─── Invoice ─────────────────────────────────────────────────────────────────

export const createInvoiceSchema = z.object({
  planManagerUserId: z.string().uuid(),
  participantUserId: z.string().uuid(),
  hours:             z.number().positive().max(500).optional(),
  note:              z.string().max(1000).optional(),
});

// ─── Types ───────────────────────────────────────────────────────────────────

export type CreateJobInput      = z.infer<typeof createJobSchema>;
export type JobFiltersInput     = z.infer<typeof jobFiltersSchema>;
export type ApplyJobInput       = z.infer<typeof applyJobSchema>;
export type CancelJobInput      = z.infer<typeof cancelJobSchema>;
export type AssignWorkerInput   = z.infer<typeof assignWorkerSchema>;
export type SendMessageInput    = z.infer<typeof sendMessageSchema>;
export type CreateInvoiceInput  = z.infer<typeof createInvoiceSchema>;
