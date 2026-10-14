-- Provider doc P15 (additive): Branch contact and service radius.
ALTER TABLE "ProviderBranch" ADD COLUMN "contact" TEXT,
ADD COLUMN "serviceRadiusKm" INTEGER;
