-- Provider doc PR-N01 "proposal viewed" notification (additive only)
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'JOB_APPLICATION_VIEWED';
