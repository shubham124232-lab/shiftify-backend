-- CreateTable
CREATE TABLE "ServiceStartRecord" (
    "jobId" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "agreedStartAt" TIMESTAMP(3),
    "nominatedWorkerId" TEXT,
    "serviceAgreement" TEXT NOT NULL DEFAULT 'PENDING',
    "participantAgreement" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "isDraft" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceStartRecord_pkey" PRIMARY KEY ("jobId")
);

-- CreateTable
CREATE TABLE "EnquiryIntake" (
    "inquiryId" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "internalNote" TEXT,
    "appointmentAt" TIMESTAMP(3),
    "appointmentType" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnquiryIntake_pkey" PRIMARY KEY ("inquiryId")
);

-- CreateIndex
CREATE INDEX "ServiceStartRecord_providerUserId_idx" ON "ServiceStartRecord"("providerUserId");

-- CreateIndex
CREATE INDEX "EnquiryIntake_providerUserId_idx" ON "EnquiryIntake"("providerUserId");
