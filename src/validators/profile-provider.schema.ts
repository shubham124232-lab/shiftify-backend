import { z } from "zod";

const socialLinksSchema = z.object({
  facebook:  z.string().max(200).optional(),
  instagram: z.string().max(200).optional(),
  linkedin:  z.string().max(200).optional(),
});

export const providerProfileSchema = z.object({
  profileStep:                       z.number().int().min(0).max(20).optional(),
  // Business identity
  businessName:                      z.string().max(120).optional(),
  legalEntityName:                   z.string().max(120).optional(),
  abn:                               z.string().max(20).optional(),
  businessStructure:                 z.enum(["SOLE_TRADER", "PARTNERSHIP", "COMPANY", "TRUST"]).optional(),
  ndisRegistered:                    z.boolean().optional(),
  ndisProviderNumber:                z.string().max(40).optional(),
  ndisAuditStatus:                   z.enum(["VERIFIED", "PENDING", "EXPIRED"]).optional(),
  gstRegistered:                     z.boolean().optional(),
  yearsInOperation:                  z.string().max(20).optional(),
  // Primary contact
  primaryContactName:                z.string().max(120).optional(),
  primaryContactRole:                z.string().max(80).optional(),
  primaryContactPhone:               z.string().max(30).optional(),
  primaryContactEmail:               z.string().email().optional(),
  // Accounts contact
  accountsContactName:               z.string().max(120).optional(),
  accountsContactEmail:              z.string().email().optional(),
  // Secondary contact
  secondaryContactName:              z.string().max(120).optional(),
  secondaryContactRole:              z.string().max(80).optional(),
  secondaryContactPhone:             z.string().max(30).optional(),
  secondaryContactEmail:             z.string().email().optional(),
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

export type ProviderProfileInput = z.infer<typeof providerProfileSchema>;
