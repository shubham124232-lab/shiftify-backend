-- Provider doc PR-CP01 general service capacity (additive only)
ALTER TABLE "ProviderListing" ADD COLUMN "acceptingStatus" TEXT;
ALTER TABLE "ProviderListing" ADD COLUMN "serviceCategories" JSONB;
ALTER TABLE "ProviderListing" ADD COLUMN "daysAvailable" JSONB;
ALTER TABLE "ProviderListing" ADD COLUMN "responseExpectation" TEXT;
