// canAccessMarketplace — soft gate (returns what's missing, does NOT hard-block).
// Call this in route handlers to build the "missing requirements" payload the
// client displays as an onboarding banner.

import { prisma } from "../lib/prisma";
import type { UserRole } from "@prisma/client";

export interface MarketplaceCheck {
  canPost: boolean;
  canBrowse: boolean;
  canApply: boolean;
  missing: string[];
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
      return { canPost: missing.length === 0, canBrowse: true, canApply: false, missing };
    }

    case "COORDINATOR": {
      // Coordinator needs its own profile — one extra indexed lookup.
      const coordinatorProfile = await prisma.coordinatorProfile.findUnique({ where: { userId } });
      if (!user.phoneVerified)              missing.push("Verify your phone number");
      if (!coordinatorProfile?.roleType)    missing.push("Set your coordinator role type (Profile Step 1)");
      if (user.status === "PENDING")        missing.push("Complete plan selection");
      return { canPost: missing.length === 0, canBrowse: true, canApply: false, missing };
    }

    case "PROVIDER": {
      if (!user.phoneVerified)       missing.push("Verify your phone number");
      if (user.status === "PENDING") missing.push("Activate a subscription (Basic or above)");
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
