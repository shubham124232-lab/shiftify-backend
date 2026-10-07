import { z } from "zod";

// SC-SV01 — stackable categories; a professional can be saved into several at once.
export const SAVED_PROFESSIONAL_LIST_TYPES = [
  "GENERAL",
  "PREFERRED_WORKER",
  "PREFERRED_PROVIDER",
  "BACKUP",
  "RAPID_RESPONSE",
  "PARTICIPANT_FAVOURITE",
  "DO_NOT_INVITE",
] as const;

export const createSavedProfessionalSchema = z.object({
  professionalUserId: z.string().uuid(),
  note:               z.string().max(300).optional(),
  listType:           z.enum(SAVED_PROFESSIONAL_LIST_TYPES).default("GENERAL"),
  forParticipantUserId: z.string().uuid().optional(),
}).strict();

export type CreateSavedProfessionalInput = z.infer<typeof createSavedProfessionalSchema>;

// GET /saved-professionals — optional listType filter
export const listSavedProfessionalsQuerySchema = z.object({
  listType: z.enum(SAVED_PROFESSIONAL_LIST_TYPES).optional(),
}).strict();
export type ListSavedProfessionalsQuery = z.infer<typeof listSavedProfessionalsQuerySchema>;

// DELETE /saved-professionals/:professionalUserId — identifies the exact row
// (a professional may be saved into multiple lists at once).
export const removeSavedProfessionalQuerySchema = z.object({
  listType: z.enum(SAVED_PROFESSIONAL_LIST_TYPES).default("GENERAL"),
  forParticipantUserId: z.string().uuid().optional(),
}).strict();
export type RemoveSavedProfessionalQuery = z.infer<typeof removeSavedProfessionalQuerySchema>;
