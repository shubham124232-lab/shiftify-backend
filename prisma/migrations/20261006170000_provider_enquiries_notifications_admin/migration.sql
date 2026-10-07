-- Provider doc PR-CP02/PR-M02 enquiries, PR-V01 business address, PR-W02 access, PR-N02 notification controls (additive only)
ALTER TABLE "DirectInquiry" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'DIRECT';
ALTER TABLE "DirectInquiry" ADD COLUMN "listingId" TEXT;
ALTER TABLE "DirectInquiry" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'NEW';
ALTER TABLE "DirectInquiry" ADD COLUMN "parentInquiryId" TEXT;
ALTER TABLE "ProviderProfile" ADD COLUMN "businessAddress" TEXT;
ALTER TABLE "ProviderTeamMember" ADD COLUMN "accessLevel" TEXT;
ALTER TABLE "ProviderTeamMember" ADD COLUMN "profileVisibility" TEXT;
ALTER TABLE "NotificationPreference" ADD COLUMN "providerPrefs" JSONB;

-- Provider doc PR-N01 time-critical notification types (additive only)
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DOCUMENT_EXPIRING';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REQUEST_STARTING_UNCONFIRMED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'JOB_APPLICATION_WITHDRAWN';
