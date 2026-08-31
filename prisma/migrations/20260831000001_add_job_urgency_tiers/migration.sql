-- Add the 2 new JobUrgency values needed for the 4-tier model (Rapid/Urgent/
-- Last-Minute/Routine). Split into its own migration because Postgres does
-- not allow a newly-added enum value to be used by DML in the same
-- transaction it was added in (pre-PG12 safety; harmless on newer versions).
ALTER TYPE "JobUrgency" ADD VALUE IF NOT EXISTS 'URGENT';
ALTER TYPE "JobUrgency" ADD VALUE IF NOT EXISTS 'ROUTINE';
