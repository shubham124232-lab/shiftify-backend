-- DropIndex
DROP INDEX "Address_userId_key";

-- AlterTable
ALTER TABLE "Address" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "label" TEXT,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION,
ALTER COLUMN "street" DROP NOT NULL,
ALTER COLUMN "state" DROP NOT NULL,
ALTER COLUMN "postcode" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CoordinatorProfile" ADD COLUMN     "profileStep" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ParticipantProfile" ADD COLUMN     "profileStep" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PlanManagerProfile" ADD COLUMN     "profileStep" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN     "profileStep" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "WorkerProfile" ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION,
ADD COLUMN     "profileStep" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Address_userId_idx" ON "Address"("userId");

-- CreateIndex
CREATE INDEX "Address_userId_isDefault_idx" ON "Address"("userId", "isDefault");
