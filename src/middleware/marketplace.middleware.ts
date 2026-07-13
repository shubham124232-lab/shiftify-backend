// canAccessMarketplace — soft gate (returns what's missing, does NOT hard-block).
// Call this in route handlers to build the "missing requirements" payload the
// client displays as an onboarding banner.

import { prisma } from "../lib/prisma";
import type { UserRole, DocumentType } from "@prisma/client";

export interface MarketplaceCheck {
  canPost: boolean;
  canBrowse: boolean;
  canApply: boolean;
  missing: string[];
}

// Documents that must be SUBMITTED (any status — UPLOADED is enough, does not
// need to be VERIFIED) before a role can post or accept a job. Mirrors the
// `uploadRequired: true` rows in Web/app/(dashboard)/profile/edit/page.tsx's
// ROLE_DOC_ROWS, excluding any row also marked `optional: true` there.
// Participant has no document concept today, so it has no entry here.
export const REQUIRED_DOCS_BY_ROLE: Partial<Record<UserRole, DocumentType[]>> = {
  SUPPORT_WORKER: [
    "POLICE_CHECK", "NDIS_SCREENING", "FIRST_AID", "CPR", "MANUAL_HANDLING",
    "DRIVERS_LICENCE", "PUBLIC_LIABILITY_INSURANCE", "PERSONAL_ACCIDENT_INSURANCE",
    "QUALIFICATION_CERTIFICATE",
  ],
  COORDINATOR: [
    "POLICE_CHECK", "PROFESSIONAL_INDEMNITY", "PUBLIC_LIABILITY_INSURANCE",
    "QUALIFICATION_CERTIFICATE",
  ],
  PROVIDER: [
    "PUBLIC_LIABILITY_INSURANCE", "PROFESSIONAL_INDEMNITY", "NDIS_AUDIT",
  ],
  PLAN_MANAGER: [
    "ABN_CONFIRMATION", "NDIS_REGISTRATION_PROOF", "BUSINESS_REP_PROOF",
    "BUSINESS_ADDRESS_EVIDENCE", "CONTACT_IDENTITY_EVIDENCE", "BANK_FINANCE_EVIDENCE",
  ],
};

const ACRONYM_WORDS = new Set(["NDIS", "WWCC", "CPR", "ABN"]);
function humanizeDocType(docType: string): string {
  return docType
    .split("_")
    .map((w) => (ACRONYM_WORDS.has(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(" ");
}

export async function missingRequiredDocs(userId: string, role: UserRole): Promise<string[]> {
  const required = REQUIRED_DOCS_BY_ROLE[role];
  if (!required || required.length === 0) return [];

  const uploaded = await prisma.document.findMany({
    where:  { userId, docType: { in: required } },
    select: { docType: true },
  });
  const uploadedTypes = new Set(uploaded.map((d) => d.docType));

  return required
    .filter((t) => !uploadedTypes.has(t))
    .map((t) => `Upload your ${humanizeDocType(t)} (Documents page)`);
}

export async function canAccessMarketplace(
  userId: string,
  activeRole: UserRole,
): Promise<MarketplaceCheck> {
  // Fetch only the base fields every role needs — no profile joins yet.
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, status: true, phoneVerified: true, name: true, defaultSuburb: true },
  });

  if (!user) return { canPost: false, canBrowse: false, canApply: false, missing: ["User not found"] };

  const missing: string[] = [];
  const hasSuburb = !!user.defaultSuburb;

  switch (activeRole) {
    case "PARTICIPANT": {
      if (!user.phoneVerified) missing.push("Verify your phone number");
      if (!user.name?.trim())  missing.push("Add your name");
      if (!hasSuburb)          missing.push("Add your suburb (Profile Step 1)");
      missing.push(...(await missingRequiredDocs(userId, activeRole)));
      return { canPost: missing.length === 0, canBrowse: true, canApply: false, missing };
    }

    case "COORDINATOR": {
      // Coordinator needs its own profile — one extra indexed lookup.
      const coordinatorProfile = await prisma.coordinatorProfile.findUnique({ where: { userId } });
      if (!user.phoneVerified)              missing.push("Verify your phone number");
      if (!coordinatorProfile?.roleType)    missing.push("Set your coordinator role type (Profile Step 1)");
      if (user.status === "PENDING")        missing.push("Complete plan selection");
      missing.push(...(await missingRequiredDocs(userId, activeRole)));
      return { canPost: missing.length === 0, canBrowse: true, canApply: false, missing };
    }

    case "PROVIDER": {
      // Provider needs its own profile — one extra indexed lookup.
      const providerProfile = await prisma.providerProfile.findUnique({ where: { userId } });
      if (!user.phoneVerified)            missing.push("Verify your phone number");
      if (user.status === "PENDING")      missing.push("Activate a subscription (Basic or above)");
      if (!providerProfile?.businessName) missing.push("Add your business name (Profile Step 1)");
      if (!providerProfile?.abn)          missing.push("Add your ABN (Profile Step 1)");
      if (providerProfile?.ndisRegistered && !providerProfile?.ndisProviderNumber)
        missing.push("Add your NDIS provider number (Profile Step 1)");
      missing.push(...(await missingRequiredDocs(userId, activeRole)));
      return { canPost: missing.length === 0, canBrowse: true, canApply: missing.length === 0, missing };
    }

    case "PLAN_MANAGER": {
      if (!user.phoneVerified)       missing.push("Verify your phone number");
      if (user.status === "PENDING") missing.push("Activate a subscription");
      return { canPost: false, canBrowse: missing.length === 0, canApply: false, missing };
    }

    case "SUPPORT_WORKER": {
      // Worker needs its own profile — one extra indexed lookup.
      const wp = await prisma.workerProfile.findUnique({ where: { userId } });
      const browseMissing: string[] = [];
      const applyMissing:  string[] = [];

      if (!hasSuburb && !wp?.serviceAreas)
        browseMissing.push("Add your suburb or service areas (Profile Step 1)");
      if (!wp?.rightToWork)
        browseMissing.push("Set your right to work (Profile Step 1)");

      if (browseMissing.length === 0) {
        if (!wp?.servicesOffered || (wp.servicesOffered as string[]).length === 0)
          applyMissing.push("Add services you offer (Profile Step 4)");
        if (!wp?.experienceLevel)
          applyMissing.push("Set your experience level (Profile Step 4)");
        applyMissing.push(...(await missingRequiredDocs(userId, activeRole)));
      }

      const allMissing = [...browseMissing, ...applyMissing];
      return {
        canPost:   false,
        canBrowse: browseMissing.length === 0,
        canApply:  browseMissing.length === 0 && applyMissing.length === 0,
        missing:   allMissing,
      };
    }

    default:
      return { canPost: false, canBrowse: false, canApply: false, missing: [] };
  }
}
