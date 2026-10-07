-- AlterTable
ALTER TABLE "WorkerProfile" ADD COLUMN     "acceptsActiveOvernightShifts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "acceptsSleepoverShifts" BOOLEAN NOT NULL DEFAULT false;
