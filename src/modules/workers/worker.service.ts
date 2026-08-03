import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/errors";
import type { BrowseWorkersFiltersInput } from "../../validators/worker-browse.schema";
import { cancellationRate } from "../jobs/job-scoring";
import { hasActiveAddOn } from "../subscriptions/subscription.service";
import type { UserRole } from "@prisma/client";

// Coordinator/Provider need the Growth add-on to browse the support worker
// list (pricing_plans.md: "Access to support worker list"). Participants and
// Plan Managers are not gated — Growth isn't sold to those roles.
const GROWTH_PLAN_KEY: Partial<Record<UserRole, string>> = {
  COORDINATOR: "COORDINATOR_GROWTH",
  PROVIDER:    "PROVIDER_GROWTH",
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

  const where: Record<string, unknown> = { isPubliclyListed: true };
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
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
    }),
    prisma.workerProfile.count({ where }),
  ]);

  const withCancellationRate = workers.map((w) => ({
    ...w,
    cancellationRate: cancellationRate(w.totalCompleted, w.totalCancelledByWorker),
  }));

  return { workers: withCancellationRate, total, page, limit };
}
