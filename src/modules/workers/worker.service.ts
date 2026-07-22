import { prisma } from "../../lib/prisma";
import type { BrowseWorkersFiltersInput } from "../../validators/worker-browse.schema";
import { cancellationRate } from "../jobs/job-scoring";

// GET /workers/available — public "Post My Availability" browse feed.
// Only surfaces workers who have opted in via isPubliclyListed.
export async function browseAvailableWorkers(filters: BrowseWorkersFiltersInput) {
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
