-- Provider demo service lines (additive): capability details per service category.
ALTER TABLE "ProviderProfile" ADD COLUMN "serviceLineDetails" JSONB;
