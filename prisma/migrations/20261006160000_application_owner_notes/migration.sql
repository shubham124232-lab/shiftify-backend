-- Provider doc PR-LV03 poster-private notes and decision reasons on responses (additive only)
ALTER TABLE "JobApplication" ADD COLUMN "ownerNote" TEXT;
ALTER TABLE "JobApplication" ADD COLUMN "decisionReason" TEXT;
