import { z } from "zod";

// ─── Incident report ─────────────────────────────────────────────────────────

export const createIncidentSchema = z.object({
  category:    z.enum(["SAFETY", "NO_SHOW", "MISCONDUCT", "OTHER"]),
  description: z.string().max(2000).optional(),
}).strict();

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
