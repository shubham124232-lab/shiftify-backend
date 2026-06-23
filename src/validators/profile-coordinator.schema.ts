import { z } from "zod";

// Coerces empty string to undefined so optional date fields don't fail regex on blank inputs
const optDate = z.preprocess(
  v => (v === "" || v === null ? undefined : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional(),
);

export const coordinatorProfileSchema = z.object({
  profileStep:                       z.number().int().min(0).max(20).optional(),
  // Step 1 -- Professional Identity
  roleType:                          z.enum(["INDEPENDENT", "AGENCY_EMPLOYED"]).optional(),
  organisationName:                  z.string().max(120).optional(),
  abn:                               z.string().max(20).optional(),
  ndisRegistered:                    z.boolean().optional(),
  ndisProviderNumber:                z.string().max(40).optional(),
  yearsExperience:                   z.string().max(20).optional(),
  // Step 2 -- Qualification & Compliance
  qualifications:                    z.array(z.string()).optional(),
  policeCheckExpiry:                 optDate,
  wwccNumber:                        z.string().max(80).optional(),
  wwccExpiry:                        optDate,
  ndisScreeningNumber:               z.string().max(80).optional(),
  ndisScreeningExpiry:               optDate,
  professionalIndemnityProviderName: z.string().max(120).optional(),
  professionalIndemnityPolicyNumber: z.string().max(80).optional(),
  professionalIndemnityExpiry:       optDate,
  publicLiabilityPolicyNumber:       z.string().max(80).optional(),
  publicLiabilityExpiry:             optDate,
  // Step 3 -- Service Capability
  coordinationLevels:                z.array(z.string()).optional(),
  participantComplexity:             z.array(z.string()).optional(),
  additionalServices:                z.array(z.string()).optional(),
  // Step 4 -- Service Coverage
  serviceAreas:                      z.array(z.string()).optional(),
  serviceMode:                       z.enum(["IN_PERSON", "TELEHEALTH", "HYBRID"]).optional(),
  // Step 5 -- Availability & Capacity
  capacityStatus:                    z.string().max(80).optional(),
  availabilityType:                  z.enum(["FULL_TIME", "PART_TIME", "CASUAL"]).optional(),
  maxParticipantLoad:                z.number().int().min(0).max(500).optional(),
  // Step 6 -- Plan Management Handling
  fundingTypeCompatibility:          z.array(z.string()).optional(),
  billingMethodPreference:           z.string().max(80).optional(),
  // Step 7 -- Rates & Commercials
  hourlyRate:                        z.number().min(0).max(9999).optional(),
  travelCharges:                     z.enum(["NONE", "INCLUDED", "CHARGED_SEPARATELY"]).optional(),
  // Step 8 -- Profile & Trust Layer
  bio:                               z.string().max(2000).optional(),
  profilePhoto:                      z.string().max(500).optional(),
  languages:                         z.array(z.string()).optional(),
  gender:                            z.string().max(40).optional(),
  seekingPlanManager:                z.boolean().optional(),
  // Step 9 -- Platform Rules & Compliance
  termsAccepted:                     z.boolean().optional(),
  privacyPolicyAccepted:             z.boolean().optional(),
  ndisCodeAccepted:                  z.boolean().optional(),
  complianceDeclaration:             z.boolean().optional(),
  consentForVerification:            z.boolean().optional(),
});

export type CoordinatorProfileInput = z.infer<typeof coordinatorProfileSchema>;
