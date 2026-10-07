-- AlterEnum
ALTER TYPE "IncidentStatus" ADD VALUE 'DRAFT';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'DIRECT_INQUIRY_RECEIVED';

-- AlterTable
ALTER TABLE "IncidentReport" ADD COLUMN     "evidenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN     "isPubliclyListed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "JobMessageThreadState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobMessageThreadState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectInquiry" (
    "id" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "participantConnectionId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "DirectInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobMessageThreadState_userId_idx" ON "JobMessageThreadState"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "JobMessageThreadState_userId_jobId_key" ON "JobMessageThreadState"("userId", "jobId");

-- CreateIndex
CREATE INDEX "DirectInquiry_recipientUserId_createdAt_idx" ON "DirectInquiry"("recipientUserId", "createdAt");

-- CreateIndex
CREATE INDEX "DirectInquiry_senderUserId_createdAt_idx" ON "DirectInquiry"("senderUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "JobMessageThreadState" ADD CONSTRAINT "JobMessageThreadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMessageThreadState" ADD CONSTRAINT "JobMessageThreadState_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SupportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectInquiry" ADD CONSTRAINT "DirectInquiry_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectInquiry" ADD CONSTRAINT "DirectInquiry_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
