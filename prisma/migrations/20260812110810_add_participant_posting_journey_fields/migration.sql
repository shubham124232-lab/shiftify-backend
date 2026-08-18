-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobUrgency" ADD VALUE 'RAPID';
ALTER TYPE "JobUrgency" ADD VALUE 'LAST_MINUTE';

-- AlterTable
ALTER TABLE "SupportRequest" ADD COLUMN     "contactPreferences" JSONB,
ADD COLUMN     "planManagerName" TEXT,
ADD COLUMN     "responsePreferences" JSONB,
ADD COLUMN     "safetyFlags" JSONB,
ADD COLUMN     "selectedTasks" JSONB;
