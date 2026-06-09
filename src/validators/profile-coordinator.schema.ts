import { z } from "zod";

export const coordinatorProfileSchema = z.object({
  profileStep:                       z.number().int().min(0).max(9).optional(),
  roleType:                          z.enum(["INDEPENDENT", "AGENCY_EMPLOYED"]).optional(),
  organisationName:                  z.string().max(120).optional(),
  abn:                               z.string().max(20).optional(),
  ndisRegistered:                    z.boolean().optional(),
  ndisProviderNumber:                z.string().max(40).optional(),
  yearsExperience:                   z.string().max(20).optional(),
  supportCoordinationLevel:          z.array(z.string()).optional(),
  participantComplexityExperience:   z.array(z.string()).optional(),
  servicesOfferedBeyondCoordination: z.array(z.string()).optional(),
  serviceAreas:                      z.array(z.string()).optional(),
  serviceMode:                       z.enum(["IN_PERSON", "REMOTE", "BOTH"]).optional(),
  currentCapacityStatus:             z.string().max(80).optional(),
  maxParticipantLoad:                z.number().int().min(0).max(500).optional(),
  participantTypesAccepted:          z.array(z.string()).optional(),
  billingMethodPreference:           z.string().max(80).optional(),
  hourlyRate:                        z.number().min(0).max(9999).optional(),
  bio:                               z.string().max(2000).optional(),
  // Added for profile wizard
  languages:                         z.array(z.string()).optional(),
  fundingTypeCompatibility:          z.array(z.string()).optional(),
  seekingPlanManager:                z.boolean().optional(),
});

export type CoordinatorProfileInput = z.infer<typeof coordinatorProfileSchema>;
