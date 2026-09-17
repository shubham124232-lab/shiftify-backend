// GET /public/shiftboard — the ONLY unauthenticated job-listing endpoint in
// the app (see public-shiftboard.routes.ts, mounted outside requireAuth).
// Deliberately its own schema/module rather than widening liveDashboardFiltersSchema
// — that one hard-assumes a logged-in userId/activeRole for isOwnRequest and
// role-based visibility gating, neither of which exist for an anonymous caller.
import { z } from "zod";
import { paginationSchema } from "./pagination.schema";
import { JobCategoryEnum, ShiftTypeEnum, UrgencyEnum } from "./job.schema";

const coercedBoolean = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "string" ? v === "true" : v))
  .optional();

export const TimeOfDayEnum = z.enum(["MORNING", "AFTERNOON", "EVENING", "OVERNIGHT"]);

export const publicShiftboardFiltersSchema = z.object({
  suburb: z.string().optional(),
  state:  z.string().optional(),

  category:  JobCategoryEnum.optional(),
  shiftType: ShiftTypeEnum.optional(),
  urgency:   UrgencyEnum.optional(), // selects one tab; omitted = "All shifts"

  // Radius search — only applied when BOTH nearLat and nearLng are present;
  // a lone nearLat or nearLng is treated as if neither were given (soft, no
  // validation error, since the caller may have partially-loaded geolocation).
  nearLat:  z.coerce.number().min(-90).max(90).optional(),
  nearLng:  z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().max(500).default(50),

  startFrom: z.string().datetime({ offset: true }).optional(),
  startTo:   z.string().datetime({ offset: true }).optional(),

  // Accepts either a comma-separated string ("MORNING,EVENING") or Express's
  // native repeated-key array (?timeOfDay=MORNING&timeOfDay=EVENING).
  timeOfDay: z.preprocess(
    (v) => (typeof v === "string" ? v.split(",").filter(Boolean) : v),
    z.array(TimeOfDayEnum),
  ).optional(),

  // Worker-requirement filters — match the workerPreferences JSON keys added
  // to the posting flow (shared.tsx buildWorkerPreferencesPayload / routine's
  // ROUTINE_PREFERENCE_LABELS). Job-side "this shift requires X", not a
  // worker-profile filter.
  driversLicence:      coercedBoolean,
  vehicle:             coercedBoolean,
  certIIIOrAbove:      coercedBoolean,
  restrictivePractices: coercedBoolean,
  firstAid:            coercedBoolean,
  alliedHealth:        coercedBoolean,

  ...paginationSchema.shape,
  sortBy: z.enum(["newest", "urgency", "startDate", "nearest"]).default("urgency"),
});

export type PublicShiftboardFiltersInput = z.infer<typeof publicShiftboardFiltersSchema>;
export type TimeOfDay = z.infer<typeof TimeOfDayEnum>;
