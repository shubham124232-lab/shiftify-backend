// dashboard.service.ts — role-aware dashboard feed (GET /dashboard).
// Returns real DB data. One call, one response per role.

import { prisma } from "../../lib/prisma";
import type { UserRole } from "@prisma/client";
import type { JobStatus } from "@prisma/client";

const JOB_SUMMARY = {
  id: true, title: true, category: true, urgency: true,
  suburb: true, state: true, scheduledStartAt: true, totalHours: true,
  status: true, createdAt: true,
} as const;

export async function getSummary(userId: string, activeRole: UserRole) {
  switch (activeRole) {
    case "SUPPORT_WORKER": return workerDashboard(userId);
    case "PARTICIPANT":    return participantDashboard(userId);
    case "COORDINATOR":    return coordinatorDashboard(userId);
    case "PROVIDER":       return providerDashboard(userId);
    case "PLAN_MANAGER":   return planManagerDashboard(userId);
    case "ADMIN":          return adminDashboard();
    default:               return { role: activeRole as string };
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

// "Upcoming" = an assigned shift that has not started yet, or one already underway.
// (A shift moves ASSIGNED → IN_PROGRESS when it starts, so an IN_PROGRESS shift can
// never have a start time in the future — filtering both by start >= now hid them all.)
function upcomingWhere(now: Date) {
  return {
    OR: [
      { status: "ASSIGNED" as const, scheduledStartAt: { gte: now } },
      { status: "IN_PROGRESS" as const },
    ],
  };
}

// Same "party to the job" rule the messages endpoints enforce (getMessages).
function messagePartyWhere(userId: string) {
  return {
    OR: [
      { postedByUserId: userId },
      { forParticipantUserId: userId },
      { selectedApplicantUserId: userId },
      { assignedWorkerUserId: userId },
      { applications: { some: { applicantUserId: userId } } },
    ],
  };
}

// Real unread job-message count (messages from other people newer than the
// reader's lastReadAt for that thread, archived threads excluded) — not notifications.
export async function countUnreadMessages(userId: string): Promise<number> {
  const states = await prisma.jobMessageThreadState.findMany({
    where:  { userId },
    select: { jobId: true, lastReadAt: true, archived: true },
  });
  const archivedIds = states.filter((s) => s.archived).map((s) => s.jobId);
  const readStates  = states.filter((s) => !s.archived && s.lastReadAt);
  return prisma.jobMessage.count({
    where: {
      senderUserId: { not: userId },
      job: { AND: [messagePartyWhere(userId), { id: { notIn: archivedIds } }] },
      OR: [
        { jobId: { notIn: [...archivedIds, ...readStates.map((s) => s.jobId)] } },
        ...readStates.map((s) => ({ jobId: s.jobId, createdAt: { gt: s.lastReadAt as Date } })),
      ],
    },
  });
}

// ── Support Worker ────────────────────────────────────────────────────────────

async function workerDashboard(userId: string) {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const workerFilter = [{ selectedApplicantUserId: userId }, { assignedWorkerUserId: userId }];

  // Open jobs this worker could be matched to: visible to workers, not their own
  // posts (multi-role accounts), and not ones they have hidden.
  const matchedWhere = {
    status: "OPEN" as const,
    postedByUserId: { not: userId },
    OR: [{ visibilityTarget: "ALL" }, { visibilityTarget: "VERIFIED" }, { visibilityTarget: "WORKERS_ONLY" }, { visibilityTarget: null }],
    bookmarks: { none: { workerUserId: userId, hidden: true } },
  };

  const [
    upcomingShifts,
    allApplications,
    matchedJobs,
    matchedJobCount,
    completedThisWeek,
    savedJobs,
    unreadMessages,
    unreadNotifications,
    upcomingShiftCount,
    activeApplicationCount,
    confirmedShifts,
    availableNowRow,
  ] = await Promise.all([
    prisma.supportRequest.findMany({
      where: { AND: [{ OR: workerFilter }, upcomingWhere(now)] },
      select: { ...JOB_SUMMARY, budgetPerHour: true, isRecurring: true },
      orderBy: { scheduledStartAt: "asc" },
      take: 5,
    }),
    prisma.jobApplication.findMany({
      where: { applicantUserId: userId, status: { not: "WITHDRAWN" } },
      include: {
        job: {
          select: { ...JOB_SUMMARY, budgetPerHour: true, isRecurring: true, shiftType: true, workerConfirmedAt: true, _count: { select: { applications: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.supportRequest.findMany({
      where: matchedWhere,
      select: { ...JOB_SUMMARY, budgetPerHour: true, isRecurring: true, shiftType: true, durationType: true, serviceDeliveryMode: true, hideParticipantName: true, postedByUserId: true, _count: { select: { applications: true } } },
      orderBy: [{ urgency: "asc" }, { createdAt: "desc" }],
      take: 20,
    }),
    prisma.supportRequest.count({ where: matchedWhere }),
    prisma.supportRequest.aggregate({
      where: { OR: workerFilter, status: { in: ["COMPLETED", "CONFIRMED"] }, scheduledStartAt: { gte: weekStart } },
      _sum: { totalHours: true },
    }),
    // Bookmarked ("Saved") jobs — the same JobBookmark rows the Saved tab reads.
    prisma.jobBookmark.count({ where: { workerUserId: userId, saved: true } }),
    countUnreadMessages(userId),
    prisma.notification.count({ where: { userId, read: false } }),
    prisma.supportRequest.count({ where: { AND: [{ OR: workerFilter }, upcomingWhere(now)] } }),
    prisma.jobApplication.count({
      where: { applicantUserId: userId, NOT: { status: { in: ["WITHDRAWN", "DECLINED", "REQUEST_FILLED"] } } },
    }),
    prisma.supportRequest.count({ where: { OR: workerFilter, status: { in: ["CONFIRMED", "COMPLETED"] } } }),
    prisma.workerProfile.findUnique({ where: { userId }, select: { isAvailableNow: true, availableNowUntil: true } }),
  ]);

  // totalHours is a Prisma Decimal — Number() converts it (typeof === "number" never held).
  const hoursThisWeek = Number(completedThisWeek._sum.totalHours ?? 0);

  return {
    role: "SUPPORT_WORKER" as const,
    stats: {
      upcomingShifts:     upcomingShiftCount,
      activeApplications: activeApplicationCount,
      matchedJobs:        matchedJobCount,
      hoursThisWeek:      Math.round(hoursThisWeek * 10) / 10,
      completedShifts:    confirmedShifts,
      savedJobs,
      unreadMessages,
    },
    upcomingShifts,
    allApplications: allApplications.map((a) => ({
      applicationId: a.id,
      status:        a.status,
      createdAt:     a.createdAt,
      note:          a.note,
      rateResponse:  a.rateResponse,
      proposedRate:  a.proposedRate,
      job:           a.job,
    })),
    pendingApplications: allApplications
      .filter((a) => a.status === "INTERESTED")
      .map((a) => ({ applicationId: a.id, status: a.status, job: a.job })),
    // Only live decisions: shortlisted on a still-open request, or selected and waiting for this worker to accept.
    shortlistedApplications: allApplications
      .filter((a) =>
        (a.status === "SHORTLISTED" && a.job.status === "OPEN")
        || (a.status === "SELECTED" && a.job.status === "ASSIGNED" && !a.job.workerConfirmedAt))
      .map((a) => ({ applicationId: a.id, status: a.status, job: a.job })),
    matchedJobs,
    availableNow: {
      isAvailableNow:    availableNowRow?.isAvailableNow ?? false,
      availableNowUntil: availableNowRow?.availableNowUntil ?? null,
    },
    unreadNotifications,
  };
}

// ── Participant ───────────────────────────────────────────────────────────────

async function participantDashboard(userId: string) {
  const now = new Date();
  const pOR = [{ forParticipantUserId: userId }, { postedByUserId: userId }];
  const upcoming = { AND: [{ OR: pOR }, upcomingWhere(now)] };

  const [
    openJobs,
    openCount,
    upcomingShifts,
    upcomingCount,
    awaitingConfirmation,
    awaitingCount,
    draftCount,
    recurringCount,
    urgentCount,
    confirmedCount,
    unreadMessages,
    unreadNotifications,
    applicationsReceived,
  ] = await Promise.all([
    prisma.supportRequest.findMany({ where: { OR: pOR, status: "OPEN" }, select: JOB_SUMMARY, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.supportRequest.count({ where: { OR: pOR, status: "OPEN" } }),
    prisma.supportRequest.findMany({ where: upcoming, select: JOB_SUMMARY, orderBy: { scheduledStartAt: "asc" }, take: 5 }),
    prisma.supportRequest.count({ where: upcoming }),
    prisma.supportRequest.findMany({ where: { OR: pOR, status: "COMPLETED" }, select: JOB_SUMMARY, orderBy: { completedAt: "desc" }, take: 5 }),
    prisma.supportRequest.count({ where: { OR: pOR, status: "COMPLETED" } }),
    prisma.supportRequest.count({ where: { OR: pOR, status: "DRAFT" } }),
    prisma.supportRequest.count({ where: { OR: pOR, isRecurring: true, status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] } } }),
    prisma.supportRequest.count({ where: { OR: pOR, urgency: "RAPID", status: "OPEN" } }),
    prisma.supportRequest.count({ where: { OR: pOR, status: "CONFIRMED" } }),
    countUnreadMessages(userId),
    prisma.notification.count({ where: { userId, read: false } }),
    prisma.jobApplication.count({
      where: {
        job: { OR: [{ forParticipantUserId: userId }, { postedByUserId: userId }], status: { in: ["OPEN", "ASSIGNED"] } },
        status: { in: ["INTERESTED", "SHORTLISTED"] },
      },
    }),
  ]);

  return {
    role: "PARTICIPANT" as const,
    stats: {
      activeRequests:       openCount,
      applicationsReceived: applicationsReceived,
      confirmedSupports:    confirmedCount,
      upcomingBookings:     upcomingCount,
      awaitingConfirmation: awaitingCount,
      urgentRequests:       urgentCount,
      draftRequests:        draftCount,
      unreadMessages,
      recurringSupports:    recurringCount,
    },
    openJobs,
    upcomingShifts,
    awaitingConfirmation,
    unreadNotifications,
  };
}

// ── Coordinator ───────────────────────────────────────────────────────────────

async function coordinatorDashboard(userId: string) {
  const now = new Date();
  const mine = { postedByUserId: userId };
  const upcoming = { AND: [mine, upcomingWhere(now)] };
  const [
    openJobs, openCount, upcomingShifts, upcomingCount, awaitingConfirmation, awaitingCount,
    managedParticipantCount, unreadMessages, unreadNotifications,
  ] = await Promise.all([
    prisma.supportRequest.findMany({ where: { ...mine, status: "OPEN" }, select: JOB_SUMMARY, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.supportRequest.count({ where: { ...mine, status: "OPEN" } }),
    prisma.supportRequest.findMany({ where: upcoming, select: JOB_SUMMARY, orderBy: { scheduledStartAt: "asc" }, take: 5 }),
    prisma.supportRequest.count({ where: upcoming }),
    prisma.supportRequest.findMany({ where: { ...mine, status: "COMPLETED" }, select: JOB_SUMMARY, orderBy: { completedAt: "desc" }, take: 5 }),
    prisma.supportRequest.count({ where: { ...mine, status: "COMPLETED" } }),
    prisma.user.count({ where: { parentUserId: userId, accountType: "MANAGED", roles: { some: { role: "PARTICIPANT" } } } }),
    countUnreadMessages(userId),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);

  const [draftCount, urgentCount, unfilledCount] = await Promise.all([
    prisma.supportRequest.count({ where: { postedByUserId: userId, status: "DRAFT" } }),
    prisma.supportRequest.count({ where: { postedByUserId: userId, urgency: "RAPID", status: "OPEN" } }),
    prisma.supportRequest.count({ where: { postedByUserId: userId, status: "OPEN", applications: { none: {} } } }),
  ]);

  return {
    role: "COORDINATOR" as const,
    stats: {
      activeRequests:       openCount,
      draftRequests:        draftCount,
      urgentRequests:       urgentCount,
      unfilledRequests:     unfilledCount,
      upcomingShifts:       upcomingCount,
      awaitingConfirmation: awaitingCount,
      managedParticipants:  managedParticipantCount,
      unreadMessages,
    },
    openJobs,
    upcomingShifts,
    awaitingConfirmation,
    managedParticipantCount,
    unreadNotifications,
  };
}

// ── Provider ──────────────────────────────────────────────────────────────────
// A Provider is two things at once, and the dashboard keeps them apart:
//   • poster   — staffing requests it posted (postedByUserId) and the responses to them
//   • supplier — opportunities it responded to / was selected for (applicantUserId / selectedApplicantUserId)

async function providerDashboard(userId: string) {
  const now = new Date();
  // Responses *received* on the Provider's own requests (not withdrawn/declined).
  const incoming = {
    job: { postedByUserId: userId },
    status: { notIn: ["WITHDRAWN", "DECLINED", "REQUEST_FILLED"] as ("WITHDRAWN" | "DECLINED" | "REQUEST_FILLED")[] },
  };
  const awaitingAllocation = { selectedApplicantUserId: userId, status: "ASSIGNED" as const, assignedWorkerUserId: null };
  const active = { AND: [{ selectedApplicantUserId: userId }, upcomingWhere(now)] };

  const [
    workerResponses,
    workerResponseCount,
    newResponseCount,
    shortlistedCount,
    myRequests,
    openRequestCount,
    requestsWithResponses,
    pendingExpressions,
    outgoingPendingCount,
    activeShifts,
    unassignedAccepted,
    unassignedCount,
    confirmedIntakesCount,
    unreadMessages,
    unreadNotifications,
  ] = await Promise.all([
    prisma.jobApplication.findMany({
      where: incoming,
      include: {
        job: { select: JOB_SUMMARY },
        applicant: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.jobApplication.count({ where: incoming }),
    prisma.jobApplication.count({ where: { job: { postedByUserId: userId }, status: "INTERESTED" } }),
    prisma.jobApplication.count({ where: { job: { postedByUserId: userId }, status: "SHORTLISTED" } }),
    prisma.supportRequest.findMany({ where: { postedByUserId: userId, status: "OPEN" }, select: JOB_SUMMARY, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.supportRequest.count({ where: { postedByUserId: userId, status: "OPEN" } }),
    prisma.supportRequest.count({ where: { postedByUserId: userId, applications: { some: { status: incoming.status } } } }),
    prisma.jobApplication.findMany({ where: { applicantUserId: userId, status: "INTERESTED" }, include: { job: { select: JOB_SUMMARY } }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.jobApplication.count({ where: { applicantUserId: userId, status: "INTERESTED" } }),
    prisma.supportRequest.findMany({ where: active, select: JOB_SUMMARY, orderBy: { scheduledStartAt: "asc" }, take: 5 }),
    prisma.supportRequest.findMany({ where: awaitingAllocation, select: JOB_SUMMARY, orderBy: { scheduledStartAt: "asc" }, take: 5 }),
    prisma.supportRequest.count({ where: awaitingAllocation }),
    prisma.supportRequest.count({ where: { selectedApplicantUserId: userId, status: { in: ["CONFIRMED", "COMPLETED"] } } }),
    countUnreadMessages(userId),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);

  return {
    role: "PROVIDER" as const,
    stats: {
      // Incoming responses on the Provider's own requests.
      newEnquiries:          newResponseCount,
      shortlistedCount,
      // Own requests that have received at least one response.
      matchedRequests:       requestsWithResponses,
      confirmedIntakes:      confirmedIntakesCount,
      unfilledWorkforceGaps: unassignedCount,
      unreadMessages,
      // Additive fields.
      openRequests:          openRequestCount,
      responsesReceived:     workerResponseCount,
      outgoingPendingApplications: outgoingPendingCount,
    },
    // Responses to the Provider's own requests (what the "Worker responses" card shows).
    workerResponses: workerResponses.map((a) => ({
      applicationId: a.id,
      status:        a.status,
      applicantName: a.applicant.name,
      job:           a.job,
    })),
    myRequests,
    // The Provider's OWN outgoing expressions of interest on other people's requests.
    pendingExpressions: pendingExpressions.map((a) => ({ applicationId: a.id, job: a.job })),
    activeShifts,
    unassignedAccepted,
    unreadNotifications,
  };
}

// ── Plan Manager ──────────────────────────────────────────────────────────────

async function planManagerDashboard(userId: string) {
  const [recentInvoices, connectionCounts, unreadMessages, unreadNotifications] = await Promise.all([
    prisma.invoice.findMany({
      where: { planManagerUserId: userId },
      orderBy: { sentAt: "desc" },
      take: 10,
      include: {
        sender:      { select: { id: true, name: true } },
        participant: { select: { id: true, name: true } },
        job:         { select: { id: true, title: true, suburb: true, scheduledStartAt: true } },
      },
    }),
    prisma.planManagerConnection.groupBy({ by: ["status"], where: { planManagerUserId: userId }, _count: { _all: true } }),
    countUnreadMessages(userId),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);

  const counts: Record<string, number> = {};
  for (const row of connectionCounts) {
    counts[row.status] = row._count._all;
  }

  const acceptedConns = await prisma.planManagerConnection.findMany({
    where: { planManagerUserId: userId, status: "ACCEPTED" },
    select: { clientUserId: true },
  });
  const clientIds = acceptedConns.map((c) => c.clientUserId);

  let openReferrals = 0;
  let urgentReferrals = 0;
  let unfilledReferrals = 0;

  if (clientIds.length > 0) {
    const idFilter = { in: clientIds };
    const refs = await Promise.all([
      prisma.supportRequest.count({ where: { forParticipantUserId: idFilter, status: "OPEN" } }),
      prisma.supportRequest.count({ where: { forParticipantUserId: idFilter, urgency: "RAPID", status: "OPEN" } }),
      prisma.supportRequest.count({ where: { forParticipantUserId: idFilter, status: "OPEN", applications: { none: {} } } }),
    ]);
    openReferrals = refs[0];
    urgentReferrals = refs[1];
    unfilledReferrals = refs[2];
  }

  return {
    role: "PLAN_MANAGER" as const,
    stats: {
      activeParticipantCases: counts["ACCEPTED"] ?? 0,
      openReferrals,
      urgentReferrals,
      unfilledReferrals,
      recentInvoiceCount: recentInvoices.length,
      unreadMessages,
    },
    recentInvoices,
    connectionCounts: {
      pending:  counts["PENDING"]  ?? 0,
      accepted: counts["ACCEPTED"] ?? 0,
      declined: counts["DECLINED"] ?? 0,
    },
    unreadNotifications,
  };
}

// ── Admin ─────────────────────────────────────────────────────────────────────

async function adminDashboard() {
  const activeStatuses: JobStatus[] = [
  "OPEN",
  "DRAFT",
  "ASSIGNED",
  "IN_PROGRESS",
];

  const [pendingUsers, totalUsers, openJobs, activeJobs, urgentJobs, completedToday, totalInvoices] = await Promise.all([
    prisma.user.count({ where: { status: "PENDING" } }),
    prisma.user.count(),
    prisma.supportRequest.count({ where: { status: "OPEN" } }),
    prisma.supportRequest.count({ where: { status: { in: activeStatuses } } }),
    prisma.supportRequest.count({ where: { status: "OPEN", urgency: "RAPID" } }),
    prisma.supportRequest.count({ where: { status: "CONFIRMED", confirmedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
    prisma.invoice.count(),
  ]);

  return {
    role: "ADMIN" as const,
    stats: { pendingUsers, totalUsers, openJobs, activeJobs, urgentJobs, completedToday, totalInvoices },
  };
}
