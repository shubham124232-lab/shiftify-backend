-- Provider doc PR-LV04 respectful notice to responders when a request is filled (additive only)
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REQUEST_FILLED';
