import { z } from "zod";

// ─── Incident report ─────────────────────────────────────────────────────────

const incidentEvidenceUrls = z.array(z.string().url()).max(10);

// isDraft lets the reporter save an in-progress report (category picked,
// description still blank) and come back to finish it later via PATCH below.
export const createIncidentSchema = z.object({
  category:     z.enum(["SAFETY", "NO_SHOW", "MISCONDUCT", "OTHER"]),
  description:  z.string().max(2000).optional(),
  evidenceUrls: incidentEvidenceUrls.optional(),
  isDraft:      z.boolean().optional().default(false),
}).strict();

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

// PATCH /jobs/:id/incidents/:incidentId — completes a draft and/or attaches
// evidence after the fact. `finalize: true` transitions DRAFT → OPEN.
export const updateIncidentSchema = z.object({
  category:     z.enum(["SAFETY", "NO_SHOW", "MISCONDUCT", "OTHER"]).optional(),
  description:  z.string().max(2000).optional(),
  evidenceUrls: incidentEvidenceUrls.optional(),
  finalize:     z.boolean().optional().default(false),
}).strict();

export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;
