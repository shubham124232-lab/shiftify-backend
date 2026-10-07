import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/errors";
import type { BrowseWorkersFiltersInput } from "../../validators/worker-browse.schema";
import { cancellationRate } from "../jobs/job-scoring";
import { hasActiveAddOn } from "../subscriptions/subscription.service";
import type { UserRole } from "@prisma/client";

// Coordinator needs the Growth add-on to browse the support worker list
// (Pricing V2 §3.6). Provider is not gated — worker browsing is included in
// every paid Provider Organisation plan (§5.2 item 30), no separate add-on.
// Participants and Plan Managers are not gated either — Growth isn't sold to those roles.
const GROWTH_PLAN_KEY: Partial<Record<UserRole, string>> = {
  COORDINATOR: "COORDINATOR_GROWTH",
};

// GET /workers/available — public "Post My Availability" browse feed.
// Only surfaces workers who have opted in via isPubliclyListed.
export async function browseAvailableWorkers(
  filters: BrowseWorkersFiltersInput,
  userId: string,
  activeRole: UserRole,
) {
  const requiredAddOn = GROWTH_PLAN_KEY[activeRole];
  if (requiredAddOn && !(await hasActiveAddOn(userId, activeRole, requiredAddOn))) {
    throw new ApiError(
      403,
      "SUBSCRIPTION_REQUIRED",
      "The Growth add-on is required to browse the support worker list. Choose a plan on the Subscription page to continue.",
    );
  }

  const { suburb, state, page, limit } = filters;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {
    isPubliclyListed: true,
    // SW doc Window 44 — a worker who hid their profile from this viewer is
    // excluded from their browse results entirely, not just contact-blocked.
    user: { blocksMade: { none: { blockedUserId: userId, hideProfile: true } } },
  };
  if (suburb) where.suburb = { contains: suburb, mode: "insensitive" };
  if (state)  where.state  = { contains: state,  mode: "insensitive" };

  const [workers, total] = await Promise.all([
    prisma.workerProfile.findMany({
      where,
      skip,
      take: limit,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        userId: true,
        suburb: true,
        state: true,
        listingHeadline: true,
        bio: true,
        rating: true,
        totalReviews: true,
        hourlyRate: true,
        hourlyRateType: true,
        experienceLevel: true,
        servicesOffered: true,
        subServices: true,
        availabilityType: true,
        emergencyAvailability: true,
        acceptsSleepoverShifts: true,
        acceptsActiveOvernightShifts: true,
        isAvailableNow: true,
        totalCompleted: true,
        totalCancelledByWorker: true,
        nameDisplayMode: true,
        rateDisplayMode: true,
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
    }),
    prisma.workerProfile.count({ where }),
  ]);

  // SW doc §2-3 Window 14 — this listing is a pre-Connect discovery surface
  // (no interaction with the browsing user exists yet for any worker here), so
  // it's exactly where the worker's own display-mode preferences apply.
  const masked = workers.map(({ nameDisplayMode, rateDisplayMode, hourlyRate, user, ...w }) => ({
    ...w,
    hourlyRate: rateDisplayMode === "PUBLIC" || rateDisplayMode == null ? hourlyRate : null,
    user: {
      ...user,
      name: nameDisplayMode === "FIRST_NAME_INITIAL" ? toFirstNameInitial(user.name) : user.name,
    },
    cancellationRate: cancellationRate(w.totalCompleted, w.totalCancelledByWorker),
  }));

  return { workers: masked, total, page, limit };
}

function toFirstNameInitial(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}
