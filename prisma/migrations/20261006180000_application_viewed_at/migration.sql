-- Provider doc PR-M02 "Viewed" status on responses (additive only)
ALTER TABLE "JobApplication" ADD COLUMN "viewedAt" TIMESTAMP(3);
