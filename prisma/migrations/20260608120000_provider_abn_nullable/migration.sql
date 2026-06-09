-- Allow provider profiles to be saved during wizard steps before ABN is entered.
-- PostgreSQL unique constraints treat NULL as distinct, so multiple unset ABNs are allowed.
ALTER TABLE "ProviderProfile" ALTER COLUMN "abn" DROP NOT NULL;
UPDATE "ProviderProfile" SET "abn" = NULL WHERE "abn" = '';
