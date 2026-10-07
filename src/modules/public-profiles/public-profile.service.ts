// Public (non-contact) profile of a Support Worker or Provider, for the profile link on response cards,
// the Provider capacity enquiry flow (Provider doc PR-CP02) and Home and Living enquiries.
// Never returns contact details, addresses or documents — only information intended for other users.

import { prisma } from "../../lib/prisma";
import { NotFoundError } from "../../lib/errors";
import { toFirstNameInitial, maskLocation } from "../workers/worker-visibility";

export async function getPublicProfile(viewerUserId: string, subjectUserId: string) {
  const user = await prisma.user.findUnique({
    where: { id: subjectUserId },
    select: {
      id: true, name: true, avatarUrl: true, phoneVerified: true, status: true,
      blocksMade: { where: { blockedUserId: viewerUserId, hideProfile: true }, select: { id: true } },
      workerProfile: {
        select: {
          introSummary: true, servicesOffered: true, experienceLevel: true, suburb: true, state: true,
          rating: true, totalReviews: true, ageGroupsSupported: true, communicationSupportSkills: true,
          isPubliclyListed: true, visibleTo: true, nameDisplayMode: true, locationDisplay: true, postcode: true,
        },
      },
      providerProfile: {
        select: {
          businessName: true, businessDescription: true, ndisRegistered: true, coreServices: true, serviceAreas: true,
          stateCoverage: true, languages: true, accessibilityCapabilities: true, culturalCapabilities: true,
          enquiryPreference: true, logoUrl: true, averageRating: true, totalRatings: true, isPubliclyListed: true,
          currentCapacityStatus: true,
        },
      },
    },
  });
  if (!user || user.blocksMade.length > 0) throw new NotFoundError("Profile not found");

  const listings = user.providerProfile
    ? await prisma.providerListing.findMany({
        where: { providerUserId: subjectUserId, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, listingCategory: true, title: true, description: true, suburb: true, state: true,
          acceptingStatus: true, serviceCategories: true, daysAvailable: true, responseExpectation: true,
          fundingTypes: true, vacancyCategory: true, listingExpiresAt: true, housingDetails: true,
        },
      })
    : [];

  const isSelf = viewerUserId === subjectUserId;
  // A worker who paused their profile (Window 14) is not discoverable; only people they are already working with can open it.
  const workerListed = !!user.workerProfile?.isPubliclyListed && user.workerProfile.visibleTo !== "PAUSED";
  const publiclyListed = !!(workerListed || user.providerProfile?.isPubliclyListed || listings.length > 0);
  const hasRelation = async () => !!(await prisma.jobApplication.findFirst({
    where: {
      OR: [
        { applicantUserId: subjectUserId, job: { postedByUserId: viewerUserId } },
        { applicantUserId: viewerUserId, job: { postedByUserId: subjectUserId } },
      ],
    },
    select: { id: true },
  }));
  const hasJobRelation = isSelf || publiclyListed ? true : await hasRelation();
  if (!hasJobRelation) throw new NotFoundError("This profile isn't available");

  const { blocksMade: _b, status: _s, workerProfile, providerProfile, ...base } = user;
  if (providerProfile) {
    return {
      kind: "PROVIDER" as const,
      user: base,
      profile: {
        ...providerProfile,
        verification: providerProfile.ndisRegistered ? "NDIS Registered Provider" : "Unregistered Provider — Business Verified",
      },
      listings,
    };
  }
  // Before any job relationship exists, the worker's own name and location display choices apply.
  const preConnect = !isSelf && !(await hasRelation());
  const { visibleTo: _v, nameDisplayMode, locationDisplay, postcode, ...wp } = workerProfile ?? ({} as NonNullable<typeof workerProfile>);
  const shown = workerProfile && preConnect
    ? { ...wp, ...maskLocation({ suburb: wp.suburb ?? null, state: wp.state ?? null, postcode, locationDisplay }) }
    : workerProfile ? wp : workerProfile;
  const shownBase = preConnect && nameDisplayMode === "FIRST_NAME_INITIAL" ? { ...base, name: toFirstNameInitial(base.name) } : base;
  return { kind: "SUPPORT_WORKER" as const, user: shownBase, profile: shown, listings: [] };
}
