-- Migration: Add ProviderAvailability table
-- Run this directly against your database if prisma migrate is not available

CREATE TABLE IF NOT EXISTS "ProviderAvailability" (
  "id"                TEXT         NOT NULL DEFAULT gen_random_uuid(),
  "providerProfileId" TEXT         NOT NULL,
  "dayOfWeek"         TEXT         NOT NULL,
  "startTime"         TEXT         NOT NULL,
  "endTime"           TEXT         NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProviderAvailability_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProviderAvailability_providerProfileId_fkey"
    FOREIGN KEY ("providerProfileId")
    REFERENCES "ProviderProfile"("id")
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ProviderAvailability_providerProfileId_dayOfWeek_idx"
  ON "ProviderAvailability"("providerProfileId", "dayOfWeek");
