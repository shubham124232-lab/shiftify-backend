import { z } from "zod";

// Coerces empty string to undefined so optional date fields don't fail regex on blank inputs
const optDate = z.preprocess(
  v => (v === "" || v === null ? undefined : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional(),
);

const coordinatorProfileBaseSchema = z.object({
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
  supportCoordinationLevel:          z.array(z.string()).optional(),
  participantComplexityExperience:   z.array(z.string()).optional(),
  servicesOfferedBeyondCoordination: z.array(z.string()).optional(),
  // Step 4 -- Service Coverage
  serviceAreas:                      z.array(z.string()).optional(),
  serviceRadius:                     z.number().int().min(0).max(500).optional(),
  serviceMode:                       z.enum(["IN_PERSON", "TELEHEALTH", "HYBRID"]).optional(),
  // Step 5 -- Availability & Capacity
  currentCapacityStatus:             z.string().max(80).optional(),
  availabilityType:                  z.enum(["BUSINESS_HOURS", "FLEXIBLE", "EMERGENCY_AVAILABLE"]).optional(),
  maxParticipantLoad:                z.number().int().min(0).max(200).optional(),
  // Step 6 -- Plan Management Handling
  fundingTypeCompatibility:          z.array(z.string()).optional(),
  billingMethodPreference:           z.string().max(80).optional(),
  // Step 7 -- Rates & Commercials
  hourlyRate:                        z.number().min(0).max(9999).optional(),
  travelCharges:                     z.enum(["NONE", "INCLUDED", "CHARGED_SEPARATELY"]).optional(),
  showRatePublicly:                  z.boolean().optional(),
  // Step 8 -- Profile & Trust Layer
  bio:                               z.string().max(2000).optional(),
  profilePhoto:                      z.string().max(500).optional(),
  languages:                         z.array(z.string()).optional(),
  gender:                            z.string().max(40).nullable().optional(),
  seekingPlanManager:                z.boolean().optional(),
  isPubliclyListed:                  z.boolean().optional(),
  // Step 9 -- Platform Rules & Compliance
  termsAccepted:                     z.boolean().optional(),
  privacyPolicyAccepted:             z.boolean().optional(),
  ndisCodeAccepted:                  z.boolean().optional(),
  complianceDeclaration:             z.boolean().optional(),
  consentForVerification:            z.boolean().optional(),
});

export const coordinatorProfileSchema = coordinatorProfileBaseSchema.superRefine((data, ctx) => {
  if (data.roleType === "AGENCY_EMPLOYED" && !data.organisationName) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["organisationName"], message: "Organisation name is required for agency-employed coordinators" });
  }
  if (data.ndisRegistered && !data.ndisProviderNumber) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ndisProviderNumber"], message: "NDIS provider number is required for NDIS-registered coordinators" });
  }
  // Final-submission checks — only enforced once the applicant reaches the declaration step,
  // so in-progress step-by-step saves are never blocked.
  if (data.termsAccepted === true) {
    if (!data.abn) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["abn"], message: "ABN is required" });
    }
    if (!data.supportCoordinationLevel || data.supportCoordinationLevel.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["supportCoordinationLevel"], message: "Support Coordination Level Offered is required" });
    }
    if (!data.participantComplexityExperience || data.participantComplexityExperience.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["participantComplexityExperience"], message: "Participant Complexity Experience is required" });
    }
  }
});

export type CoordinatorProfileInput = z.infer<typeof coordinatorProfileSchema>;
