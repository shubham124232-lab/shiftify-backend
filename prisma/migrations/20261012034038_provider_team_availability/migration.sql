-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'TEAM_AVAILABILITY_REQUEST';

-- CreateTable
CREATE TABLE "TeamAvailabilityRequest" (
    "id" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "jobId" TEXT,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamAvailabilityRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamAvailabilityReply" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "memberType" TEXT NOT NULL,
    "memberUserId" TEXT,
    "teamMemberId" TEXT,
    "memberName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "TeamAvailabilityReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamAvailabilityRequest_providerUserId_createdAt_idx" ON "TeamAvailabilityRequest"("providerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "TeamAvailabilityReply_requestId_idx" ON "TeamAvailabilityReply"("requestId");

-- CreateIndex
CREATE INDEX "TeamAvailabilityReply_memberUserId_status_idx" ON "TeamAvailabilityReply"("memberUserId", "status");

-- AddForeignKey
ALTER TABLE "TeamAvailabilityReply" ADD CONSTRAINT "TeamAvailabilityReply_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "TeamAvailabilityRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
