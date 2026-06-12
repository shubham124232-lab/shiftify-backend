import { z } from "zod";

export const participantProfileSchema = z.object({
  profileStep:                  z.number().int().min(0).max(4).optional(),
  preferredName:                z.string().max(80).optional(),
  ageGroup:                     z.string().max(40).optional(),
  gender:                       z.string().max(40).optional(),
  ndisNumber:                   z.string().max(20).optional(),
  fundingManagementType:        z.enum(["SELF", "PLAN", "NDIA"]).optional(),
  primaryDisability:            z.string().max(120).optional(),
  mobilitySupportNeeds:         z.array(z.string()).optional(),
  communicationNeeds:           z.array(z.string()).optional(),
  behaviourSensoryNotes:        z.array(z.string()).optional(),
  medicalConsiderations:        z.array(z.string()).optional(),
  riskSafetyNotes:              z.string().max(1000).optional(),
  supportPreferences:           z.array(z.string()).optional(),
  emergencyContactName:         z.string().max(120).optional(),
  emergencyContactPhone:        z.string().max(30).optional(),
  emergencyContactRelationship: z.string().max(80).optional(),
  seekingPlanManager:           z.boolean().optional(),
  termsAccepted:                z.boolean().optional(),
  ndisCodeAccepted:             z.boolean().optional(),
});

export type ParticipantProfileInput = z.infer<typeof participantProfileSchema>;
