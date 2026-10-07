-- SW journey Windows 9-14: additive profile fields and two document types.
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'MEDICATION_COMPETENCY';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'PHOTO_ID';

ALTER TABLE "WorkerProfile"
  ADD COLUMN "visibleTo" TEXT,
  ADD COLUMN "locationDisplay" TEXT,
  ADD COLUMN "employmentDetails" JSONB,
  ADD COLUMN "workPreferences" JSONB;
