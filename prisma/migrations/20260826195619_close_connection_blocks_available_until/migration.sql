-- CreateEnum
CREATE TYPE "ClosedOutcome" AS ENUM ('FILLED_CONFIRMED', 'CANCELLED', 'NOT_PROCEEDING', 'UNFILLED');

-- AlterTable
ALTER TABLE "SupportRequest" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedFeedback" TEXT,
ADD COLUMN     "closedOutcome" "ClosedOutcome",
ADD COLUMN     "closedReasonCategory" TEXT;

-- AlterTable
ALTER TABLE "WorkerProfile" ADD COLUMN     "availableNowUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "UserBlock" (
    "id" TEXT NOT NULL,
    "blockerUserId" TEXT NOT NULL,
    "blockedUserId" TEXT NOT NULL,
    "blockMessages" BOOLEAN NOT NULL DEFAULT true,
    "hideProfile" BOOLEAN NOT NULL DEFAULT true,
    "reportReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserBlock_blockedUserId_idx" ON "UserBlock"("blockedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBlock_blockerUserId_blockedUserId_key" ON "UserBlock"("blockerUserId", "blockedUserId");

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerUserId_fkey" FOREIGN KEY ("blockerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedUserId_fkey" FOREIGN KEY ("blockedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
