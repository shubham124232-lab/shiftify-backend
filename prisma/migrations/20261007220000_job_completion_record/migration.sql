-- SW journey Windows 38-41: the worker's completion record (actual time, services, note, incident flag, own payment status).
ALTER TABLE "SupportRequest"
  ADD COLUMN "completionRecord" JSONB;
