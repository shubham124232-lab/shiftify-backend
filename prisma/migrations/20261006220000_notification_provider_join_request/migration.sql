-- Provider doc PR-MR02 request to join an existing Provider organisation (additive only)
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PROVIDER_JOIN_REQUEST';
