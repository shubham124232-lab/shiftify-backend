-- CreateEnum
CREATE TYPE "AvailabilityListingType" AS ENUM ('DATE_RANGE', 'FORTNIGHTLY', 'ONGOING', 'BACKUP');

-- CreateEnum
CREATE TYPE "AvailabilityListingVisibility" AS ENUM ('ALL', 'CONNECTIONS_ONLY');

-- CreateEnum
CREATE TYPE "AvailabilityListingStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'JOB_RUNNING_LATE';

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "communicationRating" INTEGER,
ADD COLUMN     "privateConcern" TEXT,
ADD COLUMN     "qualityRating" INTEGER,
ADD COLUMN     "reliabilityRating" INTEGER;

-- AlterTable
ALTER TABLE "SupportRequest" ADD COLUMN     "runningLateMinutes" INTEGER,
ADD COLUMN     "runningLateNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "workerPrivateNote" TEXT;

-- CreateTable
CREATE TABLE "JobBookmark" (
    "id" TEXT NOT NULL,
    "workerUserId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "saved" BOOLEAN NOT NULL DEFAULT true,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "jobUpdates" BOOLEAN NOT NULL DEFAULT true,
    "messages" BOOLEAN NOT NULL DEFAULT true,
    "connectionsAndInvites" BOOLEAN NOT NULL DEFAULT true,
    "marketingTips" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityListing" (
    "id" TEXT NOT NULL,
    "workerUserId" TEXT NOT NULL,
    "listingType" "AvailabilityListingType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "services" JSONB NOT NULL,
    "suburb" TEXT,
    "state" TEXT,
    "travelRadiusKm" INTEGER,
    "rate" DECIMAL(8,2),
    "visibility" "AvailabilityListingVisibility" NOT NULL DEFAULT 'ALL',
    "expiresAt" TIMESTAMP(3),
    "status" "AvailabilityListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilityListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobBookmark_workerUserId_idx" ON "JobBookmark"("workerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "JobBookmark_workerUserId_jobId_key" ON "JobBookmark"("workerUserId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "AvailabilityListing_workerUserId_idx" ON "AvailabilityListing"("workerUserId");

-- CreateIndex
CREATE INDEX "AvailabilityListing_status_idx" ON "AvailabilityListing"("status");

-- AddForeignKey
ALTER TABLE "JobBookmark" ADD CONSTRAINT "JobBookmark_workerUserId_fkey" FOREIGN KEY ("workerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobBookmark" ADD CONSTRAINT "JobBookmark_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SupportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityListing" ADD CONSTRAINT "AvailabilityListing_workerUserId_fkey" FOREIGN KEY ("workerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
