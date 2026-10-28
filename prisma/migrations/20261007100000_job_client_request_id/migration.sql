-- Phase 2: idempotent job posting (additive only)
ALTER TABLE "SupportRequest" ADD COLUMN "clientRequestId" TEXT;
CREATE UNIQUE INDEX "SupportRequest_postedByUserId_clientRequestId_key" ON "SupportRequest"("postedByUserId", "clientRequestId");
