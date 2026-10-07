-- CreateEnum
CREATE TYPE "CoordinatorConnectionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "CoordinatorInitiator" AS ENUM ('COORDINATOR', 'PARTICIPANT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'JOB_ASSIGNMENT_CONFIRMED';
ALTER TYPE "NotificationType" ADD VALUE 'COORDINATOR_CONNECTION_REQUEST';
ALTER TYPE "NotificationType" ADD VALUE 'COORDINATOR_CONNECTION_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE 'COORDINATOR_CONNECTION_DECLINED';
ALTER TYPE "NotificationType" ADD VALUE 'COORDINATOR_ENQUIRY_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'COORDINATOR_ENQUIRY_RESPONDED';

-- AlterTable
ALTER TABLE "ParticipantProfile" ADD COLUMN     "authorityConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "authorityConfirmedByUserId" TEXT;

-- AlterTable
ALTER TABLE "SupportRequest" ADD COLUMN     "workerConfirmedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SavedProfessional" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "professionalUserId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedProfessional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoordinatorParticipantConnection" (
    "id" TEXT NOT NULL,
    "coordinatorUserId" TEXT NOT NULL,
    "participantUserId" TEXT NOT NULL,
    "status" "CoordinatorConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "initiatedBy" "CoordinatorInitiator" NOT NULL,
    "message" TEXT,
    "canViewInfo" BOOLEAN NOT NULL DEFAULT true,
    "canPostRequests" BOOLEAN NOT NULL DEFAULT true,
    "canShortlist" BOOLEAN NOT NULL DEFAULT true,
    "canMessage" BOOLEAN NOT NULL DEFAULT true,
    "canConfirmBookings" BOOLEAN NOT NULL DEFAULT true,
    "canManageReplacements" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoordinatorParticipantConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedProfessional_ownerUserId_idx" ON "SavedProfessional"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedProfessional_ownerUserId_professionalUserId_key" ON "SavedProfessional"("ownerUserId", "professionalUserId");

-- CreateIndex
CREATE INDEX "CoordinatorParticipantConnection_coordinatorUserId_status_idx" ON "CoordinatorParticipantConnection"("coordinatorUserId", "status");

-- CreateIndex
CREATE INDEX "CoordinatorParticipantConnection_participantUserId_status_idx" ON "CoordinatorParticipantConnection"("participantUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CoordinatorParticipantConnection_coordinatorUserId_particip_key" ON "CoordinatorParticipantConnection"("coordinatorUserId", "participantUserId");

-- AddForeignKey
ALTER TABLE "SavedProfessional" ADD CONSTRAINT "SavedProfessional_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedProfessional" ADD CONSTRAINT "SavedProfessional_professionalUserId_fkey" FOREIGN KEY ("professionalUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoordinatorParticipantConnection" ADD CONSTRAINT "CoordinatorParticipantConnection_coordinatorUserId_fkey" FOREIGN KEY ("coordinatorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoordinatorParticipantConnection" ADD CONSTRAINT "CoordinatorParticipantConnection_participantUserId_fkey" FOREIGN KEY ("participantUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
