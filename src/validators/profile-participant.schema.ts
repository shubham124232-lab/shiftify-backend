import { z } from "zod";

export const participantProfileSchema = z.object({
  profileStep:                  z.number().int().min(0).max(3).optional(),
  preferredName:                z.string().max(80).optional(),
  ageGroup:                     z.string().max(40).optional(),
  gender:                       z.string().max(40).optional(),
  ndisNumber:                   z.string().max(20).optional(),
  fundingManagementType:        z.enum(["SELF", "PLAN", "NDIA"]).optional(),
  primaryDisability:            z.string().max(120).optional(),
  mobilitySupportNeeds:         z.record(z.unknown()).optional(),
  communicationNeeds:           z.record(z.unknown()).optional(),
  behaviourSensoryNotes:        z.record(z.unknown()).optional(),
  medicalConsiderations:        z.record(z.unknown()).optional(),
  riskSafetyNotes:              z.string().max(1000).optional(),
  supportPreferences:           z.record(z.unknown()).optional(),
  emergencyContactName:         z.string().max(120).optional(),
  emergencyContactPhone:        z.string().max(30).optional(),
  emergencyContactRelationship: z.string().max(80).optional(),
  seekingPlanManager:           z.boolean().optional(),
});

export type ParticipantProfileInput = z.infer<typeof participantProfileSchema>;
