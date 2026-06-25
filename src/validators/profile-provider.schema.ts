import { z } from "zod";
import { phoneOptional, emailOptional } from "./shared";

const socialLinksSchema = z.object({
  facebook:  z.string().max(200).optional(),
  instagram: z.string().max(200).optional(),
  linkedin:  z.string().max(200).optional(),
});

const providerProfileBaseSchema = z.object({
  profileStep:                       z.number().int().min(0).max(20).optional(),
  // Business identity
  businessName:                      z.string().max(120).optional(),
  legalEntityName:                   z.string().max(120).optional(),
  abn:                               z.string().max(20).optional(),
  businessStructure:                 z.enum(["SOLE_TRADER", "PARTNERSHIP", "COMPANY", "TRUST", "NOT_FOR_PROFIT", "GOVERNMENT"]).optional(),
  ndisRegistered:                    z.boolean().optional(),
  ndisProviderNumber:                z.string().max(40).optional(),
  ndisAuditStatus:                   z.string().max(60).optional(),
  gstRegistered:                     z.boolean().optional(),
  yearsInOperation:                  z.string().max(20).optional(),
  // Primary contact
  primaryContactName:                z.string().max(120).optional(),
  primaryContactRole:                z.string().max(80).optional(),
  primaryContactPhone:               phoneOptional,
  primaryContactEmail:               emailOptional,
  // Accounts contact
  accountsContactName:               z.string().max(120).optional(),
  accountsContactEmail:              emailOptional,
  // Secondary contact
  secondaryContactName:              z.string().max(120).optional(),
  secondaryContactRole:              z.string().max(80).optional(),
  secondaryContactPhone:             phoneOptional,
  secondaryContactEmail:             emailOptional,
  // Insurance
  publicLiabilityPolicyNumber:       z.string().max(80).optional(),
  publicLiabilityCoverageAmount:     z.string().max(40).optional(),
  publicLiabilityExpiryDate:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional(),
  professionalIndemnityPolicyNumber: z.string().max(80).optional(),
  professionalIndemnityExpiryDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional(),
  workersCompPolicyNumber:           z.string().max(80).optional(),
  workersCompExpiryDate:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional(),
  // Services
  coreServices:                      z.array(z.string()).optional(),
  offersSil:                         z.boolean().optional(),
  silType:                           z.enum(["SHARED", "INDIVIDUAL"]).optional(),
  silSupportLevel:                   z.enum(["FULL_TIME", "DROP_IN"]).optional(),
  silCurrentVacancies:               z.boolean().optional(),
  silDetails:                        z.record(z.unknown()).optional(),
  offersSda:                         z.boolean().optional(),
  sdaDesignCategory:                 z.array(z.string()).optional(),
  sdaVacancyCount:                   z.number().int().min(0).optional(),
  sdaLocations:                      z.array(z.string()).optional(),
  sdaDetails:                        z.record(z.unknown()).optional(),
  // Service areas
  serviceAreas:                      z.array(z.string()).optional(),
  multipleLocations:                 z.array(z.string()).optional(),
  serviceMode:                       z.enum(["IN_PERSON", "REMOTE", "BOTH"]).optional(),
  // Workforce
  workforceSize:                     z.string().max(40).optional(),
  workforceHiringType:               z.enum(["INTERNAL", "EXTERNAL", "BOTH"]).optional(),
  currentCapacityStatus:             z.enum(["OPEN", "LIMITED", "FULL"]).optional(),
  participantTypes:                  z.array(z.string()).optional(),
  participantComplexityAccepted:     z.array(z.string()).optional(),
  staffCapability:                   z.array(z.string()).optional(),
  abilityToFillUrgentShifts:         z.boolean().optional(),
  abilityToPostLiveAvailability:     z.boolean().optional(),
  // Pricing
  pricingModel:                      z.string().max(80).optional(),
  billingMethod:                     z.string().max(80).optional(),
  travelCharges:                     z.string().max(40).optional(),
  cancellationPolicy:                z.string().max(1000).optional(),
  // About / platform
  businessDescription:               z.string().max(2000).optional(),
  websiteUrl:                        z.string().url().optional().or(z.literal("")),
  logoUrl:                           z.string().url().optional().or(z.literal("")),
  socialLinks:                       socialLinksSchema.optional(),
  seekingPlanManager:                z.boolean().optional(),
  canPostRequests:                   z.boolean().optional(),
  canViewWorkerMarketplace:          z.boolean().optional(),
  canPostWorkerRequirements:         z.boolean().optional(),
  canPostSilSdaVacancies:            z.boolean().optional(),
  // Declarations
  termsAccepted:                     z.boolean().optional(),
  ndisCodeAccepted:                  z.boolean().optional(),
  privacyPolicyAccepted:             z.boolean().optional(),
  serviceAgreementAccepted:          z.boolean().optional(),
  platformRulesAccepted:             z.boolean().optional(),
  complianceDeclaration:             z.boolean().optional(),
});

export const providerProfileSchema = providerProfileBaseSchema.superRefine((data, ctx) => {
  if (data.ndisRegistered && !data.ndisProviderNumber) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ndisProviderNumber"], message: "NDIS provider number is required for NDIS-registered providers" });
  }
  if (data.offersSil) {
    if (!data.silType) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["silType"], message: "SIL type is required when offering SIL" });
    if (!data.silSupportLevel) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["silSupportLevel"], message: "SIL support level is required when offering SIL" });
  }
  if (data.offersSda && !data.sdaDesignCategory?.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sdaDesignCategory"], message: "SDA design category is required when offering SDA" });
  }
});

export type ProviderProfileInput = z.infer<typeof providerProfileSchema>;
