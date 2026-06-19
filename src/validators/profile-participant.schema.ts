import { z } from "zod";

export const participantProfileSchema = z.object({
  profileStep:                  z.number().int().min(0).max(20).optional(),
  // Personal
  preferredName:                z.string().max(80).optional(),
  ageGroup:                     z.string().max(40).optional(),
  gender:                       z.string().max(40).optional(),
  participantType:              z.string().max(60).optional(),
  suburb:                       z.string().max(100).optional(),
  postcode:                     z.string().max(10).optional(),
  state:                        z.string().max(10).optional(),
  fullAddress:                  z.string().max(300).optional(),
  // NDIS
  ndisNumber:                   z.string().max(20).optional(),
  fundingManagementType:        z.enum(["SELF", "PLAN", "NDIA"]).optional(),
  supportCoordinationFunding:   z.string().max(80).optional(),
  ndisStartDate:                z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional(),
  ndisEndDate:                  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional(),
  // Support needs
  primaryDisability:            z.string().max(120).optional(),
  primarySupportNeeds:          z.array(z.string()).optional(),
  mobilitySupportNeeds:         z.array(z.string()).optional(),
  communicationNeeds:           z.array(z.string()).optional(),
  behaviourSensoryNotes:        z.array(z.string()).optional(),
  medicalConsiderations:        z.array(z.string()).optional(),
  riskSafetyNotes:              z.string().max(1000).optional(),
  skillsRequired:               z.array(z.string()).optional(),
  // Preferences
  supportPreferences:           z.array(z.string()).optional(),
  preferredSupportType:         z.string().max(80).optional(),
  preferredWorkerGender:        z.string().max(40).optional(),
  languagePreference:           z.string().max(80).optional(),
  culturalPreference:           z.string().max(120).optional(),
  preferredDays:                z.array(z.string()).optional(),
  preferredTime:                z.string().max(40).optional(),
  // Emergency contact
  emergencyContactName:         z.string().max(120).optional(),
  emergencyContactPhone:        z.string().max(30).optional(),
  emergencyContactRelationship: z.string().max(80).optional(),
  // Declarations
  seekingPlanManager:           z.boolean().optional(),
  privacyPolicyAccepted:        z.boolean().optional(),
  termsAccepted:                z.boolean().optional(),
  ndisCodeAccepted:             z.boolean().optional(),
});

export type ParticipantProfileInput = z.infer<typeof participantProfileSchema>;
