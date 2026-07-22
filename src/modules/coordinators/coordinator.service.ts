import { prisma } from "../../lib/prisma";
import type { BrowseCoordinatorsFiltersInput } from "../../validators/coordinator-browse.schema";

// GET /coordinators/available — public browse feed.
// Only surfaces Coordinators who have opted in via isPubliclyListed.
export async function browseCoordinators(filters: BrowseCoordinatorsFiltersInput) {
  const { search, page, limit } = filters;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { isPubliclyListed: true };
  if (search) where.organisationName = { contains: search, mode: "insensitive" };

  const [coordinators, total] = await Promise.all([
    prisma.coordinatorProfile.findMany({
      where,
      skip,
      take: limit,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        userId: true,
        organisationName: true,
        roleType: true,
        bio: true,
        profilePhoto: true,
        hourlyRate: true,
        showRatePublicly: true,
        travelCharges: true,
        serviceAreas: true,
        serviceRadius: true,
        serviceMode: true,
        currentCapacityStatus: true,
        availabilityType: true,
        supportCoordinationLevel: true,
        servicesOfferedBeyondCoordination: true,
        seekingPlanManager: true,
        averageRating: true,
        totalRatings: true,
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
    }),
    prisma.coordinatorProfile.count({ where }),
  ]);

  // Hide the rate when the coordinator has opted out of showing it publicly.
  const shaped = coordinators.map(({ showRatePublicly, hourlyRate, ...rest }) => ({
    ...rest,
    hourlyRate: showRatePublicly ? hourlyRate : null,
  }));

  return { coordinators: shaped, total, page, limit };
}
