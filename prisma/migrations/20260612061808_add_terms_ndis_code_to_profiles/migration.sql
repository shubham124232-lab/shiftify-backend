/*
  Warnings:

  - You are about to drop the column `availability` on the `ProviderProfile` table. All the data in the column will be lost.
  - Changed the type of `dayOfWeek` on the `ProviderAvailability` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "ProviderAvailability" DROP CONSTRAINT "ProviderAvailability_providerProfileId_fkey";

-- AlterTable
ALTER TABLE "CoordinatorProfile" ADD COLUMN     "ndisCodeAccepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "termsAccepted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ParticipantProfile" ADD COLUMN     "ndisCodeAccepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "termsAccepted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PlanManagerProfile" ADD COLUMN     "ndisCodeAccepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "termsAccepted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProviderAvailability" ALTER COLUMN "id" DROP DEFAULT,
DROP COLUMN "dayOfWeek",
ADD COLUMN     "dayOfWeek" "WeekDay" NOT NULL;

-- AlterTable
ALTER TABLE "ProviderProfile" DROP COLUMN "availability";

-- CreateIndex
CREATE INDEX "ProviderAvailability_providerProfileId_dayOfWeek_idx" ON "ProviderAvailability"("providerProfileId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "SupportRequest_postedByUserId_status_idx" ON "SupportRequest"("postedByUserId", "status");

-- CreateIndex
CREATE INDEX "SupportRequest_assignedWorkerUserId_status_idx" ON "SupportRequest"("assignedWorkerUserId", "status");

-- CreateIndex
CREATE INDEX "SupportRequest_selectedApplicantUserId_status_idx" ON "SupportRequest"("selectedApplicantUserId", "status");

-- AddForeignKey
ALTER TABLE "ProviderAvailability" ADD CONSTRAINT "ProviderAvailability_providerProfileId_fkey" FOREIGN KEY ("providerProfileId") REFERENCES "ProviderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
