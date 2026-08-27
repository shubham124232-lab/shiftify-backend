import { prisma } from "../../lib/prisma";
import { NotFoundError, ForbiddenError } from "../../lib/errors";
import type { CreateAvailabilityListingInput, UpdateAvailabilityListingInput } from "../../validators/availability-listing.schema";

export async function createAvailabilityListing(workerUserId: string, data: CreateAvailabilityListingInput) {
  return prisma.availabilityListing.create({
    data: { workerUserId, ...data },
  });
}

// SW doc Window 26 "Manage availability" — every listing the worker has posted,
// across all lifecycle states, newest first.
export async function listMyAvailabilityListings(workerUserId: string) {
  return prisma.availabilityListing.findMany({
    where: { workerUserId },
    orderBy: { createdAt: "desc" },
  });
}

async function requireOwnedListing(workerUserId: string, id: string) {
  const existing = await prisma.availabilityListing.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Availability listing not found");
  if (existing.workerUserId !== workerUserId) throw new ForbiddenError("Not your availability listing");
  return existing;
}

export async function updateAvailabilityListing(workerUserId: string, id: string, data: UpdateAvailabilityListingInput) {
  await requireOwnedListing(workerUserId, id);
  return prisma.availabilityListing.update({ where: { id }, data });
}

export async function deleteAvailabilityListing(workerUserId: string, id: string) {
  await requireOwnedListing(workerUserId, id);
  await prisma.availabilityListing.delete({ where: { id } });
}

// SW doc Windows 24-25 browse-side — requesters looking for a generally
// available worker rather than posting a specific job. ACTIVE + not-expired only.
export async function browseAvailabilityListings(filters: { category?: string; suburb?: string; state?: string }) {
  const now = new Date();
  return prisma.availabilityListing.findMany({
    where: {
      status: "ACTIVE",
      visibility: "ALL",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      ...(filters.suburb ? { suburb: { contains: filters.suburb, mode: "insensitive" } } : {}),
      ...(filters.state ? { state: filters.state } : {}),
      ...(filters.category ? { services: { array_contains: filters.category } } : {}),
    },
    include: {
      worker: { select: { id: true, name: true, avatarUrl: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
