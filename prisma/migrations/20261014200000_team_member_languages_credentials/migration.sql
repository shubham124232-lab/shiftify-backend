-- Provider doc P19 (additive): Team Member languages, credential review state, years of experience.
ALTER TABLE "ProviderTeamMember" ADD COLUMN "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "credentialStatus" TEXT,
ADD COLUMN "experienceYears" INTEGER;
