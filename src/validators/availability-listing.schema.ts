import { z } from "zod";
import { JobCategoryEnum } from "./job.schema";

export const AvailabilityListingTypeEnum = z.enum(["DATE_RANGE", "FORTNIGHTLY", "ONGOING", "BACKUP"]);
export const AvailabilityListingVisibilityEnum = z.enum(["ALL", "CONNECTIONS_ONLY"]);
export const AvailabilityListingStatusEnum = z.enum(["DRAFT", "ACTIVE", "PAUSED", "EXPIRED"]);

export const createAvailabilityListingSchema = z.object({
  listingType:    AvailabilityListingTypeEnum,
  startDate:      z.coerce.date(),
  endDate:        z.coerce.date().optional(),
  services:       z.array(JobCategoryEnum).min(1),
  suburb:         z.string().max(120).optional(),
  state:          z.string().max(10).optional(),
  travelRadiusKm: z.number().int().min(0).max(200).optional(),
  rate:           z.number().min(0).max(1000).optional(),
  visibility:     AvailabilityListingVisibilityEnum.optional(),
  expiresAt:      z.coerce.date().optional(),
}).strict();

export const updateAvailabilityListingSchema = createAvailabilityListingSchema.partial().extend({
  status: AvailabilityListingStatusEnum.optional(),
}).strict();

export type CreateAvailabilityListingInput = z.infer<typeof createAvailabilityListingSchema>;
export type UpdateAvailabilityListingInput = z.infer<typeof updateAvailabilityListingSchema>;
