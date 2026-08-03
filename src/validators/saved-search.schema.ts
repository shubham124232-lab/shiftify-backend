import { z } from "zod";
import { JobCategoryEnum, ShiftTypeEnum, FundingTypeEnum, UrgencyEnum } from "./job.schema";

// Subset of jobFiltersSchema that's meaningful to persist as a standing
// "notify me" request — no pagination/sort/date-range fields.
export const savedSearchFiltersSchema = z.object({
  suburb:      z.string().max(100).optional(),
  state:       z.string().max(50).optional(),
  category:    JobCategoryEnum.optional(),
  urgency:     UrgencyEnum.optional(),
  shiftType:   ShiftTypeEnum.optional(),
  fundingType: FundingTypeEnum.optional(),
  isRecurring: z.boolean().optional(),
}).strict();

export const createSavedSearchSchema = z.object({
  label:   z.string().max(80).optional(),
  filters: savedSearchFiltersSchema,
});

export const updateSavedSearchSchema = z.object({
  label:    z.string().max(80).optional(),
  filters:  savedSearchFiltersSchema.optional(),
  isActive: z.boolean().optional(),
});

export type SavedSearchFilters     = z.infer<typeof savedSearchFiltersSchema>;
export type CreateSavedSearchInput = z.infer<typeof createSavedSearchSchema>;
export type UpdateSavedSearchInput = z.infer<typeof updateSavedSearchSchema>;
