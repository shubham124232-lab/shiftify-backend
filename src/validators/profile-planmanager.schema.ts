import { z } from "zod";
import { phoneOptional, emailOptional } from "./shared";

const planManagerProfileBaseSchema = z.object({
  profileStep:                           z.number().int().min(0).max(20).optional(),
  // Step 2 -- Role Type
  pmRoleType:                            z.enum(["PLAN_MANAGER", "PM_ORG_ADMIN", "PM_STAFF_MEMBER"]).optional(),
  // Step 3 -- Business Identity
  businessName:                          z.string().max(120).optional(),
  legalEntityName:                       z.string().max(120).optional(),
  abn:                                   z.string().max(20).optional(),
  acn:                                   z.string().max(20).optional(),
  businessStructure:                     z.enum(["SOLE_TRADER", "PARTNERSHIP", "COMPANY", "TRUST"]).optional(),
  trustName:                             z.string().max(120).optional(),
  directorName:                          z.string().max(120).optional(),
  directorPosition:                      z.string().max(80).optional(),
  businessAddress:                       z.string().max(200).optional(),
  businessSuburb:                        z.string().max(100).optional(),
  businessState:                         z.string().max(10).optional(),
  businessPostcode:                      z.string().max(10).optional(),
  businessPhone:                         phoneOptional,
  businessEmail:                         emailOptional,
  websiteUrl:                            z.string().url().optional().or(z.literal("")),
  financeTeamEmail:                      emailOptional,
  accountsPayablePhone:                  phoneOptional,
  yearsInOperation:                      z.string().max(20).optional(),
  // Step 4 -- NDIS Registration
  ndisRegistrationStatus:                z.enum(["REGISTERED", "IN_PROGRESS", "NOT_REGISTERED"]).optional(),
  ndisRegistered:                        z.boolean().optional(),
  ndisProviderNumber:                    z.string().max(40).optional(),
  registrationExpiryDate:                z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date").optional(),
  approvedRegistrationGroups:            z.array(z.string()).optional(),
  // Step 5 -- Plan Management Capability
  planTypesSupported:                    z.array(z.string()).optional(),
  silSdaInvoicing:                       z.boolean().optional(),
  servicesProvided:                      z.array(z.string()).optional(),
  plansRecurringInvoices:                z.boolean().optional(),
  plansOnceOffInvoices:                  z.boolean().optional(),
  providesBudgetStatements:              z.boolean().optional(),
  // Step 6 -- Participant / Funding Scope
  participantTypesSupported:             z.array(z.string()).optional(),
  participantComplexityExperience:       z.array(z.string()).optional(),
  // Step 7 -- Service Coverage
  serviceCoverageType:                   z.enum(["AUSTRALIA_WIDE", "STATE_BASED", "REGION_BASED"]).optional(),
  stateCoverage:                         z.array(z.string()).optional(),
  serviceAreas:                          z.array(z.string()).optional(),
  postcodesServed:                       z.array(z.string()).optional(),
  timezone:                              z.string().max(60).optional(),
  operatingHours:                        z.string().max(60).optional(),
  phoneSupportHours:                     z.string().max(60).optional(),
  emailResponseSla:                      z.string().max(60).optional(),
  invoiceTurnaroundTime:                 z.string().max(60).optional(),
  // Step 8 -- Payment Operations
  invoiceIntakeMethod:                   z.array(z.string()).optional(),
  primaryInvoiceContactEmail:            emailOptional,
  accountsContactName:                   z.string().max(120).optional(),
  paymentEnquiryContactName:             z.string().max(120).optional(),
  paymentEnquiryContactEmail:            emailOptional,
  paymentEnquiryContactPhone:            phoneOptional,
  invoiceReferenceFormat:                z.string().max(120).optional(),
  remittanceAdvice:                      z.string().max(200).optional(),
  disputeHandlingContact:                z.string().max(200).optional(),
  staffFinanceTeamEmail:                 emailOptional,
  acceptsRegisteredProvidersOnly:        z.boolean().optional(),
  acceptsUnregisteredProviders:          z.boolean().optional(),
  requiresServiceDatesOnInvoices:        z.boolean().optional(),
  requiresSupportCategoryCode:           z.boolean().optional(),
  requiresParticipantConsentConfirmation: z.boolean().optional(),
  // Step 9 -- Compliance & Governance
  recordKeepingDeclaration:              z.boolean().optional(),
  conflictOfInterestDeclaration:         z.boolean().optional(),
  noMisuseOfFundsDeclaration:            z.boolean().optional(),
  taxComplianceDeclaration:              z.boolean().optional(),
  informationAccurateDeclaration:        z.boolean().optional(),
  complaintsContactName:                 z.string().max(120).optional(),
  complaintsContactEmail:                emailOptional,
  incidentEscalationContact:             z.string().max(200).optional(),
  privacyContact:                        z.string().max(200).optional(),
  recordsRetentionContact:               z.string().max(200).optional(),
  // Step 10 -- Staff / User Access Control
  organisationUserModel:                 z.enum(["SINGLE", "MULTI_USER"]).optional(),
  staffAdminName:                        z.string().max(120).optional(),
  staffAdminEmail:                       emailOptional,
  staffSeatsRequired:                    z.number().int().min(0).max(9999).optional(),
  // Step 11 -- Participant Linking Setup
  participantLinkingMethod:              z.array(z.string()).optional(),
  linkApprovalRequired:                  z.boolean().optional(),
  requiresServiceAgreementBeforeInvoicing: z.boolean().optional(),
  // Step 12 -- Provider Interaction Settings
  invoiceAcceptanceRules:                z.array(z.string()).optional(),
  acceptsRecurringClaims:                z.boolean().optional(),
  acceptsOnceOffClaims:                  z.boolean().optional(),
  acceptsTransportClaims:                z.boolean().optional(),
  acceptsAlliedHealthInvoices:           z.boolean().optional(),
  requiresDocsForHighValueInvoices:      z.boolean().optional(),
  allowsProviderPortalMessaging:         z.boolean().optional(),
  // Step 14 -- Communication Preferences
  invoiceNotificationEmail:              emailOptional,
  complianceNoticesEmail:                emailOptional,
  escalationContactForFailedPayments:    z.string().max(200).optional(),
  smsAlertsEnabled:                      z.boolean().optional(),
  // Step 15 -- Subscription / Commercial Setup
  subscriptionPlan:                      z.string().max(40).optional(),
  billingContactName:                    z.string().max(120).optional(),
  billingContactEmail:                   emailOptional,
  billingAddress:                        z.string().max(200).optional(),
  gstRegistered:                         z.boolean().optional(),
  // Step 16 -- Terms, Privacy & Platform Rules
  acceptingClients:                      z.boolean().optional(),
  termsAccepted:                         z.boolean().optional(),
  privacyPolicyAccepted:                 z.boolean().optional(),
  ndisCodeAccepted:                      z.boolean().optional(),
  complianceDeclaration:                 z.boolean().optional(),
  consentForVerification:                z.boolean().optional(),
});

export const planManagerProfileSchema = planManagerProfileBaseSchema.superRefine((data, ctx) => {
  if (data.ndisRegistrationStatus === "REGISTERED") {
    if (!data.ndisProviderNumber) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ndisProviderNumber"], message: "NDIS provider number is required when registered" });
    if (!data.registrationExpiryDate) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["registrationExpiryDate"], message: "Registration expiry date is required when registered" });
  }
});

export type PlanManagerProfileInput = z.infer<typeof planManagerProfileSchema>;
