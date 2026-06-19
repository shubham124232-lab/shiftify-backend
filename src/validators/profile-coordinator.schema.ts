import { z } from "zod";

export const coordinatorProfileSchema = z.object({
  profileStep:                       z.number().int().min(0).max(20).optional(),
  // Step 2 -- Professional Identity
  roleType:                          z.enum(["INDEPENDENT", "AGENCY_EMPLOYED"]).optional(),
  organisationName:                  z.string().max(120).optional(),
  abn:                               z.string().max(20).optional(),
  ndisRegistered:                    z.boolean().optional(),
  ndisProviderNumber:                z.string().max(40).optional(),
  yearsExperience:                   z.string().max(20).optional(),
  // Step 3 -- Qualification & Compliance metadata
  qualifications:                    z.array(z.string()).optional(),
  policeCheckExpiry:                 z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional(),
  wwccNumber:                        z.string().max(80).optional(),
  wwccExpiry:                        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional(),
  ndisScreeningNumber:               z.string().max(80).optional(),
  ndisScreeningExpiry:               z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional(),
  professionalIndemnityProviderName: z.string().max(120).optional(),
  professionalIndemnityPolicyNumber: z.string().max(80).optional(),
  professionalIndemnityExpiry:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional(),
  publicLiabilityPolicyNumber:       z.string().max(80).optional(),
  publicLiabilityExpiry:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional(),
  // Step 4 -- Service Capability
  supportCoordinationLevel:          z.array(z.string()).optional(),
  participantComplexityExperience:   z.array(z.string()).optional(),
  servicesOfferedBeyondCoordination: z.array(z.string()).optional(),
  // Step 5 -- Service Coverage
  serviceAreas:                      z.array(z.string()).optional(),
  serviceMode:                       z.enum(["IN_PERSON", "REMOTE", "BOTH"]).optional(),
  serviceRadius:                     z.number().int().min(0).max(500).optional(),
  // Step 6 -- Availability & Capacity
  currentCapacityStatus:             z.string().max(80).optional(),
  availabilityType:                  z.enum(["BUSINESS_HOURS", "FLEXIBLE", "EMERGENCY_AVAILABLE"]).optional(),
  maxParticipantLoad:                z.number().int().min(0).max(500).optional(),
  // Step 7 -- Plan Management Handling
  participantTypesAccepted:          z.array(z.string()).optional(),
  fundingTypeCompatibility:          z.array(z.string()).optional(),
  billingMethodPreference:           z.string().max(80).optional(),
  // Step 8 -- Rates & Commercials
  hourlyRate:                        z.number().min(0).max(9999).optional(),
  travelCharges:                     z.enum(["INCLUDED", "CHARGED_SEPARATELY"]).optional(),
  // Step 9 -- Profile & Trust Layer
  bio:                               z.string().max(2000).optional(),
  profilePhoto:                      z.string().max(500).optional(),
  languages:                         z.array(z.string()).optional(),
  gender:                            z.string().max(40).optional(),
  seekingPlanManager:                z.boolean().optional(),
  // Step 10 -- Platform Rules & Compliance
  termsAccepted:                     z.boolean().optional(),
  privacyPolicyAccepted:             z.boolean().optional(),
  ndisCodeAccepted:                  z.boolean().optional(),
  complianceDeclaration:             z.boolean().optional(),
  consentForVerification:            z.boolean().optional(),
});

export type CoordinatorProfileInput = z.infer<typeof coordinatorProfileSchema>;
