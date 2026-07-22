// listing.service.ts — Provider capacity/service listings + SIL/SDA vacancies.
// Phase 1E+: in-app records only (no views/enquiries tracking yet).

import { prisma } from "../../lib/prisma";
import { ApiError } from "../../lib/errors";
import { subscriptionGated } from "../subscriptions/subscription.service";
import type { CreateListingInput, ListListingsQuery, UpdateListingInput } from "../../validators/listing.schema";
import type { UserRole } from "@prisma/client";

// Per-tier active-listing caps, matching the "Up to N active job listings"
// copy advertised per plan (Backend/prisma/seed.ts, Web/lib/constants/plans.ts).
// A Provider can hold Basic (required base) plus Growth and/or Speed add-ons
// simultaneously — the cap applied is the highest one they're entitled to.
const LISTING_CAP_BY_PLAN_KEY: Record<string, number> = {
  PROVIDER_BASIC:  20,
  PROVIDER_GROWTH: 40,
  PROVIDER_SPEED:  10,
};
const DEFAULT_LISTING_CAP = 20;

async function getListingCap(providerUserId: string): Promise<number> {
  const subs = await (prisma as any).userSubscription.findMany({
    where:   { userId: providerUserId, status: "ACTIVE", plan: { role: "PROVIDER" } },
    include: { plan: { select: { key: true } } },
  });
  const caps = subs
    .map((s: any) => LISTING_CAP_BY_PLAN_KEY[s.plan?.key as string])
    .filter((n: number | undefined): n is number => typeof n === "number");
  return caps.length > 0 ? Math.max(...caps) : DEFAULT_LISTING_CAP;
}

const LISTING_SELECT = {
  id: true,
  listingCategory: true,
  status: true,
  title: true,
  description: true,
  suburb: true,
  state: true,
  postcode: true,
  listingType: true,
  serviceCategory: true,
  serviceMode: true,
  fundingTypes: true,
  vacancyCategory: true,
  propertyType: true,
  vacancyCount: true,
  supportModel: true,
  suitableFor: true,
  fundingRoutes: true,
  urgency: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function createListing(providerUserId: string, activeRole: UserRole, input: CreateListingInput) {
  if (!(await subscriptionGated(providerUserId, activeRole))) {
    throw new ApiError(
      403,
      "SUBSCRIPTION_REQUIRED",
      "An active subscription is required to create listings. Choose a plan on the Subscription page to continue.",
    );
  }

  const activeListingLimit = await getListingCap(providerUserId);

  const activeCount = await (prisma as any).providerListing.count({
    where: { providerUserId, status: "ACTIVE" },
  });
  if (activeCount >= activeListingLimit) {
    throw new ApiError(
      403,
      "SUBSCRIPTION_LIMIT",
      `Active listing limit reached (${activeListingLimit}). Pause or close an existing listing to create a new one.`,
    );
  }

  // acknowledgement is a form-only declaration — not persisted.
  const { acknowledgement: _ack, ...data } = input;

  return (prisma as any).providerListing.create({
    data: {
      providerUserId,
      ...data,
      fundingTypes:  data.fundingTypes ?? undefined,
      suitableFor:   data.suitableFor ?? undefined,
      fundingRoutes: data.fundingRoutes ?? undefined,
    },
    select: LISTING_SELECT,
  });
}

export async function updateListing(providerUserId: string, listingId: string, input: UpdateListingInput) {
  const existing = await (prisma as any).providerListing.findUnique({ where: { id: listingId } });
  if (!existing || existing.providerUserId !== providerUserId) {
    throw new ApiError(404, "NOT_FOUND", "Listing not found");
  }

  return (prisma as any).providerListing.update({
    where: { id: listingId },
    data: {
      ...input,
      fundingTypes:  input.fundingTypes  ?? undefined,
      suitableFor:   input.suitableFor   ?? undefined,
      fundingRoutes: input.fundingRoutes ?? undefined,
    },
    select: LISTING_SELECT,
  });
}

export async function listMyListings(providerUserId: string, query: ListListingsQuery) {
  return (prisma as any).providerListing.findMany({
    where: {
      providerUserId,
      ...(query.category ? { listingCategory: query.category } : {}),
      ...(query.status ? { status: query.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: LISTING_SELECT,
  });
}
