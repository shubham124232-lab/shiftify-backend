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

// ─── "Available Now" 24h auto-clear ───────────────────────────────────────────
// Workers who flip isAvailableNow lose the badge 24h after setting it, so the
// $24.99 add-on keeps signaling genuine right-now availability rather than a
// flag someone forgot to turn off.

async function clearExpiredAvailableNow(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 24 * HOUR_MS);
    const now    = new Date();
    const result = await prisma.workerProfile.updateMany({
      where: {
        isAvailableNow: true,
        OR: [
          { availableNowUntil: { lte: now } },
          { availableNowUntil: null, availableNowSetAt: { lte: cutoff } },
        ],
      },
      data: { isAvailableNow: false, availableNowSetAt: null, availableNowUntil: null },
    });
    if (result.count > 0) {
      console.log(`[cron] Cleared "Available Now" for ${result.count} worker(s)`);
    }
  } catch (err) {
    console.error("[cron] clearExpiredAvailableNow error:", err);
  }
}

// ─── Featured Shift expiry ─────────────────────────────────────────────────────
// Pricing V2 §8 — a Featured Shift purchase pins/labels a job for its tier's
// max duration or until filled, whichever is first. Clearing featuredUntil once
// it's passed keeps job-listing sort order correct without a runtime "is this
// still in the future" check on every query.

async function clearExpiredFeaturedShifts(): Promise<void> {
  try {
    const result = await prisma.supportRequest.updateMany({
      where: { featuredUntil: { lte: new Date() } },
      data:  { featuredUntil: null },
    });
    if (result.count > 0) {
      console.log(`[cron] Cleared expired Featured Shift on ${result.count} job(s)`);
    }
  } catch (err) {
    console.error("[cron] clearExpiredFeaturedShifts error:", err);
  }
}

// ─── Featured Listing expiry ────────────────────────────────────────────────────
// Pricing V2 §7.3 item 46 — when a Featured SIL/SDA listing expires, it drops
// out and the next one in the same suburb+category queue moves up automatically.

async function clearExpiredFeaturedListings(): Promise<void> {
  try {
    const expired = await (prisma as any).providerListing.findMany({
      where: { isFeatured: true, featuredExpiresAt: { lte: new Date() } },
      select: { id: true, suburb: true, listingCategory: true },
    });
    if (expired.length === 0) return;

    await (prisma as any).providerListing.updateMany({
      where: { id: { in: expired.map((l: any) => l.id) } },
      data:  { isFeatured: false, featuredSince: null, featuredExpiresAt: null, featuredQueuePosition: null },
    });

    const groups = new Map<string, { suburb: string; listingCategory: string }>();
    for (const l of expired) groups.set(`${l.suburb}::${l.listingCategory}`, l);
    for (const { suburb, listingCategory } of groups.values()) {
      const remaining = await (prisma as any).providerListing.findMany({
        where: { suburb, listingCategory, isFeatured: true, status: "ACTIVE" },
        orderBy: { featuredSince: "asc" },
      });
      await prisma.$transaction(
        remaining.map((l: any, i: number) =>
          (prisma as any).providerListing.update({ where: { id: l.id }, data: { featuredQueuePosition: i + 1 } }),
        ),
      );
    }
    console.log(`[cron] Cleared expired Featured Listing on ${expired.length} listing(s)`);
  } catch (err) {
    console.error("[cron] clearExpiredFeaturedListings error:", err);
  }
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

export function startCronJobs(): void {
  // Run immediately on startup then every hour
  void expireGuestWindows();
  void clearExpiredAvailableNow();
  void clearExpiredFeaturedShifts();
  void clearExpiredFeaturedListings();
  setInterval(() => void expireGuestWindows(), HOUR_MS);
  setInterval(() => void clearExpiredAvailableNow(), HOUR_MS);
  setInterval(() => void clearExpiredFeaturedShifts(), HOUR_MS);
  setInterval(() => void clearExpiredFeaturedListings(), HOUR_MS);
  console.log("[cron] Background jobs started (guest expiry + available-now clear + featured-shift/listing expiry: every 1h)");
}
