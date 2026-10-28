// Anonymous homepage data. Counts and suburb-level housing only — no addresses,
// provider identities or participant details leave this module.
import { prisma } from "../../lib/prisma";

const LANES = ["RAPID", "URGENT", "LAST_MINUTE", "ROUTINE"] as const;

export async function getPublicHome() {
  const now = new Date();
  const openWhere = {
    status: "OPEN" as const,
    scheduledStartAt: { gte: now },
    OR: [{ visibilityTarget: "ALL" }, { visibilityTarget: null }],
  };
  const housingWhere = {
    listingCategory: "HOUSING",
    status: "ACTIVE",
    OR: [{ listingExpiresAt: null }, { listingExpiresAt: { gt: now } }],
  };

  const [laneRows, housingCount, housing, platinumCount] = await Promise.all([
    prisma.supportRequest.groupBy({ by: ["urgency"], where: openWhere as never, _count: { _all: true } }),
    prisma.providerListing.count({ where: housingWhere }),
    prisma.providerListing.findMany({
      where: housingWhere,
      orderBy: [{ isFeatured: "desc" }, { featuredQueuePosition: "asc" }, { createdAt: "desc" }],
      take: 3,
      select: {
        id: true, title: true, suburb: true, state: true, vacancyCategory: true,
        vacancyCount: true, isFeatured: true,
      },
    }),
    prisma.platinumTileCampaign.count({ where: { startsAt: { lte: now }, endsAt: { gt: now } } }),
  ]);

  const lanes: Record<string, number> = { RAPID: 0, URGENT: 0, LAST_MINUTE: 0, ROUTINE: 0 };
  for (const r of laneRows) if ((LANES as readonly string[]).includes(r.urgency)) lanes[r.urgency] = r._count._all;

  return {
    lanes,
    totalOpen: Object.values(lanes).reduce((a, b) => a + b, 0),
    housing: { liveCount: housingCount, featured: housing },
    platinumActive: platinumCount,
  };
}
