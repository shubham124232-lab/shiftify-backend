-- CreateEnum
CREATE TYPE "DirectConnectStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'DIRECT_CONNECT_REQUEST';
ALTER TYPE "NotificationType" ADD VALUE 'DIRECT_CONNECT_RESPONDED';

-- CreateTable
CREATE TABLE "DirectConnectRequest" (
    "id" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "workerUserId" TEXT NOT NULL,
    "status" "DirectConnectStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "amountAud" DECIMAL(10,2) NOT NULL DEFAULT 9.99,
    "mockReceiptRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectConnectRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DirectConnectRequest_providerUserId_status_idx" ON "DirectConnectRequest"("providerUserId", "status");

-- CreateIndex
CREATE INDEX "DirectConnectRequest_workerUserId_status_idx" ON "DirectConnectRequest"("workerUserId", "status");

-- AddForeignKey
ALTER TABLE "DirectConnectRequest" ADD CONSTRAINT "DirectConnectRequest_providerUserId_fkey" FOREIGN KEY ("providerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectConnectRequest" ADD CONSTRAINT "DirectConnectRequest_workerUserId_fkey" FOREIGN KEY ("workerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
