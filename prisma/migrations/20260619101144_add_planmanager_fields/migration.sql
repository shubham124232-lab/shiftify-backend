-- AlterTable
ALTER TABLE "PlanManagerProfile" ADD COLUMN     "acceptsAlliedHealthInvoices" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "acceptsTransportClaims" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "acceptsUnregisteredProviders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailResponseSla" TEXT,
ADD COLUMN     "phoneSupportHours" TEXT,
ADD COLUMN     "requiresDocsForHighValueInvoices" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiresParticipantConsentConfirmation" BOOLEAN NOT NULL DEFAULT false;
