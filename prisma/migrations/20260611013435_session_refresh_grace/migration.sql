-- Add a short-lived "previous refresh token" grace window to Session, so that
-- two near-simultaneous refresh requests using the same now-rotated token
-- don't both fail with "Session not found".
ALTER TABLE "Session" ADD COLUMN "previousRefreshTokenHash" TEXT;
ALTER TABLE "Session" ADD COLUMN "previousRefreshTokenExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Session_previousRefreshTokenHash_key" ON "Session"("previousRefreshTokenHash");
