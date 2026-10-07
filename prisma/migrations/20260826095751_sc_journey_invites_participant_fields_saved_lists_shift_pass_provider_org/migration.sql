/*
  Warnings:

  - A unique constraint covering the columns `[orgInviteCode]` on the table `CoordinatorProfile` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[ownerUserId,professionalUserId,listType,forParticipantUserId]` on the table `SavedProfessional` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "JobInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ShiftPassStatus" AS ENUM ('ACTIVE', 'CONSUMED');

-- DropIndex
DROP INDEX "SavedProfessional_ownerUserId_professionalUserId_key";

-- AlterTable
ALTER TABLE "CoordinatorProfile" ADD COLUMN     "introductoryActionsUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "joinedViaInviteCode" TEXT,
ADD COLUMN     "orgInviteCode" TEXT,
ADD COLUMN     "organisationRole" TEXT,
ADD COLUMN     "preferredContactMethod" TEXT;

-- AlterTable
ALTER TABLE "ParticipantProfile" ADD COLUMN     "authorisingPersonName" TEXT,
ADD COLUMN     "authorisingPersonNote" TEXT,
ADD COLUMN     "authorisingPersonRelationship" TEXT,
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "infoAccuracyConfirmedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "maxAdministrators" INTEGER,
ADD COLUMN     "maxBranches" INTEGER,
ADD COLUMN     "maxTeamMembers" INTEGER;

-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN     "introductoryActionsUsed" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SavedProfessional" ADD COLUMN     "forParticipantUserId" TEXT,
ADD COLUMN     "listType" TEXT NOT NULL DEFAULT 'GENERAL';

-- AlterTable
ALTER TABLE "WorkerProfile" ADD COLUMN     "introductoryActionsUsed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "JobInvite" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "invitedUserId" TEXT NOT NULL,
    "status" "JobInviteStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "amountAud" DECIMAL(10,2),
    "mockReceiptRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "JobInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftPassPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "ShiftPassStatus" NOT NULL DEFAULT 'ACTIVE',
    "priceAud" DECIMAL(10,2) NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),
    "consumedByJobId" TEXT,
    "mockReceiptRef" TEXT,

    CONSTRAINT "ShiftPassPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderBranch" (
    "id" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderAdministrator" (
    "id" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderAdministrator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderTeamMember" (
    "id" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "inviteStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "mobileVerifiedAt" TIMESTAMP(3),
    "claimedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ProviderAdministratorToProviderBranch" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "JobInvite_jobId_status_idx" ON "JobInvite"("jobId", "status");

-- CreateIndex
CREATE INDEX "JobInvite_invitedUserId_status_idx" ON "JobInvite"("invitedUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "JobInvite_jobId_invitedUserId_key" ON "JobInvite"("jobId", "invitedUserId");

-- CreateIndex
CREATE INDEX "ShiftPassPurchase_userId_status_idx" ON "ShiftPassPurchase"("userId", "status");

-- CreateIndex
CREATE INDEX "ProviderBranch_providerUserId_idx" ON "ProviderBranch"("providerUserId");

-- CreateIndex
CREATE INDEX "ProviderAdministrator_providerUserId_idx" ON "ProviderAdministrator"("providerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderAdministrator_providerUserId_userId_key" ON "ProviderAdministrator"("providerUserId", "userId");

-- CreateIndex
CREATE INDEX "ProviderTeamMember_providerUserId_idx" ON "ProviderTeamMember"("providerUserId");

-- CreateIndex
CREATE INDEX "ProviderTeamMember_branchId_idx" ON "ProviderTeamMember"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderTeamMember_providerUserId_mobile_key" ON "ProviderTeamMember"("providerUserId", "mobile");

-- CreateIndex
CREATE UNIQUE INDEX "_ProviderAdministratorToProviderBranch_AB_unique" ON "_ProviderAdministratorToProviderBranch"("A", "B");

-- CreateIndex
CREATE INDEX "_ProviderAdministratorToProviderBranch_B_index" ON "_ProviderAdministratorToProviderBranch"("B");

-- CreateIndex
CREATE UNIQUE INDEX "CoordinatorProfile_orgInviteCode_key" ON "CoordinatorProfile"("orgInviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "SavedProfessional_ownerUserId_professionalUserId_listType_f_key" ON "SavedProfessional"("ownerUserId", "professionalUserId", "listType", "forParticipantUserId");

-- AddForeignKey
ALTER TABLE "SavedProfessional" ADD CONSTRAINT "SavedProfessional_forParticipantUserId_fkey" FOREIGN KEY ("forParticipantUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobInvite" ADD CONSTRAINT "JobInvite_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "SupportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobInvite" ADD CONSTRAINT "JobInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobInvite" ADD CONSTRAINT "JobInvite_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftPassPurchase" ADD CONSTRAINT "ShiftPassPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftPassPurchase" ADD CONSTRAINT "ShiftPassPurchase_consumedByJobId_fkey" FOREIGN KEY ("consumedByJobId") REFERENCES "SupportRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderBranch" ADD CONSTRAINT "ProviderBranch_providerUserId_fkey" FOREIGN KEY ("providerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderAdministrator" ADD CONSTRAINT "ProviderAdministrator_providerUserId_fkey" FOREIGN KEY ("providerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderAdministrator" ADD CONSTRAINT "ProviderAdministrator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderTeamMember" ADD CONSTRAINT "ProviderTeamMember_providerUserId_fkey" FOREIGN KEY ("providerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderTeamMember" ADD CONSTRAINT "ProviderTeamMember_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "ProviderBranch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderTeamMember" ADD CONSTRAINT "ProviderTeamMember_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProviderAdministratorToProviderBranch" ADD CONSTRAINT "_ProviderAdministratorToProviderBranch_A_fkey" FOREIGN KEY ("A") REFERENCES "ProviderAdministrator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProviderAdministratorToProviderBranch" ADD CONSTRAINT "_ProviderAdministratorToProviderBranch_B_fkey" FOREIGN KEY ("B") REFERENCES "ProviderBranch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
