import { z } from "zod";

// DocumentType values mirror the Prisma enum exactly.
const DOCUMENT_TYPES = [
  "POLICE_CHECK",
  "NDIS_SCREENING",
  "WWCC",
  "FIRST_AID",
  "CPR",
  "MANUAL_HANDLING",
  "INFECTION_CONTROL",
  "DRIVERS_LICENCE",
  "VEHICLE_INSURANCE",
  "PUBLIC_LIABILITY_INSURANCE",
  "PROFESSIONAL_INDEMNITY",
  "WORKERS_COMP",
  "NDIS_AUDIT",
  "PERSONAL_ACCIDENT_INSURANCE",
  "QUALIFICATION_CERTIFICATE",
  "OTHER",
] as const;

export const uploadDocumentSchema = z.object({
  docType:         z.enum(DOCUMENT_TYPES),
  referenceNumber: z.string().max(80).optional(),
  issueDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "issueDate must be YYYY-MM-DD").optional(),
  expiryDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expiryDate must be YYYY-MM-DD").optional(),
});

export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;
