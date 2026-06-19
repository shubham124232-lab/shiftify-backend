/*
  Warnings:

  - The `languagePreference` column on the `ParticipantProfile` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `culturalPreference` column on the `ParticipantProfile` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `preferredTime` column on the `ParticipantProfile` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "ParticipantProfile" DROP COLUMN "languagePreference",
ADD COLUMN     "languagePreference" JSONB,
DROP COLUMN "culturalPreference",
ADD COLUMN     "culturalPreference" JSONB,
DROP COLUMN "preferredTime",
ADD COLUMN     "preferredTime" JSONB;
