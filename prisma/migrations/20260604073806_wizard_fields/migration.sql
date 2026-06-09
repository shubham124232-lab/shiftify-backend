-- Wizard fields: ProviderAvailability + WorkerProfile compliance fields + CoordinatorProfile additions

CREATE TABLE "ProviderAvailability" (
  "id"                TEXT         NOT NULL DEFAULT gen_random_uuid(),
  "providerProfileId" TEXT         NOT NULL,
  "dayOfWeek"         TEXT         NOT NULL,
  "startTime"         TEXT         NOT NULL,
  "endTime"           TEXT         NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderAvailability_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProviderAvailability_providerProfileId_fkey"
    FOREIGN KEY ("providerProfileId") REFERENCES "ProviderProfile"("id") ON DELETE CASCADE
);

CREATE INDEX "ProviderAvailability_providerProfileId_dayOfWeek_idx"
  ON "ProviderAvailability"("providerProfileId", "dayOfWeek");

ALTER TABLE "WorkerProfile"
  ADD COLUMN "publicLiabilityInsurance" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "personalAccidentInsurance" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "vehicleDetails" JSONB,
  ADD COLUMN "references" JSONB,
  ADD COLUMN "preferences" TEXT;

ALTER TABLE "CoordinatorProfile"
  ADD COLUMN "languages" JSONB,
  ADD COLUMN "fundingTypeCompatibility" JSONB,
  ADD COLUMN "seekingPlanManager" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ProviderProfile"
  ADD COLUMN "availability" TEXT;
