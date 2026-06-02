import { z } from "zod";

// ─── Job categories (mirrors Prisma enum) ────────────────────────────────────

const JobCategoryEnum = z.enum([
  "PERSONAL_CARE","COMMUNITY_ACCESS","DOMESTIC_ASSISTANCE","TRANSPORT",
  "SOCIAL_RECREATIONAL","NURSING_COMPLEX_CARE","THERAPY_ASSISTANCE",
  "OVERNIGHT_SUPPORT","BEHAVIOUR_SUPPORT","HIGH_INTENSITY","SIL_SUPPORT",
  "RESPITE","COMPANIONSHIP","MEDICATION_ASSISTANCE","MEAL_PREPARATION",
  "SHOPPING_ERRANDS","APPOINTMENT_SUPPORT","OTHER",
]);

// ─── Create / draft ───────────────────────────────────────────────────────────

export const createJobSchema = z.object({
  // Core
  title:               z.string().min(3).max(200),
  description:         z.string().max(5000).optional(),
  category:            JobCategoryEnum,
  subcategory:         z.string().max(100).optional(),
  urgency:             z.enum(["EMERGENCY","SAME_DAY","SCHEDULED"]).default("SCHEDULED"),

  // Location
  suburb:              z.string().min(2).max(100),
  state:               z.string().min(2).max(50),
  postcode:            z.string().max(10).optional(),
  serviceDeliveryMode: z.string().max(50).optional(),

  // Schedule
  scheduledStartAt:    z.string().datetime({ offset: true }),
  scheduledEndAt:      z.string().datetime({ offset: true }),
  totalHours:          z.number().positive().max(500).optional(),
  isRecurring:         z.boolean().default(false),
  recurrencePattern:   z.record(z.unknown()).optional(),

  // Preferences
  workerPreferences:   z.record(z.unknown()).optional(),

  // Post as DRAFT instead of OPEN immediately
  asDraft:             z.boolean().default(false),

  // Coordinator modes
  // Mode 1: existing managed participant
  forParticipantUserId: z.string().uuid().optional(),
  // Mode 2: inline create a new participant
  inlineParticipant: z.object({
    name:    z.string().min(2).max(120),
    phone:   z.string().min(8).max(30).optional(),
    suburb:  z.string().min(2).max(100).optional(),
  }).optional(),
});

// ─── Publish a draft ─────────────────────────────────────────────────────────

export const publishJobSchema = z.object({
  jobId: z.string().uuid(),
});

// ─── Filters ─────────────────────────────────────────────────────────────────

export const jobFiltersSchema = z.object({
  suburb:   z.string().optional(),
  category: JobCategoryEnum.optional(),
  urgency:  z.enum(["EMERGENCY","SAME_DAY","SCHEDULED"]).optional(),
  status:   z.enum(["DRAFT","OPEN","ASSIGNED","IN_PROGRESS","COMPLETED","CONFIRMED","CANCELLED"]).optional(),
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Application ─────────────────────────────────────────────────────────────

export const applyJobSchema = z.object({
  note: z.string().max(1000).optional(),
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
