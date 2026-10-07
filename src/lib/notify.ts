// notify.ts — mock sender adapter (Phase 1).
//
// In production these stubs are replaced by real providers (Resend / Twilio / FCM).
// The _dev_* fields are ONLY returned when NODE_ENV !== "production".
// sendPushNotification always writes a Notification row regardless of environment.

import { prisma } from "./prisma";
import { devCodesEnabled, devInboxEnabled } from "../config/env";
import type { NotificationType } from "@prisma/client";

// SW doc Window 46 — coarse category each NotificationType rolls up into, for
// the user's opt-in preference checkboxes. Safety-critical types bypass
// preferences entirely (see FORCE_SEND below) rather than being categorized.
type PreferenceCategory = "jobUpdates" | "messages" | "connectionsAndInvites" | "marketingTips";

const FORCE_SEND: ReadonlySet<NotificationType> = new Set<NotificationType>([
  "EMERGENCY_NEARBY", "INCIDENT_REPORTED",
]);

const CATEGORY_BY_TYPE: Partial<Record<NotificationType, PreferenceCategory>> = {
  NEW_JOB_NEARBY: "jobUpdates", JOB_APPLICATION_RECEIVED: "jobUpdates", JOB_SHORTLISTED: "jobUpdates",
  JOB_SELECTED: "jobUpdates", JOB_ASSIGNED: "jobUpdates", JOB_PRESTART_REMINDER: "jobUpdates",
  JOB_STARTED: "jobUpdates", JOB_COMPLETED: "jobUpdates", JOB_CONFIRMED: "jobUpdates",
  JOB_CANCELLED: "jobUpdates", JOB_PROMOTED_EMERGENCY: "jobUpdates", JOB_ASSIGNMENT_CONFIRMED: "jobUpdates",
  JOB_RUNNING_LATE: "jobUpdates", INVOICE_RECEIVED: "jobUpdates",
  NEW_MESSAGE: "messages", DIRECT_INQUIRY_RECEIVED: "messages",
  PM_CONNECTION_REQUEST: "connectionsAndInvites", PM_CONNECTION_ACCEPTED: "connectionsAndInvites",
  DIRECT_CONNECT_REQUEST: "connectionsAndInvites", DIRECT_CONNECT_RESPONDED: "connectionsAndInvites",
  COORDINATOR_CONNECTION_REQUEST: "connectionsAndInvites", COORDINATOR_CONNECTION_ACCEPTED: "connectionsAndInvites",
  COORDINATOR_CONNECTION_DECLINED: "connectionsAndInvites", COORDINATOR_ENQUIRY_RECEIVED: "connectionsAndInvites",
};

// Bodies carry OTP codes, so they are logged/captured/returned only when the
// fail-safe flags in config/env.ts allow it (local runtime; staging opt-in for responses).
const isDev = devCodesEnabled;
const captureInbox = devInboxEnabled;

// ─── Dev inbox (in-memory, capped at 200 entries) ────────────────────────────

export interface DevInboxEntry {
  kind: "email" | "sms";
  to: string;
  subject?: string;
  body: string;
  sentAt: string;
}

const _devInbox: DevInboxEntry[] = [];
const DEV_INBOX_CAP = 200;

function devLog(entry: DevInboxEntry): void {
  if (!captureInbox) return;
  if (_devInbox.length >= DEV_INBOX_CAP) _devInbox.shift();
  _devInbox.push(entry);
}

export function getDevInbox(): DevInboxEntry[] {
  return [..._devInbox].reverse();
}

// ─── Email ───────────────────────────────────────────────────────────────────

interface DevEmail {
  to: string;
  subject: string;
  body: string;
}

async function sendEmail(
  to: string,
  subject: string,
  body: string,
  _html?: string,
): Promise<{ _dev_email?: DevEmail }> {
  console.log(`[notify:email] to=${to}  subject="${subject}"\n${body}`);
  devLog({ kind: "email", to, subject, body, sentAt: new Date().toISOString() });
  if (isDev) {
    return { _dev_email: { to, subject, body } };
  }
  // Production: plug in Resend / SendGrid / SES here. Pass _html as the html body.
  return {};
}

// ─── SMS ─────────────────────────────────────────────────────────────────────

interface DevSms {
  to: string;
  body: string;
}

async function sendSms(
  to: string,
  body: string,
): Promise<{ _dev_sms?: DevSms }> {
  console.log(`[notify:sms] to=${to}\n${body}`);
  devLog({ kind: "sms", to, body, sentAt: new Date().toISOString() });
  if (isDev) {
    return { _dev_sms: { to, body } };
  }
  // Production: plug in Twilio here.
  return {};
}

// ─── Push / in-app notification ──────────────────────────────────────────────

interface DevNotification {
  userId: string;
  title: string;
  body: string;
}

async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: object,
  type: NotificationType = "REGISTRATION_APPROVED",
): Promise<{ _dev_notification?: DevNotification }> {
  if (!FORCE_SEND.has(type)) {
    const pref = await prisma.notificationPreference.findUnique({ where: { userId } });
    if (pref) {
      const category = CATEGORY_BY_TYPE[type];
      if (!pref.pushEnabled || (category && !pref[category])) {
        return {};
      }
      // Provider doc PR-N02 — quiet hours (Rapid/Urgent exempt), and location/service filters on job alerts.
      const pp = (pref.providerPrefs ?? null) as {
        quietHoursEnabled?: boolean; quietStart?: string; quietEnd?: string; urgentExceptions?: boolean;
        locationFilter?: string[]; serviceFilter?: string[];
        channelByUrgency?: Record<string, string[]>;
      } | null;
      if (pp) {
        const meta = (data ?? {}) as { urgency?: string; suburb?: string; category?: string };
        const fast = meta.urgency === "RAPID" || meta.urgency === "URGENT";
        if (pp.quietHoursEnabled && pp.quietStart && pp.quietEnd && !(fast && pp.urgentExceptions !== false)) {
          const d = new Date();
          const mins = d.getHours() * 60 + d.getMinutes();
          const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
          const s = toMin(pp.quietStart), e = toMin(pp.quietEnd);
          const inQuiet = s <= e ? mins >= s && mins < e : mins >= s || mins < e;
          if (inQuiet) return {};
        }
        const allowed = meta.urgency ? pp.channelByUrgency?.[meta.urgency] : undefined;
        if (allowed && !allowed.includes("PUSH")) return {};
        if (type === "NEW_JOB_NEARBY") {
          if (pp.locationFilter?.length && meta.suburb && !pp.locationFilter.some((l) => l.toLowerCase() === meta.suburb!.toLowerCase())) return {};
          if (pp.serviceFilter?.length && meta.category && !pp.serviceFilter.includes(meta.category)) return {};
        }
      }
    }
  }

  await prisma.notification.create({
    data: { userId, type, title, body, data: data ?? undefined },
  });

  // Provider doc PR-N02 — organisation-wide alerts also reach the assigned administrator, and an unconfirmed
  // fast request escalates to the backup administrator.
  const orgPref = await prisma.notificationPreference.findUnique({ where: { userId }, select: { providerPrefs: true } });
  const orgPp = (orgPref?.providerPrefs ?? null) as { assignedAdminId?: string | null; backupAdminId?: string | null } | null;
  if (orgPp) {
    const extra = [orgPp.assignedAdminId, type === "REQUEST_STARTING_UNCONFIRMED" ? orgPp.backupAdminId : null].filter((x): x is string => !!x && x !== userId);
    for (const adminId of extra) {
      await prisma.notification.create({ data: { userId: adminId, type, title, body, data: data ?? undefined } });
    }
  }

  if (devInboxEnabled) console.log(`[notify:push] userId=${userId}  title="${title}"  body="${body}"`);

  if (isDev) {
    return { _dev_notification: { userId, title, body } };
  }
  // Production: plug in FCM / APNs / Socket.io fan-out here.
  return {};
}

// ─── Exported singleton ───────────────────────────────────────────────────────

export const notify = {
  sendEmail,
  sendSms,
  sendPushNotification,
};
