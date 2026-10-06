-- Provider doc PR-W02 invite details on roster Team Members (additive only)
ALTER TABLE "ProviderTeamMember" ADD COLUMN "email" TEXT;
ALTER TABLE "ProviderTeamMember" ADD COLUMN "relationshipType" TEXT;
ALTER TABLE "ProviderTeamMember" ADD COLUMN "locations" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ProviderTeamMember" ADD COLUMN "consentAcknowledgedAt" TIMESTAMP(3);
