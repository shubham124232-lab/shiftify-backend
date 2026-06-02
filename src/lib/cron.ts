// Background cron jobs — implemented with setInterval (no external dependency).
// Runs in-process. For multi-instance deployments, move to a dedicated worker.

import { prisma } from "./prisma";

const HOUR_MS = 60 * 60 * 1000;

// ─── Guest window expiry ──────────────────────────────────────────────────────
// Users with an expired guestUntil are moved to SUSPENDED.
// APPROVED/ACTIVE accounts that completed the funnel are excluded.

async function expireGuestWindows(): Promise<void> {
  try {
    // Only suspend PENDING/ACTIVE users — APPROVED accounts are through the funnel
    // and must never be caught by this sweep.
    const result = await prisma.user.updateMany({
      where: {
        guestUntil: { lte: new Date() },
        status:     { in: ["PENDING", "ACTIVE"] },
      },
      data: { status: "SUSPENDED" },
    });
    if (result.count > 0) {
      console.log(`[cron] Suspended ${result.count} expired guest account(s)`);
    }
  } catch (err) {
    console.error("[cron] expireGuestWindows error:", err);
  }
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

export function startCronJobs(): void {
  // Run immediately on startup then every hour
  void expireGuestWindows();
  setInterval(() => void expireGuestWindows(), HOUR_MS);
  console.log("[cron] Background jobs started (guest expiry: every 1h)");
}
