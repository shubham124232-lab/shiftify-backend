-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "issuer" TEXT,
ADD COLUMN     "replacesId" TEXT,
ADD COLUMN     "supersededAt" TIMESTAMP(3),
ADD COLUMN     "title" TEXT,
ADD COLUMN     "visibility" TEXT;

-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN     "continuityModel" TEXT,
ADD COLUMN     "directEnquiryAudience" TEXT,
ADD COLUMN     "displayPublicPhone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fundingAccepted" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "intakeProcess" TEXT;
