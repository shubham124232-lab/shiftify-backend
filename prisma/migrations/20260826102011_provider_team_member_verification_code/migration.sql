-- AlterTable
ALTER TABLE "ProviderTeamMember" ADD COLUMN     "verificationCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "verificationCodeHash" TEXT;
