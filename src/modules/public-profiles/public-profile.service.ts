// Public (non-contact) profile of a Support Worker or Provider, for the profile link on response cards,
// the Provider capacity enquiry flow (Provider doc PR-CP02) and Home and Living enquiries.
// Never returns contact details, addresses or documents — only information intended for other users.

import { prisma } from "../../lib/prisma";
import { NotFoundError } from "../../lib/errors";

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
          isPubliclyListed: true,
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
          fundingTypes: true, vacancyCategory: true, listingExpiresAt: true,
        },
      })
    : [];

  const isSelf = viewerUserId === subjectUserId;
  const publiclyListed = !!(user.workerProfile?.isPubliclyListed || user.providerProfile?.isPubliclyListed || listings.length > 0);
  const hasJobRelation = isSelf || publiclyListed ? true : !!(await prisma.jobApplication.findFirst({
    where: {
      OR: [
        { applicantUserId: subjectUserId, job: { postedByUserId: viewerUserId } },
        { applicantUserId: viewerUserId, job: { postedByUserId: subjectUserId } },
      ],
    },
    select: { id: true },
  }));
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
  return { kind: "SUPPORT_WORKER" as const, user: base, profile: workerProfile, listings: [] };
}
