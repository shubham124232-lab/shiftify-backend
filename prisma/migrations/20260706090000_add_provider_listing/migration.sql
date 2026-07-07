-- CreateTable
CREATE TABLE "ProviderListing" (
    "id" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "listingCategory" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "suburb" TEXT NOT NULL,
    "state" TEXT,
    "postcode" TEXT,
    "listingType" TEXT,
    "serviceCategory" TEXT,
    "serviceMode" TEXT,
    "fundingTypes" JSONB,
    "vacancyCategory" TEXT,
    "propertyType" TEXT,
    "vacancyCount" INTEGER,
    "supportModel" TEXT,
    "suitableFor" JSONB,
    "fundingRoutes" JSONB,
    "urgency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderListing_providerUserId_status_idx" ON "ProviderListing"("providerUserId", "status");

-- CreateIndex
CREATE INDEX "ProviderListing_listingCategory_status_idx" ON "ProviderListing"("listingCategory", "status");

-- CreateIndex
CREATE INDEX "ProviderListing_suburb_idx" ON "ProviderListing"("suburb");

-- AddForeignKey
ALTER TABLE "ProviderListing" ADD CONSTRAINT "ProviderListing_providerUserId_fkey" FOREIGN KEY ("providerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
