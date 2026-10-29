-- Provider demo service/capacity wizard (additive): extra service listing details.
ALTER TABLE "ProviderListing" ADD COLUMN "serviceDetails" JSONB;
