-- AlterTable
ALTER TABLE "WorkerProfile" ADD COLUMN     "isPubliclyListed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "listingHeadline" TEXT;
