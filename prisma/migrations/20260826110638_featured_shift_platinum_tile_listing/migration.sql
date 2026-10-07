-- AlterTable
ALTER TABLE "ProviderListing" ADD COLUMN     "featuredExpiresAt" TIMESTAMP(3),
ADD COLUMN     "featuredQueuePosition" INTEGER,
ADD COLUMN     "featuredSince" TIMESTAMP(3),
ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SupportRequest" ADD COLUMN     "featuredUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "FeaturedShiftPurchase" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "purchasedByUserId" TEXT NOT NULL,
    "tier" "JobUrgency" NOT NULL,
    "priceAud" DECIMAL(6,2) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "mockReceiptRef" TEXT,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeaturedShiftPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatinumTileCampaign" (
    "id" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "coverage" TEXT NOT NULL,
    "centreSuburb" TEXT,
    "durationMonths" INTEGER NOT NULL,
    "priceAud" DECIMAL(7,2) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "mockReceiptRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatinumTileCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeaturedShiftPurchase_jobId_idx" ON "FeaturedShiftPurchase"("jobId");

-- CreateIndex
CREATE INDEX "FeaturedShiftPurchase_purchasedByUserId_idx" ON "FeaturedShiftPurchase"("purchasedByUserId");

-- CreateIndex
CREATE INDEX "PlatinumTileCampaign_providerUserId_idx" ON "PlatinumTileCampaign"("providerUserId");

-- CreateIndex
CREATE INDEX "PlatinumTileCampaign_coverage_idx" ON "PlatinumTileCampaign"("coverage");

-- AddForeignKey
ALTER TABLE "FeaturedShiftPurchase" ADD CONSTRAINT "FeaturedShiftPurchase_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SupportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeaturedShiftPurchase" ADD CONSTRAINT "FeaturedShiftPurchase_purchasedByUserId_fkey" FOREIGN KEY ("purchasedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatinumTileCampaign" ADD CONSTRAINT "PlatinumTileCampaign_providerUserId_fkey" FOREIGN KEY ("providerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
