import { z } from "zod";

const qualificationSchema = z.object({
  name:        z.string().max(120),
  institution: z.string().max(120).optional(),
});

export const coordinatorProfileSchema = z.object({
  profileStep:                       z.number().int().min(0).max(20).optional(),
  // Role & org
  roleType:                          z.enum(["INDEPENDENT", "AGENCY_EMPLOYED"]).optional(),
  organisationName:                  z.string().max(120).optional(),
  abn:                               z.string().max(20).optional(),
  gender:                            z.string().max(40).optional(),
  // NDIS
  ndisRegistered:                    z.boolean().optional(),
  ndisProviderNumber:                z.string().max(40).optional(),
  // Experience
  yearsExperience:                   z.string().max(20).optional(),
  qualifications:                    z.array(qualificationSchema).optional(),
  supportCoordinationLevel:          z.array(z.string()).optional(),
  participantComplexityExperience:   z.array(z.string()).optional(),
  servicesOfferedBeyondCoordination: z.array(z.string()).optional(),
  // Service areas
  serviceAreas:                      z.array(z.string()).optional(),
  serviceMode:                       z.enum(["IN_PERSON", "REMOTE", "BOTH"]).optional(),
  serviceRadius:                     z.number().int().min(0).max(500).optional(),
  languages:                         z.array(z.string()).optional(),
  // Capacity
  currentCapacityStatus:             z.string().max(80).optional(),
  availabilityType:                  z.string().max(40).optional(),
  maxParticipantLoad:                z.number().int().min(0).max(500).optional(),
  participantTypesAccepted:          z.array(z.string()).optional(),
  fundingTypeCompatibility:          z.array(z.string()).optional(),
  // Billing
  billingMethodPreference:           z.string().max(80).optional(),
  hourlyRate:                        z.number().min(0).max(9999).optional(),
  travelCharges:                     z.string().max(40).optional(),
  // About
  bio:                               z.string().max(2000).optional(),
  profilePhoto:                      z.string().max(500).optional(),
  seekingPlanManager:                z.boolean().optional(),
  // Declarations
  consentForVerification:            z.boolean().optional(),
  privacyPolicyAccepted:             z.boolean().optional(),
  termsAccepted:                     z.boolean().optional(),
  ndisCodeAccepted:                  z.boolean().optional(),
});

export type CoordinatorProfileInput = z.infer<typeof coordinatorProfileSchema>;
