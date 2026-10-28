-- AlterTable
ALTER TABLE "ProviderAdministrator" ADD COLUMN     "billingAccess" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProviderBranch" ADD COLUMN     "address" TEXT,
ADD COLUMN     "escalationContact" TEXT;

-- AlterTable
ALTER TABLE "ProviderListing" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "ownerUserId" TEXT;
