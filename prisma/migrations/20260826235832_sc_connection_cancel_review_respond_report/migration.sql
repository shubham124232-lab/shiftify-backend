-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "reportReason" TEXT,
ADD COLUMN     "reportedByReviewee" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "revieweeResponse" TEXT,
ADD COLUMN     "revieweeResponseAt" TIMESTAMP(3);
