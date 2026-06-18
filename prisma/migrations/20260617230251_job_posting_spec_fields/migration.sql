/*
  Warnings:

  - You are about to drop the column `activeRole` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `attempts` on the `VerificationCode` table. All the data in the column will be lost.
  - You are about to drop the column `channel` on the `VerificationCode` table. All the data in the column will be lost.
  - You are about to drop the column `codeHash` on the `VerificationCode` table. All the data in the column will be lost.
  - You are about to drop the column `consumedAt` on the `VerificationCode` table. All the data in the column will be lost.
  - You are about to drop the column `destination` on the `VerificationCode` table. All the data in the column will be lost.
  - You are about to drop the column `purpose` on the `VerificationCode` table. All the data in the column will be lost.
  - Added the required column `code` to the `VerificationCode` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `VerificationCode` table without a default value. This is not possible if the table is not empty.
  - Made the column `userId` on table `VerificationCode` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('STANDARD', 'SHORT_VISIT', 'LONG_SHIFT', 'ACTIVE_OVERNIGHT', 'SLEEPOVER', 'TWENTY_FOUR_HOUR', 'DROP_IN', 'APPOINTMENT', 'TRANSPORT_ONLY', 'SPLIT');

-- CreateEnum
CREATE TYPE "FundingType" AS ENUM ('SELF_MANAGED', 'PLAN_MANAGED', 'NDIA_MANAGED', 'PRIVATE', 'MIXED', 'DISCUSS');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentType" ADD VALUE 'ABN_CONFIRMATION';
ALTER TYPE "DocumentType" ADD VALUE 'NDIS_REGISTRATION_PROOF';
ALTER TYPE "DocumentType" ADD VALUE 'BUSINESS_REP_PROOF';
ALTER TYPE "DocumentType" ADD VALUE 'POLICIES_PROCEDURES';

-- DropIndex
DROP INDEX "VerificationCode_destination_purpose_idx";

-- DropIndex
DROP INDEX "VerificationCode_userId_idx";

-- AlterTable
ALTER TABLE "CoordinatorProfile" ADD COLUMN     "privacyPolicyAccepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "profilePhoto" TEXT;

-- AlterTable
ALTER TABLE "JobApplication" ADD COLUMN     "applicationData" JSONB,
ADD COLUMN     "availabilityType" TEXT,
ADD COLUMN     "introduction" TEXT,
ADD COLUMN     "proposedRate" DECIMAL(8,2),
ADD COLUMN     "rateResponse" TEXT;

-- AlterTable
ALTER TABLE "ParticipantProfile" ADD COLUMN     "fullAddress" TEXT;

-- AlterTable
ALTER TABLE "PlanManagerProfile" ADD COLUMN     "disputeHandlingContact" TEXT,
ADD COLUMN     "planTypesSupported" JSONB,
ADD COLUMN     "pmRoleType" TEXT,
ADD COLUMN     "remittanceAdvice" TEXT,
ADD COLUMN     "silSdaInvoicing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "staffFinanceTeamEmail" TEXT;

-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN     "professionalIndemnityExpiryDate" TIMESTAMP(3),
ADD COLUMN     "publicLiabilityExpiryDate" TIMESTAMP(3),
ADD COLUMN     "workersCompExpiryDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Session" DROP COLUMN "activeRole";

-- AlterTable
ALTER TABLE "SupportRequest" ADD COLUMN     "addressLine" TEXT,
ADD COLUMN     "allowDirectMessages" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "allowQuotes" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "applicationDeadlineAt" TIMESTAMP(3),
ADD COLUMN     "budgetPerHour" DECIMAL(8,2),
ADD COLUMN     "budgetType" TEXT,
ADD COLUMN     "caseReference" TEXT,
ADD COLUMN     "durationType" TEXT,
ADD COLUMN     "fundingType" "FundingType",
ADD COLUMN     "hideParticipantName" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "internalNote" TEXT,
ADD COLUMN     "lat" DECIMAL(9,6),
ADD COLUMN     "lng" DECIMAL(9,6),
ADD COLUMN     "locationNotes" TEXT,
ADD COLUMN     "maxApplicants" INTEGER,
ADD COLUMN     "participantPostedAs" TEXT,
ADD COLUMN     "requestPurposeCategory" TEXT,
ADD COLUMN     "shiftType" "ShiftType",
ADD COLUMN     "supportGoal" TEXT,
ADD COLUMN     "timeFlexibility" TEXT,
ADD COLUMN     "totalBudget" DECIMAL(10,2),
ADD COLUMN     "travelReimbursement" TEXT,
ADD COLUMN     "travelRequired" TEXT,
ADD COLUMN     "visibilityTarget" TEXT;

-- AlterTable
ALTER TABLE "VerificationCode" DROP COLUMN "attempts",
DROP COLUMN "channel",
DROP COLUMN "codeHash",
DROP COLUMN "consumedAt",
DROP COLUMN "destination",
DROP COLUMN "purpose",
ADD COLUMN     "code" TEXT NOT NULL,
ADD COLUMN     "type" TEXT NOT NULL,
ADD COLUMN     "usedAt" TIMESTAMP(3),
ALTER COLUMN "userId" SET NOT NULL;

-- AlterTable
ALTER TABLE "WorkerProfile" ADD COLUMN     "driversLicenceType" TEXT,
ADD COLUMN     "personalAccidentExpiry" TIMESTAMP(3),
ADD COLUMN     "personalAccidentPolicyNumber" TEXT,
ADD COLUMN     "publicLiabilityExpiry" TIMESTAMP(3),
ADD COLUMN     "publicLiabilityPolicyNumber" TEXT;

-- CreateIndex
CREATE INDEX "SupportRequest_shiftType_idx" ON "SupportRequest"("shiftType");

-- CreateIndex
CREATE INDEX "SupportRequest_fundingType_idx" ON "SupportRequest"("fundingType");

-- CreateIndex
CREATE INDEX "SupportRequest_isRecurring_idx" ON "SupportRequest"("isRecurring");

-- CreateIndex
CREATE INDEX "SupportRequest_visibilityTarget_idx" ON "SupportRequest"("visibilityTarget");

-- CreateIndex
CREATE INDEX "SupportRequest_applicationDeadlineAt_idx" ON "SupportRequest"("applicationDeadlineAt");

-- CreateIndex
CREATE INDEX "VerificationCode_userId_type_idx" ON "VerificationCode"("userId", "type");
