-- AlterTable
ALTER TABLE "WorkerProfile" ADD COLUMN     "availableDays" JSONB,
ADD COLUMN     "cprExpiry" TIMESTAMP(3),
ADD COLUMN     "driversLicenceExpiry" TIMESTAMP(3),
ADD COLUMN     "firstAidExpiry" TIMESTAMP(3),
ADD COLUMN     "infectionControlCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "minimumShiftHours" DOUBLE PRECISION,
ADD COLUMN     "ndisScreeningExpiry" TIMESTAMP(3),
ADD COLUMN     "ndisScreeningNumber" TEXT,
ADD COLUMN     "policeCheckExpiry" TIMESTAMP(3),
ADD COLUMN     "policeCheckIssueDate" TIMESTAMP(3),
ADD COLUMN     "timeBlocks" JSONB,
ADD COLUMN     "wwccExpiry" TIMESTAMP(3),
ADD COLUMN     "wwccNumber" TEXT;
