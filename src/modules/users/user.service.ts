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

export function computeCompletion(user: FullUser, activeRole: UserRole): number {
  const wp  = user.workerProfile;
  const pp  = user.participantProfile;
  const cp  = user.coordinatorProfile;
  const pr  = user.providerProfile;
  const pm  = user.planManagerProfile;

  const pct    = (filled: number, total: number) => Math.round((filled / total) * 100);
  const has    = (v: unknown) => v !== null && v !== undefined && v !== "";
  const hasArr = (v: unknown) => Array.isArray(v) ? v.length > 0 : has(v);
  const isTrue = (v: unknown) => v === true;

  switch (activeRole) {
    case "PARTICIPANT": {
      const fields = [
        // Personal
        has(pp?.preferredName),
        has(pp?.ageGroup),
        has(pp?.gender),
        has(pp?.participantType),
        has(pp?.suburb),
        has(pp?.postcode),
        has(pp?.state),
        has(pp?.fullAddress),
        // NDIS
        has(pp?.ndisNumber),
        has(pp?.fundingManagementType),
        has(pp?.supportCoordinationFunding),
        has(pp?.ndisStartDate),
        has(pp?.ndisEndDate),
        // Support needs
        has(pp?.primaryDisability),
        hasArr(pp?.primarySupportNeeds),
        hasArr(pp?.mobilitySupportNeeds),
        hasArr(pp?.communicationNeeds),
        hasArr(pp?.behaviourSensoryNotes),
        hasArr(pp?.medicalConsiderations),
        has(pp?.riskSafetyNotes),
        hasArr(pp?.skillsRequired),
        // Preferences
        hasArr(pp?.supportPreferences),
        has(pp?.preferredSupportType),
        has(pp?.preferredWorkerGender),
        hasArr(pp?.languagePreference),
        hasArr(pp?.culturalPreference),
        hasArr(pp?.preferredDays),
        hasArr(pp?.preferredTime),
        // Emergency contact
        has(pp?.emergencyContactName),
        has(pp?.emergencyContactPhone),
        has(pp?.emergencyContactRelationship),
        // Declarations
        isTrue(pp?.privacyPolicyAccepted),
        isTrue(pp?.termsAccepted),
        isTrue(pp?.ndisCodeAccepted),
      ];
      return pct(fields.filter(Boolean).length, fields.length);
    }

    case "SUPPORT_WORKER": {
      const base = [
        // Personal
        has(wp?.dob),
        has(wp?.gender),
        has(wp?.suburb),
        has(wp?.postcode),
        has(wp?.state),
        // Right to work
        has(wp?.rightToWork),
        // Work type
        has(wp?.workType),
        has(wp?.gstRegistered),
        // Insurance
        isTrue(wp?.publicLiabilityInsurance),
        has(wp?.publicLiabilityPolicyNumber),
        has(wp?.publicLiabilityExpiry),
        isTrue(wp?.personalAccidentInsurance),
        has(wp?.personalAccidentPolicyNumber),
        has(wp?.personalAccidentExpiry),
        has(wp?.driversLicenceType),
        // Services
        hasArr(wp?.servicesOffered),
        hasArr(wp?.subServices),
        hasArr(wp?.highIntensitySkills),
        has(wp?.experienceLevel),
        hasArr(wp?.disabilityExperience),
        // Availability
        has(wp?.availabilityType),
        isTrue(wp?.emergencyAvailability),
        isTrue(wp?.canTransportParticipants),
        isTrue(wp?.sleeperAvailability),
        hasArr(wp?.availableDays),
        hasArr(wp?.timeBlocks),
        has(wp?.minimumShiftHours),
        wp && (wp.availability?.length ?? 0) > 0,
        // Location
        hasArr(wp?.serviceAreas),
        has(wp?.travelRadiusKm),
        isTrue(wp?.hasVehicle),
        // Financials
        has(wp?.hourlyRate),
        has(wp?.hourlyRateType),
        has(wp?.travelCharges),
        // Preferences & bio
        hasArr(wp?.preferredParticipantType),
        has(wp?.genderPreference),
        hasArr(wp?.languagesSpoken),
        has(wp?.bio),
        has(wp?.preferences),
        // Compliance
        has(wp?.ndisScreeningNumber),
        has(wp?.ndisScreeningExpiry),
        has(wp?.policeCheckIssueDate),
        has(wp?.policeCheckExpiry),
        has(wp?.wwccNumber),
        has(wp?.wwccExpiry),
        has(wp?.firstAidExpiry),
        has(wp?.firstAidCertType),
        has(wp?.cprExpiry),
        has(wp?.driversLicenceExpiry),
        isTrue(wp?.infectionControlCompleted),
        isTrue(wp?.manualHandlingCompleted),
        // References
        hasArr(wp?.references),
        // Declarations
        isTrue(wp?.termsAccepted),
        isTrue(wp?.privacyPolicyAccepted),
        isTrue(wp?.ndisCodeAccepted),
        isTrue(wp?.declarationStatement),
      ];

      // Conditional fields
      const conditional: boolean[] = [];
      if (wp?.rightToWork === "VISA_HOLDER") {
        conditional.push(has(wp?.visaType), has(wp?.visaExpiry));
      }
      if (wp?.workType === "CONTRACTOR") {
        conditional.push(has(wp?.abn));
      }

      const all = [...base, ...conditional];
      return pct(all.filter(Boolean).length, all.length);
    }

    case "COORDINATOR": {
      const base = [
        // Professional identity
        has(cp?.roleType),
        has(cp?.abn),
        has(cp?.ndisRegistered),
        has(cp?.yearsExperience),
        // Qualifications & compliance
        hasArr(cp?.qualifications),
        has(cp?.policeCheckExpiry),
        has(cp?.wwccNumber),
        has(cp?.wwccExpiry),
        has(cp?.ndisScreeningNumber),
        has(cp?.ndisScreeningExpiry),
        has(cp?.professionalIndemnityProviderName),
        has(cp?.professionalIndemnityPolicyNumber),
        has(cp?.professionalIndemnityExpiry),
        has(cp?.publicLiabilityPolicyNumber),
        has(cp?.publicLiabilityExpiry),
        // Service capability
        hasArr(cp?.supportCoordinationLevel),
        hasArr(cp?.participantComplexityExperience),
        hasArr(cp?.servicesOfferedBeyondCoordination),
        // Coverage
        hasArr(cp?.serviceAreas),
        has(cp?.serviceMode),
        // Availability
        has(cp?.currentCapacityStatus),
        has(cp?.availabilityType),
        has(cp?.maxParticipantLoad),
        // Plan management
        hasArr(cp?.fundingTypeCompatibility),
        has(cp?.billingMethodPreference),
        // Rates
        has(cp?.hourlyRate),
        has(cp?.travelCharges),
        // Profile
        has(cp?.bio),
        has(cp?.profilePhoto),
        hasArr(cp?.languages),
        has(cp?.gender),
        // Declarations
        isTrue(cp?.termsAccepted),
        isTrue(cp?.privacyPolicyAccepted),
        isTrue(cp?.ndisCodeAccepted),
        isTrue(cp?.complianceDeclaration),
        isTrue(cp?.consentForVerification),
      ];

      const conditional: boolean[] = [];
      if (cp?.roleType === "AGENCY_EMPLOYED") {
        conditional.push(has(cp?.organisationName));
      }
      if (cp?.ndisRegistered) {
        conditional.push(has(cp?.ndisProviderNumber));
      }

      const all = [...base, ...conditional];
      return pct(all.filter(Boolean).length, all.length);
    }

    case "PROVIDER": {
      const base = [
        // Business identity
        has(pr?.businessName),
        has(pr?.legalEntityName),
        has(pr?.abn),
        has(pr?.businessStructure),
        has(pr?.ndisRegistered),
        has(pr?.ndisAuditStatus),
        has(pr?.gstRegistered),
        has(pr?.yearsInOperation),
        // Primary contact
        has(pr?.primaryContactName),
        has(pr?.primaryContactRole),
        has(pr?.primaryContactPhone),
        has(pr?.primaryContactEmail),
        // Accounts contact
        has(pr?.accountsContactName),
        has(pr?.accountsContactEmail),
        // Secondary contact
        has(pr?.secondaryContactName),
        has(pr?.secondaryContactRole),
        has(pr?.secondaryContactPhone),
        has(pr?.secondaryContactEmail),
        // Insurance
        has(pr?.publicLiabilityPolicyNumber),
        has(pr?.publicLiabilityCoverageAmount),
        has(pr?.publicLiabilityExpiryDate),
        has(pr?.professionalIndemnityPolicyNumber),
        has(pr?.professionalIndemnityExpiryDate),
        has(pr?.workersCompPolicyNumber),
        has(pr?.workersCompExpiryDate),
        isTrue(pr?.complianceDeclaration),
        // Services
        hasArr(pr?.coreServices),
        has(pr?.offersSil),
        has(pr?.offersSda),
        // Service areas
        hasArr(pr?.serviceAreas),
        hasArr(pr?.multipleLocations),
        has(pr?.serviceMode),
        // Workforce
        has(pr?.workforceSize),
        has(pr?.workforceHiringType),
        has(pr?.currentCapacityStatus),
        hasArr(pr?.participantTypes),
        hasArr(pr?.participantComplexityAccepted),
        hasArr(pr?.staffCapability),
        isTrue(pr?.abilityToFillUrgentShifts),
        isTrue(pr?.abilityToPostLiveAvailability),
        // Pricing
        has(pr?.pricingModel),
        has(pr?.billingMethod),
        has(pr?.travelCharges),
        has(pr?.cancellationPolicy),
        // About
        has(pr?.businessDescription),
        has(pr?.logoUrl),
        has(pr?.websiteUrl),
        // Declarations
        isTrue(pr?.termsAccepted),
        isTrue(pr?.ndisCodeAccepted),
        isTrue(pr?.privacyPolicyAccepted),
        isTrue(pr?.serviceAgreementAccepted),
        isTrue(pr?.platformRulesAccepted),
      ];

      const conditional: boolean[] = [];
      if (pr?.ndisRegistered) {
        conditional.push(has(pr?.ndisProviderNumber));
      }
      if (pr?.offersSil) {
        conditional.push(has(pr?.silType), has(pr?.silSupportLevel), has(pr?.silCurrentVacancies), has(pr?.silDetails));
      }
      if (pr?.offersSda) {
        conditional.push(hasArr(pr?.sdaDesignCategory), has(pr?.sdaVacancyCount), hasArr(pr?.sdaLocations), has(pr?.sdaDetails));
      }

      const all = [...base, ...conditional];
      return pct(all.filter(Boolean).length, all.length);
    }

    case "PLAN_MANAGER": {
      const base = [
        // Role type
        has(pm?.pmRoleType),
        // Business identity
        has(pm?.businessName),
        has(pm?.legalEntityName),
        has(pm?.abn),
        has(pm?.acn),
        has(pm?.businessStructure),
        has(pm?.directorName),
        has(pm?.directorPosition),
        has(pm?.businessAddress),
        has(pm?.businessSuburb),
        has(pm?.businessState),
        has(pm?.businessPostcode),
        has(pm?.businessPhone),
        has(pm?.businessEmail),
        has(pm?.websiteUrl),
        has(pm?.financeTeamEmail),
        has(pm?.accountsPayablePhone),
        has(pm?.yearsInOperation),
        // NDIS registration
        has(pm?.ndisRegistrationStatus),
        // Capability
        hasArr(pm?.planTypesSupported),
        isTrue(pm?.silSdaInvoicing),
        hasArr(pm?.servicesProvided),
        isTrue(pm?.plansRecurringInvoices),
        isTrue(pm?.plansOnceOffInvoices),
        isTrue(pm?.providesBudgetStatements),
        // Participant scope
        hasArr(pm?.participantTypesSupported),
        hasArr(pm?.participantComplexityExperience),
        // Service coverage
        has(pm?.serviceCoverageType),
        has(pm?.timezone),
        has(pm?.operatingHours),
        has(pm?.phoneSupportHours),
        has(pm?.emailResponseSla),
        has(pm?.invoiceTurnaroundTime),
        // Payment operations
        hasArr(pm?.invoiceIntakeMethod),
        has(pm?.primaryInvoiceContactEmail),
        has(pm?.accountsContactName),
        has(pm?.paymentEnquiryContactName),
        has(pm?.paymentEnquiryContactEmail),
        has(pm?.paymentEnquiryContactPhone),
        has(pm?.invoiceReferenceFormat),
        has(pm?.remittanceAdvice),
        has(pm?.disputeHandlingContact),
        has(pm?.staffFinanceTeamEmail),
        isTrue(pm?.acceptsRegisteredProvidersOnly),
        isTrue(pm?.acceptsUnregisteredProviders),
        isTrue(pm?.requiresServiceDatesOnInvoices),
        isTrue(pm?.requiresSupportCategoryCode),
        isTrue(pm?.requiresParticipantConsentConfirmation),
        // Compliance
        isTrue(pm?.recordKeepingDeclaration),
        isTrue(pm?.conflictOfInterestDeclaration),
        isTrue(pm?.noMisuseOfFundsDeclaration),
        isTrue(pm?.taxComplianceDeclaration),
        isTrue(pm?.informationAccurateDeclaration),
        has(pm?.complaintsContactName),
        has(pm?.complaintsContactEmail),
        has(pm?.incidentEscalationContact),
        has(pm?.privacyContact),
        has(pm?.recordsRetentionContact),
        // Organisation model
        has(pm?.organisationUserModel),
        // Participant linking
        hasArr(pm?.participantLinkingMethod),
        isTrue(pm?.linkApprovalRequired),
        isTrue(pm?.requiresServiceAgreementBeforeInvoicing),
        // Provider interaction
        hasArr(pm?.invoiceAcceptanceRules),
        isTrue(pm?.acceptsRecurringClaims),
        isTrue(pm?.acceptsOnceOffClaims),
        isTrue(pm?.acceptsTransportClaims),
        isTrue(pm?.acceptsAlliedHealthInvoices),
        isTrue(pm?.requiresDocsForHighValueInvoices),
        isTrue(pm?.allowsProviderPortalMessaging),
        // Communication
        has(pm?.invoiceNotificationEmail),
        has(pm?.complianceNoticesEmail),
        has(pm?.escalationContactForFailedPayments),
        isTrue(pm?.smsAlertsEnabled),
        // Commercial
        has(pm?.subscriptionPlan),
        has(pm?.billingContactName),
        has(pm?.billingContactEmail),
        has(pm?.billingAddress),
        isTrue(pm?.gstRegistered),
        // Declarations
        isTrue(pm?.acceptingClients),
        isTrue(pm?.termsAccepted),
        isTrue(pm?.privacyPolicyAccepted),
        isTrue(pm?.ndisCodeAccepted),
        isTrue(pm?.confirmAuthorityToRegister),
        isTrue(pm?.confirmDetailsAccurate),
        isTrue(pm?.consentToVerification),
        isTrue(pm?.consentToParticipantLinkingControls),
        isTrue(pm?.consentToInvoiceRoutingRules),
      ];

      const conditional: boolean[] = [];
      if (pm?.ndisRegistrationStatus === "REGISTERED") {
        conditional.push(has(pm?.ndisProviderNumber), has(pm?.registrationExpiryDate));
        conditional.push(hasArr(pm?.approvedRegistrationGroups));
      }
      if (pm?.businessStructure === "TRUST") {
        conditional.push(has(pm?.trustName));
      }
      if (pm?.serviceCoverageType === "STATE_BASED") {
        conditional.push(hasArr(pm?.stateCoverage));
      }
      if (pm?.serviceCoverageType === "REGION_BASED") {
        conditional.push(hasArr(pm?.serviceAreas), hasArr(pm?.postcodesServed));
      }
      if (pm?.organisationUserModel === "MULTI_USER") {
        conditional.push(has(pm?.staffAdminName), has(pm?.staffAdminEmail), has(pm?.staffSeatsRequired));
      }

      const all = [...base, ...conditional];
      return pct(all.filter(Boolean).length, all.length);
    }

    default:
      return 0;
  }
}

// Parent edits a child — same logic, just a different userId
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
  if (scalar.name            !== undefined) scalarData.name            = scalar.name;
  if (scalar.email           !== undefined) scalarData.email           = scalar.email.toLowerCase();
  if (scalar.phone           !== undefined) scalarData.phone           = scalar.phone;
  if (scalar.avatarUrl       !== undefined) scalarData.avatarUrl       = scalar.avatarUrl;
  if (scalar.username        !== undefined) scalarData.username        = scalar.username;
  if (scalar.defaultSuburb   !== undefined) scalarData.defaultSuburb   = scalar.defaultSuburb;
  if (scalar.defaultState    !== undefined) scalarData.defaultState    = scalar.defaultState;
  if (scalar.defaultPostcode !== undefined) scalarData.defaultPostcode = scalar.defaultPostcode;

  await prisma.user.update({ where: { id: userId }, data: scalarData });

  // Address: upsert the isDefault address
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

    // Mirror suburb to user.defaultSuburb for quick access
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
      defaultSuburb:   address.suburb,
        defaultState:    address.state ?? null,
        defaultPostcode: address.postcode ?? null,
      },
    });
  }

  return getUserById(userId);
}
