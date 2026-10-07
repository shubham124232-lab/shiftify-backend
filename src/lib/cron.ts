// Background cron jobs — implemented with setInterval (no external dependency).
// Runs in-process. For multi-instance deployments, move to a dedicated worker.

import { prisma } from "./prisma";
import { notify } from "./notify";
import type { Prisma, UserRole } from "@prisma/client";
import { publishJob } from "../modules/jobs/job.service";
import { hasActiveAddOn } from "../modules/subscriptions/subscription.service";

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

// ─── "Available Now" scheduled start (SW doc Window 22 "Available from") ─────────
async function startScheduledAvailableNow(): Promise<void> {
  try {
    const now = new Date();
    const pending = await prisma.workerProfile.findMany({
      where: { isAvailableNow: false, availableNowSettings: { path: ["scheduledPending"], equals: true } },
      select: { userId: true, availableNowSettings: true, availableNowUntil: true },
    });
    for (const w of pending) {
      const st = w.availableNowSettings as { startsAt?: string | null; paused?: boolean } & Record<string, unknown>;
      if (!st.startsAt || new Date(st.startsAt) > now) continue;
      const settings = { ...st, scheduledPending: false } as Prisma.InputJsonObject;
      const stillWanted = !st.paused && (!w.availableNowUntil || w.availableNowUntil > now)
        && await hasActiveAddOn(w.userId, "SUPPORT_WORKER", "WORKER_AVAILABLE_NOW");
      await prisma.workerProfile.update({
        where: { userId: w.userId },
        data: stillWanted
          ? { isAvailableNow: true, availableNowSetAt: now, availableNowSettings: settings }
          : { availableNowSettings: settings },
      });
    }
  } catch (err) {
    console.error("[cron] startScheduledAvailableNow error:", err);
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
    // Pricing V2 §3.5 — Available Now is a paid add-on; once it lapses (cancelled and
    // past its paid-through date) the badge must not stay on.
    const lapsed = await prisma.workerProfile.updateMany({
      where: {
        isAvailableNow: true,
        user: {
          subscriptions: {
            none: {
              status: "ACTIVE",
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
              plan: { key: { startsWith: "WORKER_AVAILABLE_NOW" } },
            },
          },
        },
      },
      data: { isAvailableNow: false, availableNowSetAt: null, availableNowUntil: null },
    });
    if (lapsed.count > 0) console.log(`[cron] Cleared "Available Now" for ${lapsed.count} worker(s) without the add-on`);
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

// ─── Standard SIL/SDA listing expiry ───────────────────────────────────────────
// Pricing V2 §7.3 item 50 — a 30-day package listing expires automatically unless renewed.

async function closeExpiredStandardListings(): Promise<void> {
  try {
    const result = await (prisma as any).providerListing.updateMany({
      where: { status: "ACTIVE", listingExpiresAt: { lte: new Date() } },
      data:  { status: "CLOSED" },
    });
    if (result.count > 0) console.log(`[cron] Closed ${result.count} expired SIL/SDA listing(s)`);
  } catch (err) {
    console.error("[cron] closeExpiredStandardListings error:", err);
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

// ─── Provider expiry reminders (Provider doc PR-N01) ────────────────────────────
// Insurance / registration / documents of the organisation and its managed workers expiring within 30 days,
// and Home and Living listings within 7. One reminder per item per day.

async function alreadyReminded(userId: string, key: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * HOUR_MS);
  const hit = await prisma.notification.findFirst({
    where: { userId, type: "DOCUMENT_EXPIRING", createdAt: { gte: since }, data: { path: ["key"], equals: key } },
    select: { id: true },
  });
  return !!hit;
}

async function remindProviderExpiries(): Promise<void> {
  try {
    const soon = new Date(Date.now() + 30 * 24 * HOUR_MS);
    const now = new Date();
    const profiles = await prisma.providerProfile.findMany({
      select: { userId: true, publicLiabilityExpiryDate: true, professionalIndemnityExpiryDate: true, workersCompExpiryDate: true },
    });
    for (const p of profiles) {
      const items: [string, Date | null][] = [
        ["public liability insurance", p.publicLiabilityExpiryDate],
        ["professional indemnity insurance", p.professionalIndemnityExpiryDate],
        ["workers compensation insurance", p.workersCompExpiryDate],
      ];
      for (const [label, when] of items) {
        if (!when || when > soon) continue;
        const key = `ins:${label}`;
        if (await alreadyReminded(p.userId, key)) continue;
        const expired = when < now;
        await notify.sendPushNotification(p.userId, expired ? "Insurance expired" : "Insurance expiring soon",
          `Your ${label} ${expired ? "expired" : "expires"} on ${when.toLocaleDateString("en-AU")}.`, { key }, "DOCUMENT_EXPIRING");
      }
    }
    const docs = await prisma.document.findMany({
      where: { expiryDate: { lte: soon }, user: { OR: [{ providerProfile: { isNot: null } }, { parentUserId: { not: null } }] } },
      select: { id: true, docType: true, expiryDate: true, user: { select: { id: true, name: true, parentUserId: true } } },
    });
    for (const d of docs) {
      const owner = d.user.parentUserId ?? d.user.id;
      const key = `doc:${d.id}`;
      if (await alreadyReminded(owner, key)) continue;
      const who = d.user.parentUserId ? `${d.user.name}'s` : "Your";
      await notify.sendPushNotification(owner, "Document expiring",
        `${who} ${d.docType.toLowerCase().replace(/_/g, " ")} ${d.expiryDate! < now ? "has expired" : "expires on " + d.expiryDate!.toLocaleDateString("en-AU")}.`, { key }, "DOCUMENT_EXPIRING");
    }
    const listings = await (prisma as any).providerListing.findMany({
      where: { listingCategory: "HOUSING", status: "ACTIVE", listingExpiresAt: { lte: new Date(Date.now() + 7 * 24 * HOUR_MS) } },
      select: { id: true, title: true, providerUserId: true, listingExpiresAt: true },
    });
    for (const l of listings) {
      const key = `listing:${l.id}`;
      if (await alreadyReminded(l.providerUserId, key)) continue;
      await notify.sendPushNotification(l.providerUserId, "Vacancy listing expiring",
        `"${l.title}" expires on ${new Date(l.listingExpiresAt).toLocaleDateString("en-AU")}.`, { key }, "DOCUMENT_EXPIRING");
    }
  } catch (err) {
    console.error("[cron] remindProviderExpiries error:", err);
  }
}

// ─── Fast request approaching start without confirmation (PR-N01) ────────────────

async function remindUnconfirmedFastRequests(): Promise<void> {
  try {
    const jobs = await prisma.supportRequest.findMany({
      where: {
        status: "OPEN", urgency: { in: ["RAPID", "URGENT"] },
        scheduledStartAt: { gt: new Date(), lte: new Date(Date.now() + 60 * 60 * 1000) },
      },
      select: { id: true, title: true, postedByUserId: true, urgency: true },
    });
    for (const j of jobs) {
      const hit = await prisma.notification.findFirst({
        where: { userId: j.postedByUserId, type: "REQUEST_STARTING_UNCONFIRMED", data: { path: ["jobId"], equals: j.id } },
        select: { id: true },
      });
      if (hit) continue;
      await notify.sendPushNotification(j.postedByUserId, "Request starting soon — no one confirmed",
        `"${j.title}" starts within the hour and no worker is confirmed yet.`, { jobId: j.id, urgency: j.urgency }, "REQUEST_STARTING_UNCONFIRMED");
    }
  } catch (err) {
    console.error("[cron] remindUnconfirmedFastRequests error:", err);
  }
}

// ─── Scheduled publish (PR-C01) ──────────────────────────────────────────────────
// A draft saved with a scheduled publish time (responsePreferences.scheduledPublishAtMs) goes live at that time.
// The schedule is cleared first so a failed attempt never retries in a loop; the poster is told either way.

async function publishScheduledRequests(): Promise<void> {
  try {
    const due = await prisma.supportRequest.findMany({
      where: { status: "DRAFT", responsePreferences: { path: ["scheduledPublishAtMs"], lte: Date.now() } },
      select: { id: true, title: true, postedByUserId: true, responsePreferences: true },
      take: 20,
    });
    for (const j of due) {
      const prefs = (j.responsePreferences ?? {}) as Record<string, unknown>;
      const role = (typeof prefs.scheduledPublishRole === "string" ? prefs.scheduledPublishRole : "PROVIDER") as UserRole;
      const { scheduledPublishAtMs: _at, scheduledPublishRole: _role, ...rest } = prefs;
      await prisma.supportRequest.update({ where: { id: j.id }, data: { responsePreferences: rest as Prisma.InputJsonValue } });
      try {
        await publishJob(j.id, j.postedByUserId, role);
        await notify.sendPushNotification(j.postedByUserId, "Scheduled request is live", `"${j.title}" was published as scheduled.`, { jobId: j.id }, "REQUEST_SCHEDULE_RESULT");
      } catch (e) {
        const why = e instanceof Error ? e.message : "it could not be published";
        await notify.sendPushNotification(j.postedByUserId, "Scheduled request not published", `"${j.title}" stays a draft: ${why}`, { jobId: j.id }, "REQUEST_SCHEDULE_RESULT");
      }
    }
  } catch (err) {
    console.error("[cron] publishScheduledRequests error:", err);
  }
}

// ─── Unfilled urgent requests (Provider exceptions: no Rapid match) ─────────────────
// An OPEN Rapid/Urgent/Last-Minute request whose start passed 30+ minutes ago with nobody selected is closed
// (no reliability penalty) so it stops showing as live, and the poster is told how to try again.

async function closeUnfilledFastRequests(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
    const stale = await prisma.supportRequest.findMany({
      where: { status: "OPEN", urgency: { in: ["RAPID", "URGENT", "LAST_MINUTE"] }, scheduledStartAt: { lt: cutoff } },
      select: { id: true, title: true, postedByUserId: true },
      take: 50,
    });
    for (const j of stale) {
      await prisma.$transaction([
        prisma.supportRequest.update({ where: { id: j.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "Expired — the start time passed with no confirmed worker." } }),
        prisma.jobApplication.updateMany({ where: { jobId: j.id, status: { in: ["INTERESTED", "SHORTLISTED"] } }, data: { status: "REQUEST_FILLED" } }),
      ]);
      await notify.sendPushNotification(j.postedByUserId, "Request closed — no one confirmed",
        `"${j.title}" reached its start time without a confirmed worker, so it was closed. Open it and use "Duplicate as new request" to try again with a wider radius or a new time. Shiftify is not an emergency service.`,
        { jobId: j.id }, "JOB_CANCELLED");
    }
  } catch (err) {
    console.error("[cron] closeUnfilledFastRequests error:", err);
  }
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

export function startCronJobs(): void {
  // Run immediately on startup then every hour
  void expireGuestWindows();
  void clearExpiredAvailableNow();
  void startScheduledAvailableNow();
  setInterval(() => void startScheduledAvailableNow(), 5 * 60 * 1000);
  void clearExpiredFeaturedShifts();
  void clearExpiredFeaturedListings();
  void closeExpiredStandardListings();
  setInterval(() => void expireGuestWindows(), HOUR_MS);
  setInterval(() => void clearExpiredAvailableNow(), HOUR_MS);
  setInterval(() => void clearExpiredFeaturedShifts(), HOUR_MS);
  setInterval(() => void clearExpiredFeaturedListings(), HOUR_MS);
  setInterval(() => void closeExpiredStandardListings(), HOUR_MS);
  void remindProviderExpiries();
  void remindUnconfirmedFastRequests();
  setInterval(() => void remindProviderExpiries(), 6 * HOUR_MS);
  setInterval(() => void remindUnconfirmedFastRequests(), 10 * 60 * 1000);
  setInterval(() => void publishScheduledRequests(), 60 * 1000);
  void closeUnfilledFastRequests();
  setInterval(() => void closeUnfilledFastRequests(), 10 * 60 * 1000);
  console.log("[cron] Background jobs started (guest expiry + available-now clear + featured-shift/listing expiry: every 1h)");
}
