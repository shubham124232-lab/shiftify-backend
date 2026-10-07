import { z } from "zod";
import { paginationSchema } from "./pagination.schema";

// Filters for GET /workers/available.
export const browseWorkersFiltersSchema = z.object({
  suburb: z.string().optional(),
  state:  z.string().optional(),
  // PR-D01 / PR-SP01 — only workers whose Available Now switch is currently on.
  availableNow: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
  ...paginationSchema.shape,
});

export type BrowseWorkersFiltersInput = z.infer<typeof browseWorkersFiltersSchema>;
