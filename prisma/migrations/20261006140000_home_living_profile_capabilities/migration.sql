
-- Provider doc PR-HL02 Home and Living vacancy details (additive only)
ALTER TABLE "ProviderListing" ADD COLUMN "housingDetails" JSONB;

-- Provider doc PR-PF01 business profile capabilities (additive only)
ALTER TABLE "ProviderProfile" ADD COLUMN "languages" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ProviderProfile" ADD COLUMN "accessibilityCapabilities" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ProviderProfile" ADD COLUMN "culturalCapabilities" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ProviderProfile" ADD COLUMN "enquiryPreference" TEXT;
