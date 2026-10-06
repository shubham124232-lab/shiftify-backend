// listing.service.ts — Provider capacity/service listings + SIL/SDA vacancies.
// Phase 1E+: in-app records only (no views/enquiries tracking yet).

import { randomUUID } from "crypto";
import { prisma } from "../../lib/prisma";
import { ApiError, ForbiddenError, BadRequestError } from "../../lib/errors";
import { subscriptionGated, getActiveBasePlanKey } from "../subscriptions/subscription.service";
import type { CreateListingInput, ListListingsQuery, UpdateListingInput } from "../../validators/listing.schema";
import type { UserRole } from "@prisma/client";


const LISTING_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const RESTRICTED_VACANCY_CATEGORIES: string[] = ["SIL", "SDA", "SIL_SDA"];

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
  acceptingStatus: true,
  serviceCategories: true,
  daysAvailable: true,
  responseExpectation: true,
  vacancyCategory: true,
  propertyType: true,
  vacancyCount: true,
  supportModel: true,
  suitableFor: true,
  fundingRoutes: true,
  urgency: true,
  housingDetails: true,
  createdAt: true,
  updatedAt: true,
  isFeatured: true,
  featuredExpiresAt: true,
  featuredQueuePosition: true,
  standardPaidAt: true,
  listingExpiresAt: true,
} as const;

// PR-CP01 — the headline answer (accepting new Participants) also feeds the Provider profile.
const CAPACITY_BY_ACCEPTING = { YES: "OPEN", LIMITED: "LIMITED", NO: "FULL" } as const;
async function syncProfileCapacity(providerUserId: string, accepting: "YES" | "LIMITED" | "NO" | undefined): Promise<void> {
  if (!accepting) return;
  await prisma.providerProfile.updateMany({
    where: { userId: providerUserId },
    data: { currentCapacityStatus: CAPACITY_BY_ACCEPTING[accepting] },
  });
}

export async function createListing(providerUserId: string, activeRole: UserRole, input: CreateListingInput) {
  if (!(await subscriptionGated(providerUserId, activeRole))) {
    throw new ApiError(
      403,
      "SUBSCRIPTION_REQUIRED",
      "An active subscription is required to create listings. Choose a plan on the Subscription page to continue.",
    );
  }

  // Pricing V2 §5.2 item 26 — unlimited active listings are included in every
  // paid Provider Organisation plan; no per-tier cap.

  // acknowledgement is a form-only declaration — not persisted.
  const { acknowledgement: _ack, saveAsDraft, ...data } = input;

  // Pricing V2 §7.2 — a housing/vacancy listing is the fixed 30-day Standard
  // package; it expires automatically unless renewed. Service listings are not priced.
  const isHousing = data.listingCategory === "HOUSING";
  const now = new Date();

  // Provider doc PR-HL03 — SIL/SDA listings are restricted: an unregistered Provider can save a draft
  // but cannot publish. A draft carries no package, dates or payment.
  const restricted = isHousing && RESTRICTED_VACANCY_CATEGORIES.includes(data.vacancyCategory ?? "");
  const registered = restricted
    ? !!(await prisma.providerProfile.findUnique({ where: { userId: providerUserId }, select: { ndisRegistered: true } }))?.ndisRegistered
    : true;
  const asDraft = isHousing && (!!saveAsDraft || !registered);

  const listing = await (prisma as any).providerListing.create({
    data: {
      providerUserId,
      ...data,
      fundingTypes:  data.fundingTypes ?? undefined,
      serviceCategories: data.serviceCategories ?? undefined,
      daysAvailable: data.daysAvailable ?? undefined,
      suitableFor:   data.suitableFor ?? undefined,
      fundingRoutes: data.fundingRoutes ?? undefined,
      ...(asDraft ? { status: "DRAFT" } : {}),
      ...(isHousing && !asDraft
        ? {
            standardPaidAt: now,
            listingExpiresAt: new Date(now.getTime() + LISTING_DURATION_MS),
            packageReceiptRef: `DEV-${randomUUID().toUpperCase()}`,
          }
        : {}),
    },
    select: LISTING_SELECT,
  });
  await syncProfileCapacity(providerUserId, data.acceptingStatus);
  if (asDraft) return { ...listing, draft: true, registrationBlocked: !registered };
  return isHousing ? { ...listing, packagePriceAud: STANDARD_LISTING_PRICE_AUD } : listing;
}

export async function updateListing(providerUserId: string, listingId: string, input: UpdateListingInput) {
  const existing = await (prisma as any).providerListing.findUnique({ where: { id: listingId } });
  if (!existing || existing.providerUserId !== providerUserId) {
    throw new ApiError(404, "NOT_FOUND", "Listing not found");
  }

  // Publishing a saved Home and Living draft re-runs the registration gate and starts the 30-day package.
  let publishPackage = {};
  if (existing.status === "DRAFT" && input.status === "ACTIVE" && existing.listingCategory === "HOUSING") {
    if (RESTRICTED_VACANCY_CATEGORIES.includes(existing.vacancyCategory ?? "")) {
      const reg = await prisma.providerProfile.findUnique({ where: { userId: providerUserId }, select: { ndisRegistered: true } });
      if (!reg?.ndisRegistered) {
        throw new ApiError(403, "NOT_ELIGIBLE", "SIL and SDA listings need a verified NDIS registration. Your draft is saved; publish it once your registration is verified.");
      }
    }
    const now = new Date();
    publishPackage = {
      standardPaidAt: now,
      listingExpiresAt: new Date(now.getTime() + LISTING_DURATION_MS),
      packageReceiptRef: `DEV-${randomUUID().toUpperCase()}`,
    };
  }

  const updated = await (prisma as any).providerListing.update({
    where: { id: listingId },
    data: {
      ...input,
      ...publishPackage,
      fundingTypes:  input.fundingTypes  ?? undefined,
      serviceCategories: input.serviceCategories ?? undefined,
      daysAvailable: input.daysAvailable ?? undefined,
      suitableFor:   input.suitableFor   ?? undefined,
      fundingRoutes: input.fundingRoutes ?? undefined,
    },
    select: LISTING_SELECT,
  });
  await syncProfileCapacity(providerUserId, input.acceptingStatus);

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

const STANDARD_LISTING_PRICE_AUD = 199.0;
const FEATURED_LISTING_PRICE_AUD = 399.0;
const FEATURED_LISTING_DURATION_MS = LISTING_DURATION_MS;

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

// Pricing V2 §7.3 item 44 — disclose the queue position before the buyer pays.
export async function previewFeaturedListing(providerUserId: string, listingId: string) {
  const listing = await (prisma as any).providerListing.findUnique({ where: { id: listingId } });
  if (!listing || listing.providerUserId !== providerUserId) {
    throw new ApiError(404, "NOT_FOUND", "Listing not found");
  }
  const existingActive = await (prisma as any).providerListing.count({
    where: { suburb: listing.suburb, listingCategory: listing.listingCategory, isFeatured: true, status: "ACTIVE" },
  });
  return { queuePosition: existingActive + 1, priceAud: FEATURED_LISTING_PRICE_AUD, durationDays: 30 };
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

// Pricing V2 §7.1 item 37 — three sponsored positions per defined market.
const PLATINUM_POSITIONS_PER_MARKET = 3;

export async function purchasePlatinumTileCampaign(
  providerUserId: string,
  coverage: string,
  durationMonths: number,
  centreSuburb?: string,
  marketState?: string,
) {
  const tierPrices = PLATINUM_TILE_PRICE_AUD[coverage];
  if (!tierPrices) throw new BadRequestError("Invalid coverage — must be METRO, STATE or NATIONAL");
  const priceAud = tierPrices[durationMonths];
  if (priceAud === undefined) throw new BadRequestError("Invalid duration — must be 1, 3, 6 or 12 months");
  if (coverage === "METRO" && !centreSuburb) {
    throw new BadRequestError("Metro coverage requires a nominated campaign centre suburb");
  }

  if (coverage === "STATE" && !marketState) {
    throw new BadRequestError("State coverage requires a nominated state or territory");
  }

  // Item 40 — requires an active paid Provider subscription.
  const planKey = await getActiveBasePlanKey(providerUserId, "PROVIDER");
  if (!planKey || planKey.endsWith("_FREE")) {
    throw new ApiError(403, "SUBSCRIPTION_REQUIRED", "Platinum Tile Sponsorship requires an active paid Provider subscription.");
  }

  const startsAt = new Date();

  // Item 37 — only three sponsored positions per market at a time.
  const marketWhere =
    coverage === "METRO"    ? { coverage, centreSuburb: { equals: centreSuburb, mode: "insensitive" as const } }
    : coverage === "STATE"  ? { coverage, marketState: { equals: marketState, mode: "insensitive" as const } }
    :                         { coverage };
  const live = await (prisma as any).platinumTileCampaign.findMany({
    where: { ...marketWhere, endsAt: { gt: startsAt } },
    orderBy: { endsAt: "asc" },
    select: { endsAt: true },
  });
  if (live.length >= PLATINUM_POSITIONS_PER_MARKET) {
    throw new ApiError(
      409,
      "CONFLICT",
      `All ${PLATINUM_POSITIONS_PER_MARKET} sponsored positions for this market are taken. The next one opens ${new Date(live[0].endsAt).toLocaleDateString("en-AU")}.`,
    );
  }

  const endsAt = new Date(startsAt);
  endsAt.setMonth(endsAt.getMonth() + durationMonths);
  const mockReceiptRef = `DEV-${randomUUID().toUpperCase()}`;

  return (prisma as any).platinumTileCampaign.create({
    data: {
      providerUserId, coverage, centreSuburb: centreSuburb ?? null, marketState: marketState ?? null,
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
