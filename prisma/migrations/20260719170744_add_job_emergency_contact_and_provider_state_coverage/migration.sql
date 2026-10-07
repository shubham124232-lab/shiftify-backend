/*
  Warnings:

  - You are about to drop the column `participantTypesAccepted` on the `CoordinatorProfile` table. All the data in the column will be lost.
  - You are about to drop the column `serviceAreas` on the `PlanManagerProfile` table. All the data in the column will be lost.
  - You are about to drop the column `availableDays` on the `WorkerProfile` table. All the data in the column will be lost.
  - You are about to drop the column `sleeperAvailability` on the `WorkerProfile` table. All the data in the column will be lost.
  - You are about to drop the column `timeBlocks` on the `WorkerProfile` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CoordinatorProfile" DROP COLUMN "participantTypesAccepted";

-- AlterTable
ALTER TABLE "PlanManagerProfile" DROP COLUMN "serviceAreas",
ADD COLUMN     "adminOnlyBillingMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "participantReferenceIdLabel" TEXT,
ADD COLUMN     "staffRoles" JSONB,
ADD COLUMN     "statementContactEmail" TEXT,
ADD COLUMN     "statementContactName" TEXT;

-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN     "stateCoverage" JSONB;

-- AlterTable
ALTER TABLE "SupportRequest" ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT,
ADD COLUMN     "emergencyContactRelationship" TEXT;

-- AlterTable
ALTER TABLE "WorkerProfile" DROP COLUMN "availableDays",
DROP COLUMN "sleeperAvailability",
DROP COLUMN "timeBlocks";
