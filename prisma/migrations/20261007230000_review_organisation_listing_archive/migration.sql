-- SW journey Windows 26 and 45 (additive): Organisation rating on reviews, Archived availability listings.
ALTER TABLE "Review" ADD COLUMN "organisationRating" INTEGER;
ALTER TYPE "AvailabilityListingStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';
