-- Collapse JobUrgency to the 4 doc-grounded tiers: RAPID / URGENT /
-- LAST_MINUTE / ROUTINE. Remap existing rows on both tables that use this
-- enum before dropping the retired values, so no data becomes unreadable.
--
-- Mapping (closest doc-time-window match):
--   EMERGENCY   -> RAPID        (both meant "fastest/most pressing")
--   SAME_DAY    -> URGENT       (already the intended label everywhere in the UI)
--   SCHEDULED   -> ROUTINE      (already the intended label everywhere in the UI)
--   REPLACEMENT -> LAST_MINUTE  (the only place this value was ever set was the
--                                 Live Dashboard "Last-Minute" post tile, which
--                                 mistakenly sent urgency=REPLACEMENT instead of
--                                 urgency=LAST_MINUTE — so every existing row is
--                                 really a Last-Minute post)

UPDATE "SupportRequest" SET urgency = 'RAPID'       WHERE urgency = 'EMERGENCY';
UPDATE "SupportRequest" SET urgency = 'URGENT'      WHERE urgency = 'SAME_DAY';
UPDATE "SupportRequest" SET urgency = 'ROUTINE'     WHERE urgency = 'SCHEDULED';
UPDATE "SupportRequest" SET urgency = 'LAST_MINUTE' WHERE urgency = 'REPLACEMENT';

UPDATE "FeaturedShiftPurchase" SET tier = 'RAPID'       WHERE tier = 'EMERGENCY';
UPDATE "FeaturedShiftPurchase" SET tier = 'URGENT'      WHERE tier = 'SAME_DAY';
UPDATE "FeaturedShiftPurchase" SET tier = 'ROUTINE'     WHERE tier = 'SCHEDULED';
UPDATE "FeaturedShiftPurchase" SET tier = 'LAST_MINUTE' WHERE tier = 'REPLACEMENT';

-- Postgres can't DROP a single enum value in place — rebuild the type.
CREATE TYPE "JobUrgency_new" AS ENUM ('RAPID', 'URGENT', 'LAST_MINUTE', 'ROUTINE');

ALTER TABLE "SupportRequest"
  ALTER COLUMN urgency DROP DEFAULT,
  ALTER COLUMN urgency TYPE "JobUrgency_new" USING (urgency::text::"JobUrgency_new"),
  ALTER COLUMN urgency SET DEFAULT 'ROUTINE';

ALTER TABLE "FeaturedShiftPurchase"
  ALTER COLUMN tier TYPE "JobUrgency_new" USING (tier::text::"JobUrgency_new");

DROP TYPE "JobUrgency";
ALTER TYPE "JobUrgency_new" RENAME TO "JobUrgency";
