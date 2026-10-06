-- AlterTable
ALTER TABLE "PlatinumTileCampaign" ADD COLUMN     "marketState" TEXT;

-- AlterTable
ALTER TABLE "ProviderListing" ADD COLUMN     "listingExpiresAt" TIMESTAMP(3),
ADD COLUMN     "packageReceiptRef" TEXT,
ADD COLUMN     "standardPaidAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProviderTeamMember" ADD COLUMN     "removedAt" TIMESTAMP(3);
