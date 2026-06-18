/*
  Warnings:

  - You are about to drop the column `code` on the `VerificationCode` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `VerificationCode` table. All the data in the column will be lost.
  - You are about to drop the column `usedAt` on the `VerificationCode` table. All the data in the column will be lost.
  - Added the required column `channel` to the `VerificationCode` table without a default value. This is not possible if the table is not empty.
  - Added the required column `codeHash` to the `VerificationCode` table without a default value. This is not possible if the table is not empty.
  - Added the required column `destination` to the `VerificationCode` table without a default value. This is not possible if the table is not empty.
  - Added the required column `purpose` to the `VerificationCode` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "VerificationCode_userId_type_idx";

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "activeRole" "UserRole";

-- AlterTable
ALTER TABLE "VerificationCode" DROP COLUMN "code",
DROP COLUMN "type",
DROP COLUMN "usedAt",
ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "channel" "OtpChannel" NOT NULL,
ADD COLUMN     "codeHash" TEXT NOT NULL,
ADD COLUMN     "consumedAt" TIMESTAMP(3),
ADD COLUMN     "destination" TEXT NOT NULL,
ADD COLUMN     "purpose" "OtpPurpose" NOT NULL;

-- CreateIndex
CREATE INDEX "VerificationCode_userId_purpose_idx" ON "VerificationCode"("userId", "purpose");
