// listing.service.ts — Provider capacity/service listings + SIL/SDA vacancies.
// Phase 1E+: in-app records only (no views/enquiries tracking yet).

import { randomUUID } from "crypto";
import { prisma } from "../../lib/prisma";
import { ApiError, ForbiddenError, BadRequestError } from "../../lib/errors";
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
  isFeatured: true,
  featuredExpiresAt: true,
  featuredQueuePosition: true,
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

  const updated = await (prisma as any).providerListing.update({
    where: { id: listingId },
    data: {
      ...input,
      fundingTypes:  input.fundingTypes  ?? undefined,
      suitableFor:   input.suitableFor   ?? undefined,
      fundingRoutes: input.fundingRoutes ?? undefined,
    },
    select: LISTING_SELECT,
  });

  // Pricing V2 §7.3 item 46 — a Featured listing filled/withdrawn/closed drops
  // out of the queue, and the next one moves up automatically.
  if (existing.isFeatured && input.status && input.status !== "ACTIVE") {
    await (prisma as any).providerListing.update({
      where: { id: listingId },
      data:  { isFeatured: false, featuredSince: null, featuredExpiresAt: null, featuredQueuePosition: null },
    });
    await recomputeFeaturedQueue(existing.suburb, existing.listingCategory);
  }

  return updated;
}

// ─── Featured Listing (Pricing V2 §7.2/§7.3) ───────────────────────────────────
// Paid 30-day SIL/SDA promotion, first-purchased-first-displayed within the
// same suburb + listing category.

const FEATURED_LISTING_PRICE_AUD = 399.0;
const FEATURED_LISTING_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

async function recomputeFeaturedQueue(suburb: string, listingCategory: string): Promise<void> {
  const active = await (prisma as any).providerListing.findMany({
    where: { suburb, listingCategory, isFeatured: true, status: "ACTIVE" },
    orderBy: { featuredSince: "asc" },
  });
  await prisma.$transaction(
    active.map((l: any, i: number) =>
      (prisma as any).providerListing.update({
        where: { id: l.id },
        data:  { featuredQueuePosition: i + 1 },
      }),
    ),
  );
}

export async function purchaseFeaturedListing(providerUserId: string, listingId: string) {
  const listing = await (prisma as any).providerListing.findUnique({ where: { id: listingId } });
  if (!listing || listing.providerUserId !== providerUserId) {
    throw new ApiError(404, "NOT_FOUND", "Listing not found");
  }
  if (listing.providerUserId !== providerUserId) throw new ForbiddenError("Only the owning Provider can feature this listing");
  if (listing.status !== "ACTIVE") throw new BadRequestError("Only an active listing can be featured");
  if (listing.isFeatured) throw new ApiError(409, "CONFLICT", "This listing is already Featured");

  const now = new Date();
  const featuredExpiresAt = new Date(now.getTime() + FEATURED_LISTING_DURATION_MS);

  // Pricing V2 §7.3 item 44 — disclose queue position before payment.
  const existingActive = await (prisma as any).providerListing.count({
    where: { suburb: listing.suburb, listingCategory: listing.listingCategory, isFeatured: true, status: "ACTIVE" },
  });
  const queuePosition = existingActive + 1;
  const mockReceiptRef = `DEV-${randomUUID().toUpperCase()}`;

  const updated = await (prisma as any).providerListing.update({
    where: { id: listingId },
    data: {
      isFeatured: true,
      featuredSince: now,
      featuredExpiresAt,
      featuredQueuePosition: queuePosition,
    },
    select: LISTING_SELECT,
  });

  return { listing: updated, priceAud: FEATURED_LISTING_PRICE_AUD, mockReceiptRef };
}

// ─── Platinum Tile Sponsorship (Pricing V2 §7) ─────────────────────────────────
// Provider-level campaign — promotes the organisation, not one listing.

const PLATINUM_TILE_PRICE_AUD: Record<string, Record<number, number>> = {
  METRO:    { 1: 499.99,  3: 1124.99, 6: 2099.99,  12: 3899.99 },
  STATE:    { 1: 999.99,  3: 2249.99, 6: 4199.99,  12: 7799.99 },
  NATIONAL: { 1: 1499.99, 3: 3374.99, 6: 6299.99,  12: 11699.99 },
};

export async function purchasePlatinumTileCampaign(
  providerUserId: string,
  coverage: string,
  durationMonths: number,
  centreSuburb?: string,
) {
  const tierPrices = PLATINUM_TILE_PRICE_AUD[coverage];
  if (!tierPrices) throw new BadRequestError("Invalid coverage — must be METRO, STATE or NATIONAL");
  const priceAud = tierPrices[durationMonths];
  if (priceAud === undefined) throw new BadRequestError("Invalid duration — must be 1, 3, 6 or 12 months");
  if (coverage === "METRO" && !centreSuburb) {
    throw new BadRequestError("Metro coverage requires a nominated campaign centre suburb");
  }

  const startsAt = new Date();
  const endsAt = new Date(startsAt);
  endsAt.setMonth(endsAt.getMonth() + durationMonths);
  const mockReceiptRef = `DEV-${randomUUID().toUpperCase()}`;

  return (prisma as any).platinumTileCampaign.create({
    data: {
      providerUserId, coverage, centreSuburb: centreSuburb ?? null,
      durationMonths, priceAud, startsAt, endsAt, mockReceiptRef,
    },
  });
}

export async function listPlatinumTileCampaigns(providerUserId: string) {
  return (prisma as any).platinumTileCampaign.findMany({
    where: { providerUserId },
    orderBy: { startsAt: "desc" },
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
