// listing.service.ts — Provider capacity/service listings + SIL/SDA vacancies.
// Phase 1E+: in-app records only (no views/enquiries tracking yet).

import { prisma } from "../../lib/prisma";
import type { CreateListingInput, ListListingsQuery } from "../../validators/listing.schema";

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

export async function createListing(providerUserId: string, input: CreateListingInput) {
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
