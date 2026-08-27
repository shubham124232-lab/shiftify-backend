-- CreateEnum
CREATE TYPE "PostingApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'COORDINATOR_POSTING_APPROVAL_REQUEST';
ALTER TYPE "NotificationType" ADD VALUE 'COORDINATOR_POSTING_APPROVAL_RESPONDED';

-- AlterTable
ALTER TABLE "CoordinatorParticipantConnection" ADD COLUMN     "postingApprovalRequestedAt" TIMESTAMP(3),
ADD COLUMN     "postingApprovalRespondedAt" TIMESTAMP(3),
ADD COLUMN     "postingApprovalStatus" "PostingApprovalStatus";
