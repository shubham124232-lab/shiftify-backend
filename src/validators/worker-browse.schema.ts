import { z } from "zod";
import { paginationSchema } from "./pagination.schema";

// Filters for GET /workers/available.
export const browseWorkersFiltersSchema = z.object({
  suburb: z.string().optional(),
  state:  z.string().optional(),
  ...paginationSchema.shape,
});

export type BrowseWorkersFiltersInput = z.infer<typeof browseWorkersFiltersSchema>;
