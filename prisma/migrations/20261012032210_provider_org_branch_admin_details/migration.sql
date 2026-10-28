-- AlterTable
ALTER TABLE "ProviderAdministrator" ADD COLUMN     "rolePreset" TEXT NOT NULL DEFAULT 'ADMINISTRATOR',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "ProviderBranch" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "managerUserId" TEXT,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "serviceLines" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "timezone" TEXT;
