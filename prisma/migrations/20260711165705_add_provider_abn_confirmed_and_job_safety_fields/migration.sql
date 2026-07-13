-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN     "abnConfirmed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SupportRequest" ADD COLUMN     "behaviourNotes" TEXT,
ADD COLUMN     "medicalNotes" TEXT,
ADD COLUMN     "riskSafetyNotes" TEXT;
