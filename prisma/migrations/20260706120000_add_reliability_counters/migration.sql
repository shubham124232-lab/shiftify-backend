-- AlterTable
ALTER TABLE "WorkerProfile" ADD COLUMN     "totalCancelledByClient" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalCancelledByWorker" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalCompleted" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN     "averageRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "totalCancelledByClient" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalCancelledByWorker" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalCompleted" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalRatings" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "CoordinatorProfile" ADD COLUMN     "averageRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "totalCancelledByClient" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalCancelledByWorker" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalCompleted" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalRatings" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SupportRequest" ADD COLUMN     "cancelledByRole" "UserRole";
