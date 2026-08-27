-- CreateEnum
CREATE TYPE "MeetAndGreetType" AS ENUM ('PHONE', 'VIDEO', 'IN_PERSON');

-- CreateEnum
CREATE TYPE "MeetAndGreetCost" AS ENUM ('FREE', 'AGREED_RATE', 'DISCUSS');

-- CreateEnum
CREATE TYPE "MeetAndGreetStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'DECLINED');

-- CreateEnum
CREATE TYPE "JobChangeType" AS ENUM ('TIME', 'DURATION', 'DATE', 'RECURRENCE', 'RATE', 'OTHER');

-- CreateEnum
CREATE TYPE "JobChangeRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- AlterEnum
ALTER TYPE "ApplicationStatus" ADD VALUE 'REQUEST_FILLED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'JOB_ASSIGNMENT_DECLINED';
ALTER TYPE "NotificationType" ADD VALUE 'MEET_AND_GREET_PROPOSED';
ALTER TYPE "NotificationType" ADD VALUE 'MEET_AND_GREET_RESPONDED';
ALTER TYPE "NotificationType" ADD VALUE 'JOB_CHANGE_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'JOB_CHANGE_RESPONDED';

-- AlterTable
ALTER TABLE "SupportRequest" ADD COLUMN     "cancelReasonCategory" TEXT,
ADD COLUMN     "notifyReplacements" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WorkerProfile" ADD COLUMN     "contactPreference" TEXT,
ADD COLUMN     "nameDisplayMode" TEXT,
ADD COLUMN     "rateDisplayMode" TEXT;

-- CreateTable
CREATE TABLE "MeetAndGreet" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "proposedByUserId" TEXT NOT NULL,
    "type" "MeetAndGreetType" NOT NULL,
    "proposedTimes" JSONB NOT NULL,
    "location" TEXT,
    "cost" "MeetAndGreetCost" NOT NULL,
    "topics" JSONB,
    "status" "MeetAndGreetStatus" NOT NULL DEFAULT 'PROPOSED',
    "confirmedTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetAndGreet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobChangeRequest" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "changeType" "JobChangeType" NOT NULL,
    "reason" TEXT,
    "alternative" JSONB NOT NULL,
    "status" "JobChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "JobChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetAndGreet_jobId_idx" ON "MeetAndGreet"("jobId");

-- CreateIndex
CREATE INDEX "JobChangeRequest_jobId_idx" ON "JobChangeRequest"("jobId");

-- AddForeignKey
ALTER TABLE "MeetAndGreet" ADD CONSTRAINT "MeetAndGreet_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SupportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetAndGreet" ADD CONSTRAINT "MeetAndGreet_proposedByUserId_fkey" FOREIGN KEY ("proposedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobChangeRequest" ADD CONSTRAINT "JobChangeRequest_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SupportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobChangeRequest" ADD CONSTRAINT "JobChangeRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
