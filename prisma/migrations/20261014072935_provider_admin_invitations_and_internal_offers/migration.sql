-- CreateTable
CREATE TABLE "InternalShiftOffer" (
    "id" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "memberType" TEXT NOT NULL,
    "memberUserId" TEXT,
    "teamMemberId" TEXT,
    "memberName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "offeredRate" DECIMAL(8,2),
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "InternalShiftOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InternalShiftOffer_providerUserId_status_idx" ON "InternalShiftOffer"("providerUserId", "status");

-- CreateIndex
CREATE INDEX "InternalShiftOffer_jobId_idx" ON "InternalShiftOffer"("jobId");

-- CreateIndex
CREATE INDEX "InternalShiftOffer_memberUserId_status_idx" ON "InternalShiftOffer"("memberUserId", "status");

-- AddForeignKey
ALTER TABLE "InternalShiftOffer" ADD CONSTRAINT "InternalShiftOffer_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SupportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
