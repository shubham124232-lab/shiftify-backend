-- AlterTable
ALTER TABLE "SupportRequest" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "distribution" JSONB,
ADD COLUMN     "requestType" TEXT,
ADD COLUMN     "responsibleAdminUserId" TEXT,
ADD COLUMN     "workersRequired" INTEGER NOT NULL DEFAULT 1;
