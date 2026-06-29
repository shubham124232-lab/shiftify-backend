import { prisma } from "../../lib/prisma";
import { NotFoundError, ConflictError } from "../../lib/errors";
import type { UpdateProfileInput } from "../../validators/profile.schema";
import type { User, UserRole } from "@prisma/client";

// ─── Shared include ───────────────────────────────────────────────────────────

const USER_INCLUDE = {
  addresses: { orderBy: [{ isDefault: "desc" as const }, { createdAt: "asc" as const }] },
  roles: { orderBy: [{ isActiveDefault: "desc" as const }, { createdAt: "asc" as const }] },
  participantProfile: true as const,
  workerProfile:      { include: { availability: true as const } },
  providerProfile:    true as const,
  coordinatorProfile: true as const,
  planManagerProfile: true as const,
  documents:          { orderBy: { uploadedAt: "desc" as const } },
};

export async function getUserById(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: USER_INCLUDE,
  });
  if (!user) throw new NotFoundError("User not found");
  return user;
}

export function sanitizeUser<T extends { passwordHash: string | null }>(user: T): Omit<T, "passwordHash"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _ph, ...safe } = user;
  return safe;
}

// ─── Profile completion % (per active role) ───────────────────────────────────

type FullUser = Awaited<ReturnType<typeof getUserById>>;

export function computeProfileStep(user: FullUser, activeRole: UserRole): number {
  switch (activeRole) {
    case "PARTICIPANT":    return user.participantProfile?.profileStep ?? 0;
    case "SUPPORT_WORKER": return user.workerProfile?.profileStep ?? 0;
    case "PROVIDER":       return user.providerProfile?.profileStep ?? 0;
    case "COORDINATOR":    return user.coordinatorProfile?.profileStep ?? 0;
    case "PLAN_MANAGER":   return user.planManagerProfile?.profileStep ?? 0;
    default:               return 0;
  }
}

export interface CompletionResult {
  pct:     number;
  missing: string[];
}

export function computeCompletion(user: FullUser, activeRole: UserRole): CompletionResult {
  const wp  = user.workerProfile;
  const pp  = user.participantProfile;
  const cp  = user.coordinatorProfile;
  const pr  = user.providerProfile;
  const pm  = user.planManagerProfile;

  const has    = (v: unknown) => v !== null && v !== undefined && v !== "";
  const hasArr = (v: unknown) => Array.isArray(v) ? v.length > 0 : has(v);
  const isTrue = (v: unknown) => v === true;

  // Build field list as [label, filled] pairs so we can report missing labels
  type Field = [string, boolean];
  const check = (fields: Field[], conditional: Field[] = []): CompletionResult => {
    const all = [...fields, ...conditional];
    const missing = all.filter(([, ok]) => !ok).map(([label]) => label);
    const pct = Math.round(((all.length - missing.length) / all.length) * 100);
    return { pct, missing };
  };

  switch (activeRole) {
    case "PARTICIPANT": {
      const fields: Field[] = [
        ["Preferred name",              has(pp?.preferredName)],
        ["Age group",                   has(pp?.ageGroup)],
        ["Gender",                      has(pp?.gender)],
        ["Participant type",            has(pp?.participantType)],
        ["Suburb",                      has(pp?.suburb)],
        ["Postcode",                    has(pp?.postcode)],
        ["State",                       has(pp?.state)],
        ["Full address",                has(pp?.fullAddress)],
        ["NDIS number",                 has(pp?.ndisNumber)],
        ["Funding management type",     has(pp?.fundingManagementType)],
        ["Support coordination funding",has(pp?.supportCoordinationFunding)],
        ["NDIS start date",             has(pp?.ndisStartDate)],
        ["NDIS end date",               has(pp?.ndisEndDate)],
        ["Primary disability",          has(pp?.primaryDisability)],
        ["Primary support needs",       hasArr(pp?.primarySupportNeeds)],
        ["Mobility support needs",      hasArr(pp?.mobilitySupportNeeds)],
        ["Communication needs",         hasArr(pp?.communicationNeeds)],
        ["Behaviour & sensory notes",   hasArr(pp?.behaviourSensoryNotes)],
        ["Medical considerations",      hasArr(pp?.medicalConsiderations)],
        ["Risk & safety notes",         has(pp?.riskSafetyNotes)],
        ["Skills required",             hasArr(pp?.skillsRequired)],
        ["Support preferences",         hasArr(pp?.supportPreferences)],
        ["Preferred support type",      has(pp?.preferredSupportType)],
        ["Preferred worker gender",     has(pp?.preferredWorkerGender)],
        ["Language preference",         hasArr(pp?.languagePreference)],
        ["Cultural preference",         hasArr(pp?.culturalPreference)],
        ["Preferred days",              hasArr(pp?.preferredDays)],
        ["Preferred time",              hasArr(pp?.preferredTime)],
        ["Emergency contact name",      has(pp?.emergencyContactName)],
        ["Emergency contact phone",     has(pp?.emergencyContactPhone)],
        ["Emergency contact relationship", has(pp?.emergencyContactRelationship)],
        ["Privacy policy accepted",     isTrue(pp?.privacyPolicyAccepted)],
        ["Terms accepted",              isTrue(pp?.termsAccepted)],
        ["NDIS code accepted",          isTrue(pp?.ndisCodeAccepted)],
      ];
      return check(fields);
    }

    case "SUPPORT_WORKER": {
      const base: Field[] = [
        ["Date of birth",                   has(wp?.dob)],
        ["Gender",                          has(wp?.gender)],
        ["Suburb",                          has(wp?.suburb)],
        ["Postcode",                        has(wp?.postcode)],
        ["State",                           has(wp?.state)],
        ["Right to work",                   has(wp?.rightToWork)],
        ["Work type",                       has(wp?.workType)],
        ["GST registered",                  has(wp?.gstRegistered)],
        ["Public liability insurance",      isTrue(wp?.publicLiabilityInsurance)],
        ["Public liability policy number",  has(wp?.publicLiabilityPolicyNumber)],
        ["Public liability expiry",         has(wp?.publicLiabilityExpiry)],
        ["Personal accident insurance",     isTrue(wp?.personalAccidentInsurance)],
        ["Personal accident policy number", has(wp?.personalAccidentPolicyNumber)],
        ["Personal accident expiry",        has(wp?.personalAccidentExpiry)],
        ["Drivers licence type",            has(wp?.driversLicenceType)],
        ["Services offered",                hasArr(wp?.servicesOffered)],
        ["Sub-services",                    hasArr(wp?.subServices)],
        ["High intensity skills",           hasArr(wp?.highIntensitySkills)],
        ["Experience level",                has(wp?.experienceLevel)],
        ["Disability experience",           hasArr(wp?.disabilityExperience)],
        ["Availability type",               has(wp?.availabilityType)],
        ["Emergency availability",          isTrue(wp?.emergencyAvailability)],
        ["Can transport participants",      isTrue(wp?.canTransportParticipants)],
        ["Sleeper availability",            isTrue(wp?.sleeperAvailability)],
        ["Available days",                  hasArr(wp?.availableDays)],
        ["Time blocks",                     hasArr(wp?.timeBlocks)],
        ["Minimum shift hours",             has(wp?.minimumShiftHours)],
        ["Availability slots",              !!(wp && (wp.availability?.length ?? 0) > 0)],
        ["Service areas",                   hasArr(wp?.serviceAreas)],
        ["Travel radius",                   has(wp?.travelRadiusKm)],
        ["Has vehicle",                     isTrue(wp?.hasVehicle)],
        ["Hourly rate",                     has(wp?.hourlyRate)],
        ["Hourly rate type",                has(wp?.hourlyRateType)],
        ["Travel charges",                  has(wp?.travelCharges)],
        ["Preferred participant type",      hasArr(wp?.preferredParticipantType)],
        ["Gender preference",               has(wp?.genderPreference)],
        ["Languages spoken",                hasArr(wp?.languagesSpoken)],
        ["Bio",                             has(wp?.bio)],
        ["Preferences",                     has(wp?.preferences)],
        ["NDIS screening number",           has(wp?.ndisScreeningNumber)],
        ["NDIS screening expiry",           has(wp?.ndisScreeningExpiry)],
        ["Police check issue date",         has(wp?.policeCheckIssueDate)],
        ["Police check expiry",             has(wp?.policeCheckExpiry)],
        ["WWCC number",                     has(wp?.wwccNumber)],
        ["WWCC expiry",                     has(wp?.wwccExpiry)],
        ["First aid expiry",                has(wp?.firstAidExpiry)],
        ["First aid cert type",             has(wp?.firstAidCertType)],
        ["CPR expiry",                      has(wp?.cprExpiry)],
        ["Drivers licence expiry",          has(wp?.driversLicenceExpiry)],
        ["Infection control completed",     isTrue(wp?.infectionControlCompleted)],
        ["Manual handling completed",       isTrue(wp?.manualHandlingCompleted)],
        ["References",                      hasArr(wp?.references)],
        ["Terms accepted",                  isTrue(wp?.termsAccepted)],
        ["Privacy policy accepted",         isTrue(wp?.privacyPolicyAccepted)],
        ["NDIS code accepted",              isTrue(wp?.ndisCodeAccepted)],
        ["Declaration statement",           isTrue(wp?.declarationStatement)],
      ];
      const conditional: Field[] = [];
      if (wp?.rightToWork === "VISA_HOLDER") {
        conditional.push(["Visa type", has(wp?.visaType)], ["Visa expiry", has(wp?.visaExpiry)]);
      }
      if (wp?.workType === "CONTRACTOR") {
        conditional.push(["ABN", has(wp?.abn)]);
      }
      return check(base, conditional);
    }

    case "COORDINATOR": {
      const base: Field[] = [
        ["Role type",                           has(cp?.roleType)],
        ["ABN",                                 has(cp?.abn)],
        ["NDIS registered",                     has(cp?.ndisRegistered)],
        ["Years experience",                    has(cp?.yearsExperience)],
        ["Qualifications",                      hasArr(cp?.qualifications)],
        ["Police check expiry",                 has(cp?.policeCheckExpiry)],
        ["WWCC number",                         has(cp?.wwccNumber)],
        ["WWCC expiry",                         has(cp?.wwccExpiry)],
        ["NDIS screening number",               has(cp?.ndisScreeningNumber)],
        ["NDIS screening expiry",               has(cp?.ndisScreeningExpiry)],
        ["Professional indemnity provider",     has(cp?.professionalIndemnityProviderName)],
        ["Professional indemnity policy",       has(cp?.professionalIndemnityPolicyNumber)],
        ["Professional indemnity expiry",       has(cp?.professionalIndemnityExpiry)],
        ["Public liability policy",             has(cp?.publicLiabilityPolicyNumber)],
        ["Public liability expiry",             has(cp?.publicLiabilityExpiry)],
        ["Support coordination level",          hasArr(cp?.supportCoordinationLevel)],
        ["Participant complexity experience",   hasArr(cp?.participantComplexityExperience)],
        ["Additional services",                 hasArr(cp?.servicesOfferedBeyondCoordination)],
        ["Service areas",                       hasArr(cp?.serviceAreas)],
        ["Service mode",                        has(cp?.serviceMode)],
        ["Capacity status",                     has(cp?.currentCapacityStatus)],
        ["Availability type",                   has(cp?.availabilityType)],
        ["Max participant load",                has(cp?.maxParticipantLoad)],
        ["Funding type compatibility",          hasArr(cp?.fundingTypeCompatibility)],
        ["Billing method preference",           has(cp?.billingMethodPreference)],
        ["Hourly rate",                         has(cp?.hourlyRate)],
        ["Travel charges",                      has(cp?.travelCharges)],
        ["Bio",                                 has(cp?.bio)],
        ["Profile photo",                       has(cp?.profilePhoto)],
        ["Languages",                           hasArr(cp?.languages)],
        ["Gender",                              has(cp?.gender)],
        ["Terms accepted",                      isTrue(cp?.termsAccepted)],
        ["Privacy policy accepted",             isTrue(cp?.privacyPolicyAccepted)],
        ["NDIS code accepted",                  isTrue(cp?.ndisCodeAccepted)],
        ["Compliance declaration",              isTrue(cp?.complianceDeclaration)],
        ["Consent for verification",            isTrue(cp?.consentForVerification)],
      ];
      const conditional: Field[] = [];
      if (cp?.roleType === "AGENCY_EMPLOYED") {
        conditional.push(["Organisation name", has(cp?.organisationName)]);
      }
      if (cp?.ndisRegistered) {
        conditional.push(["NDIS provider number", has(cp?.ndisProviderNumber)]);
      }
      return check(base, conditional);
    }

    case "PROVIDER": {
      const base: Field[] = [
        ["Business name",                       has(pr?.businessName)],
        ["Legal entity name",                   has(pr?.legalEntityName)],
        ["ABN",                                 has(pr?.abn)],
        ["Business structure",                  has(pr?.businessStructure)],
        ["NDIS registered",                     has(pr?.ndisRegistered)],
        ["NDIS audit status",                   has(pr?.ndisAuditStatus)],
        ["GST registered",                      has(pr?.gstRegistered)],
        ["Years in operation",                  has(pr?.yearsInOperation)],
        ["Primary contact name",                has(pr?.primaryContactName)],
        ["Primary contact role",                has(pr?.primaryContactRole)],
        ["Primary contact phone",               has(pr?.primaryContactPhone)],
        ["Primary contact email",               has(pr?.primaryContactEmail)],
        ["Accounts contact name",               has(pr?.accountsContactName)],
        ["Accounts contact email",              has(pr?.accountsContactEmail)],
        ["Secondary contact name",              has(pr?.secondaryContactName)],
        ["Secondary contact role",              has(pr?.secondaryContactRole)],
        ["Secondary contact phone",             has(pr?.secondaryContactPhone)],
        ["Secondary contact email",             has(pr?.secondaryContactEmail)],
        ["Public liability policy",             has(pr?.publicLiabilityPolicyNumber)],
        ["Public liability coverage",           has(pr?.publicLiabilityCoverageAmount)],
        ["Public liability expiry",             has(pr?.publicLiabilityExpiryDate)],
        ["Professional indemnity policy",       has(pr?.professionalIndemnityPolicyNumber)],
        ["Professional indemnity expiry",       has(pr?.professionalIndemnityExpiryDate)],
        ["Workers comp policy",                 has(pr?.workersCompPolicyNumber)],
        ["Workers comp expiry",                 has(pr?.workersCompExpiryDate)],
        ["Compliance declaration",              isTrue(pr?.complianceDeclaration)],
        ["Core services",                       hasArr(pr?.coreServices)],
        ["Offers SIL",                          has(pr?.offersSil)],
        ["Offers SDA",                          has(pr?.offersSda)],
        ["Service areas",                       hasArr(pr?.serviceAreas)],
        ["Multiple locations",                  hasArr(pr?.multipleLocations)],
        ["Service mode",                        has(pr?.serviceMode)],
        ["Workforce size",                      has(pr?.workforceSize)],
        ["Workforce hiring type",               has(pr?.workforceHiringType)],
        ["Capacity status",                     has(pr?.currentCapacityStatus)],
        ["Participant types",                   hasArr(pr?.participantTypes)],
        ["Participant complexity accepted",     hasArr(pr?.participantComplexityAccepted)],
        ["Staff capability",                    hasArr(pr?.staffCapability)],
        ["Ability to fill urgent shifts",       isTrue(pr?.abilityToFillUrgentShifts)],
        ["Ability to post live availability",   isTrue(pr?.abilityToPostLiveAvailability)],
        ["Pricing model",                       has(pr?.pricingModel)],
        ["Billing method",                      has(pr?.billingMethod)],
        ["Travel charges",                      has(pr?.travelCharges)],
        ["Cancellation policy",                 has(pr?.cancellationPolicy)],
        ["Business description",                has(pr?.businessDescription)],
        ["Logo",                                has(pr?.logoUrl)],
        ["Website URL",                         has(pr?.websiteUrl)],
        ["Terms accepted",                      isTrue(pr?.termsAccepted)],
        ["NDIS code accepted",                  isTrue(pr?.ndisCodeAccepted)],
        ["Privacy policy accepted",             isTrue(pr?.privacyPolicyAccepted)],
        ["Service agreement accepted",          isTrue(pr?.serviceAgreementAccepted)],
        ["Platform rules accepted",             isTrue(pr?.platformRulesAccepted)],
      ];
      const conditional: Field[] = [];
      if (pr?.ndisRegistered) {
        conditional.push(["NDIS provider number", has(pr?.ndisProviderNumber)]);
      }
      if (pr?.offersSil) {
        conditional.push(
          ["SIL type",             has(pr?.silType)],
          ["SIL support level",    has(pr?.silSupportLevel)],
          ["SIL current vacancies",has(pr?.silCurrentVacancies)],
          ["SIL details",          has(pr?.silDetails)],
        );
      }
      if (pr?.offersSda) {
        conditional.push(
          ["SDA design category",  hasArr(pr?.sdaDesignCategory)],
          ["SDA vacancy count",    has(pr?.sdaVacancyCount)],
          ["SDA locations",        hasArr(pr?.sdaLocations)],
          ["SDA details",          has(pr?.sdaDetails)],
        );
      }
      return check(base, conditional);
    }

    case "PLAN_MANAGER": {
      const base: Field[] = [
        ["Role type",                               has(pm?.pmRoleType)],
        ["Business name",                           has(pm?.businessName)],
        ["Legal entity name",                       has(pm?.legalEntityName)],
        ["ABN",                                     has(pm?.abn)],
        ["ACN",                                     has(pm?.acn)],
        ["Business structure",                      has(pm?.businessStructure)],
        ["Director name",                           has(pm?.directorName)],
        ["Director position",                       has(pm?.directorPosition)],
        ["Business address",                        has(pm?.businessAddress)],
        ["Business suburb",                         has(pm?.businessSuburb)],
        ["Business state",                          has(pm?.businessState)],
        ["Business postcode",                       has(pm?.businessPostcode)],
        ["Business phone",                          has(pm?.businessPhone)],
        ["Business email",                          has(pm?.businessEmail)],
        ["Website URL",                             has(pm?.websiteUrl)],
        ["Finance team email",                      has(pm?.financeTeamEmail)],
        ["Accounts payable phone",                  has(pm?.accountsPayablePhone)],
        ["Years in operation",                      has(pm?.yearsInOperation)],
        ["NDIS registration status",                has(pm?.ndisRegistrationStatus)],
        ["Plan types supported",                    hasArr(pm?.planTypesSupported)],
        ["SIL/SDA invoicing",                       isTrue(pm?.silSdaInvoicing)],
        ["Services provided",                       hasArr(pm?.servicesProvided)],
        ["Recurring invoices",                      isTrue(pm?.plansRecurringInvoices)],
        ["Once-off invoices",                       isTrue(pm?.plansOnceOffInvoices)],
        ["Provides budget statements",              isTrue(pm?.providesBudgetStatements)],
        ["Participant types supported",             hasArr(pm?.participantTypesSupported)],
        ["Participant complexity experience",       hasArr(pm?.participantComplexityExperience)],
        ["Service coverage type",                   has(pm?.serviceCoverageType)],
        ["Timezone",                                has(pm?.timezone)],
        ["Operating hours",                         has(pm?.operatingHours)],
        ["Phone support hours",                     has(pm?.phoneSupportHours)],
        ["Email response SLA",                      has(pm?.emailResponseSla)],
        ["Invoice turnaround time",                 has(pm?.invoiceTurnaroundTime)],
        ["Invoice intake method",                   hasArr(pm?.invoiceIntakeMethod)],
        ["Primary invoice contact email",           has(pm?.primaryInvoiceContactEmail)],
        ["Accounts contact name",                   has(pm?.accountsContactName)],
        ["Payment enquiry contact name",            has(pm?.paymentEnquiryContactName)],
        ["Payment enquiry contact email",           has(pm?.paymentEnquiryContactEmail)],
        ["Payment enquiry contact phone",           has(pm?.paymentEnquiryContactPhone)],
        ["Invoice reference format",                has(pm?.invoiceReferenceFormat)],
        ["Remittance advice",                       has(pm?.remittanceAdvice)],
        ["Dispute handling contact",                has(pm?.disputeHandlingContact)],
        ["Staff finance team email",                has(pm?.staffFinanceTeamEmail)],
        ["Accepts registered providers only",       isTrue(pm?.acceptsRegisteredProvidersOnly)],
        ["Accepts unregistered providers",          isTrue(pm?.acceptsUnregisteredProviders)],
        ["Requires service dates on invoices",      isTrue(pm?.requiresServiceDatesOnInvoices)],
        ["Requires support category code",          isTrue(pm?.requiresSupportCategoryCode)],
        ["Requires participant consent confirmation", isTrue(pm?.requiresParticipantConsentConfirmation)],
        ["Record keeping declaration",              isTrue(pm?.recordKeepingDeclaration)],
        ["Conflict of interest declaration",        isTrue(pm?.conflictOfInterestDeclaration)],
        ["No misuse of funds declaration",          isTrue(pm?.noMisuseOfFundsDeclaration)],
        ["Tax compliance declaration",              isTrue(pm?.taxComplianceDeclaration)],
        ["Information accurate declaration",        isTrue(pm?.informationAccurateDeclaration)],
        ["Complaints contact name",                 has(pm?.complaintsContactName)],
        ["Complaints contact email",                has(pm?.complaintsContactEmail)],
        ["Incident escalation contact",             has(pm?.incidentEscalationContact)],
        ["Privacy contact",                         has(pm?.privacyContact)],
        ["Records retention contact",               has(pm?.recordsRetentionContact)],
        ["Organisation user model",                 has(pm?.organisationUserModel)],
        ["Participant linking method",              hasArr(pm?.participantLinkingMethod)],
        ["Link approval required",                  isTrue(pm?.linkApprovalRequired)],
        ["Requires service agreement before invoicing", isTrue(pm?.requiresServiceAgreementBeforeInvoicing)],
        ["Invoice acceptance rules",                hasArr(pm?.invoiceAcceptanceRules)],
        ["Accepts recurring claims",                isTrue(pm?.acceptsRecurringClaims)],
        ["Accepts once-off claims",                 isTrue(pm?.acceptsOnceOffClaims)],
        ["Accepts transport claims",                isTrue(pm?.acceptsTransportClaims)],
        ["Accepts allied health invoices",          isTrue(pm?.acceptsAlliedHealthInvoices)],
        ["Requires docs for high-value invoices",   isTrue(pm?.requiresDocsForHighValueInvoices)],
        ["Allows provider portal messaging",        isTrue(pm?.allowsProviderPortalMessaging)],
        ["Invoice notification email",              has(pm?.invoiceNotificationEmail)],
        ["Compliance notices email",                has(pm?.complianceNoticesEmail)],
        ["Escalation contact for failed payments",  has(pm?.escalationContactForFailedPayments)],
        ["SMS alerts enabled",                      isTrue(pm?.smsAlertsEnabled)],
        ["Subscription plan",                       has(pm?.subscriptionPlan)],
        ["Billing contact name",                    has(pm?.billingContactName)],
        ["Billing contact email",                   has(pm?.billingContactEmail)],
        ["Billing address",                         has(pm?.billingAddress)],
        ["GST registered",                          isTrue(pm?.gstRegistered)],
        ["Accepting clients",                       isTrue(pm?.acceptingClients)],
        ["Terms accepted",                          isTrue(pm?.termsAccepted)],
        ["Privacy policy accepted",                 isTrue(pm?.privacyPolicyAccepted)],
        ["NDIS code accepted",                      isTrue(pm?.ndisCodeAccepted)],
        ["Confirm authority to register",           isTrue(pm?.confirmAuthorityToRegister)],
        ["Confirm details accurate",                isTrue(pm?.confirmDetailsAccurate)],
        ["Consent to verification",                 isTrue(pm?.consentToVerification)],
        ["Consent to participant linking controls", isTrue(pm?.consentToParticipantLinkingControls)],
        ["Consent to invoice routing rules",        isTrue(pm?.consentToInvoiceRoutingRules)],
      ];
      const conditional: Field[] = [];
      if (pm?.ndisRegistrationStatus === "REGISTERED") {
        conditional.push(
          ["NDIS provider number",          has(pm?.ndisProviderNumber)],
          ["Registration expiry date",      has(pm?.registrationExpiryDate)],
          ["Approved registration groups",  hasArr(pm?.approvedRegistrationGroups)],
        );
      }
      if (pm?.businessStructure === "TRUST") {
        conditional.push(["Trust name", has(pm?.trustName)]);
      }
      if (pm?.serviceCoverageType === "STATE_BASED") {
        conditional.push(["State coverage", hasArr(pm?.stateCoverage)]);
      }
      if (pm?.serviceCoverageType === "REGION_BASED") {
        conditional.push(["Service areas", hasArr(pm?.serviceAreas)], ["Postcodes served", hasArr(pm?.postcodesServed)]);
      }
      if (pm?.organisationUserModel === "MULTI_USER") {
        conditional.push(
          ["Staff admin name",     has(pm?.staffAdminName)],
          ["Staff admin email",    has(pm?.staffAdminEmail)],
          ["Staff seats required", has(pm?.staffSeatsRequired)],
        );
      }
      return check(base, conditional);
    }

    default:
      return { pct: 0, missing: [] };
  }
}

// Parent edits a child -- same logic, just a different userId
export const updateChildProfile = updateProfile;

// ─── Profile update (PATCH /users/me) ────────────────────────────────────────

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const { address, ...scalar } = input;

  if (scalar.email) {
    const existing = await prisma.user.findUnique({ where: { email: scalar.email } });
    if (existing && existing.id !== userId) throw new ConflictError("That email is already in use");
  }
  if (scalar.phone) {
    const existing = await prisma.user.findUnique({ where: { phone: scalar.phone } });
    if (existing && existing.id !== userId) throw new ConflictError("That phone number is already in use");
  }
  if (scalar.username) {
    const existing = await prisma.user.findUnique({ where: { username: scalar.username } });
    if (existing && existing.id !== userId) throw new ConflictError("That username is already taken");
  }

  const scalarData: Record<string, unknown> = {};
  if (scalar.name          !== undefined) scalarData.name          = scalar.name;
  if (scalar.email         !== undefined) scalarData.email         = scalar.email;
  if (scalar.phone         !== undefined) scalarData.phone         = scalar.phone;
  if (scalar.avatarUrl     !== undefined) scalarData.avatarUrl     = scalar.avatarUrl;
  if (scalar.username      !== undefined) scalarData.username      = scalar.username;
  if (scalar.defaultSuburb !== undefined) scalarData.defaultSuburb = scalar.defaultSuburb;
  if (scalar.defaultState  !== undefined) scalarData.defaultState  = scalar.defaultState;
  if (scalar.defaultPostcode !== undefined) scalarData.defaultPostcode = scalar.defaultPostcode;

  await prisma.user.update({ where: { id: userId }, data: scalarData });

  if (address) {
    const defaultAddr = await prisma.address.findFirst({
      where: { userId, isDefault: true },
    });
    if (defaultAddr) {
      await prisma.address.update({
        where: { id: defaultAddr.id },
        data: {
          unitApartment: address.unitApartment ?? null,
          street:        address.street ?? null,
          suburb:        address.suburb,
          state:         address.state ?? null,
          postcode:      address.postcode ?? null,
          notes:         address.notes ?? null,
        },
      });
    } else {
      await prisma.address.create({
        data: {
          userId,
          isDefault:     true,
          unitApartment: address.unitApartment ?? null,
          street:        address.street ?? null,
          suburb:        address.suburb,
          state:         address.state ?? null,
          postcode:      address.postcode ?? null,
          notes:         address.notes ?? null,
        },
      });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        defaultSuburb:   address.suburb,
        defaultState:    address.state ?? null,
        defaultPostcode: address.postcode ?? null,
      },
    });
  }

  return getUserById(userId);
}
