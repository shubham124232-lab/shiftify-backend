import { z } from "zod";
import { paginationSchema } from "./pagination.schema";

// Filters for GET /coordinators/available.
export const browseCoordinatorsFiltersSchema = z.object({
  search: z.string().optional(), // matches organisationName
  ...paginationSchema.shape,
});

export type BrowseCoordinatorsFiltersInput = z.infer<typeof browseCoordinatorsFiltersSchema>;
