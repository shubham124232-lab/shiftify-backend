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
  "MEDICATION_COMPETENCY",
  "PHOTO_ID",
  "DRIVERS_LICENCE",
  "VEHICLE_INSURANCE",
  "PUBLIC_LIABILITY_INSURANCE",
  "PROFESSIONAL_INDEMNITY",
  "WORKERS_COMP",
  "NDIS_AUDIT",
  "PERSONAL_ACCIDENT_INSURANCE",
  "QUALIFICATION_CERTIFICATE",
  "ABN_CONFIRMATION",
  "NDIS_REGISTRATION_PROOF",
  "BUSINESS_REP_PROOF",
  "POLICIES_PROCEDURES",
  "BUSINESS_ADDRESS_EVIDENCE",
  "CONTACT_IDENTITY_EVIDENCE",
  "BANK_FINANCE_EVIDENCE",
  "OTHER",
] as const;

export const uploadDocumentSchema = z.object({
  docType:         z.enum(DOCUMENT_TYPES),
  referenceNumber: z.string().max(80).optional(),
  issueDate:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "issueDate must be YYYY-MM-DD").optional(),
  expiryDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expiryDate must be YYYY-MM-DD").optional(),
  title:           z.string().max(120).optional(),
  issuer:          z.string().max(120).optional(),
  visibility:      z.enum(["VERIFICATION_TEAM", "AUTHORISED_ADMINISTRATORS", "AUTHORISED_WORKFORCE", "AFTER_PERMITTED_ENQUIRY"]).optional(),
  replacesId:      z.string().uuid().optional(),
}).strict();

export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;
