-- AlterEnum
ALTER TYPE "CoordinatorConnectionStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "CoordinatorParticipantConnection" ADD COLUMN     "permissionRequestPending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "permissionRequestedAt" TIMESTAMP(3),
ADD COLUMN     "requestedPermissions" JSONB;
