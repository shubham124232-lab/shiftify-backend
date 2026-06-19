-- AlterTable
ALTER TABLE "CoordinatorProfile" ADD COLUMN     "complianceDeclaration" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ndisScreeningExpiry" TIMESTAMP(3),
ADD COLUMN     "ndisScreeningNumber" TEXT,
ADD COLUMN     "policeCheckExpiry" TIMESTAMP(3),
ADD COLUMN     "professionalIndemnityExpiry" TIMESTAMP(3),
ADD COLUMN     "professionalIndemnityPolicyNumber" TEXT,
ADD COLUMN     "professionalIndemnityProviderName" TEXT,
ADD COLUMN     "publicLiabilityExpiry" TIMESTAMP(3),
ADD COLUMN     "publicLiabilityPolicyNumber" TEXT,
ADD COLUMN     "wwccExpiry" TIMESTAMP(3),
ADD COLUMN     "wwccNumber" TEXT;
