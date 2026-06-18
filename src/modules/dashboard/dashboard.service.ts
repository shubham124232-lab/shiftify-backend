// dashboard.service.ts — role-aware dashboard feed (GET /dashboard).
// Returns real DB data. One call, one response per role.

import { prisma } from "../../lib/prisma";
import type { UserRole } from "@prisma/client";

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

// ── Support Worker ────────────────────────────────────────────────────────────

async function workerDashboard(userId: string) {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const workerFilter = [{ selectedApplicantUserId: userId }, { assignedWorkerUserId: userId }];

  const [
    upcomingShifts,
    allApplications,
    matchedJobs,
    completedThisWeek,
    savedJobs,
    unreadNotifications,
    upcomingShiftCount,
    activeApplicationCount,
    confirmedShifts,
  ] = await Promise.all([
    prisma.supportRequest.findMany({
      where: { OR: workerFilter, status: { in: ["ASSIGNED", "IN_PROGRESS"] }, scheduledStartAt: { gte: now } },
      select: { ...JOB_SUMMARY, budgetPerHour: true, isRecurring: true },
      orderBy: { scheduledStartAt: "asc" },
      take: 5,
    }),
    prisma.jobApplication.findMany({
      where: { applicantUserId: userId, status: { not: "WITHDRAWN" } },
      include: {
        job: {
          select: { ...JOB_SUMMARY, budgetPerHour: true, isRecurring: true, shiftType: true, _count: { select: { applications: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.supportRequest.findMany({
      where: {
        status: "OPEN",
        OR: [{ visibilityTarget: "ALL" }, { visibilityTarget: "VERIFIED" }, { visibilityTarget: "WORKERS_ONLY" }, { visibilityTarget: null }],
      },
      select: { ...JOB_SUMMARY, budgetPerHour: true, isRecurring: true, shiftType: true, durationType: true, serviceDeliveryMode: true, hideParticipantName: true, postedByUserId: true, _count: { select: { applications: true } } },
      orderBy: [{ urgency: "asc" }, { createdAt: "desc" }],
      take: 20,
    }),
    prisma.supportRequest.findMany({
      where: { OR: workerFilter, status: { in: ["COMPLETED", "CONFIRMED"] }, scheduledStartAt: { gte: weekStart } },
      select: { totalHours: true },
    }),
    prisma.jobApplication.count({ where: { applicantUserId: userId, status: "INTERESTED" } }),
    prisma.notification.count({ where: { userId, read: false } }),
    prisma.supportRequest.count({
      where: { OR: workerFilter, status: { in: ["ASSIGNED", "IN_PROGRESS"] }, scheduledStartAt: { gte: now } },
    }),
    prisma.jobApplication.count({
      where: { applicantUserId: userId, NOT: { status: { in: ["WITHDRAWN", "DECLINED"] } } },
    }),
    prisma.supportRequest.count({ where: { OR: workerFilter, status: { in: ["CONFIRMED", "COMPLETED"] } } }),
  ]);

  const hoursThisWeek = completedThisWeek.reduce(
    (sum, s) => sum + (typeof s.totalHours === "number" ? s.totalHours : 0),
    0,
  );

  return {
    role: "SUPPORT_WORKER" as const,
    stats: {
      upcomingShifts:     upcomingShiftCount,
      activeApplications: activeApplicationCount,
      matchedJobs:        matchedJobs.length,
      hoursThisWeek:      Math.round(hoursThisWeek * 10) / 10,
      completedShifts:    confirmedShifts,
      savedJobs,
      unreadMessages:     unreadNotifications,
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
    shortlistedApplications: allApplications
      .filter((a) => ["SHORTLISTED", "SELECTED"].includes(a.status))
      .map((a) => ({ applicationId: a.id, status: a.status, job: a.job })),
    matchedJobs,
    unreadNotifications,
  };
}

// ── Participant ───────────────────────────────────────────────────────────────

async function participantDashboard(userId: string) {
  const now = new Date();
  const pOR = [{ forParticipantUserId: userId }, { postedByUserId: userId }];

  const [
    openJobs,
    upcomingShifts,
    awaitingConfirmation,
    draftCount,
    recurringCount,
    urgentCount,
    confirmedCount,
    unreadNotifications,
    applicationsReceived,
  ] = await Promise.all([
    prisma.supportRequest.findMany({ where: { OR: pOR, status: "OPEN" }, select: JOB_SUMMARY, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.supportRequest.findMany({
      where: { OR: pOR, status: { in: ["ASSIGNED", "IN_PROGRESS", "CONFIRMED"] }, scheduledStartAt: { gte: now } },
      select: JOB_SUMMARY, orderBy: { scheduledStartAt: "asc" }, take: 5,
    }),
    prisma.supportRequest.findMany({ where: { OR: pOR, status: "COMPLETED" }, select: JOB_SUMMARY, orderBy: { completedAt: "desc" }, take: 5 }),
    prisma.supportRequest.count({ where: { OR: pOR, status: "DRAFT" } }),
    prisma.supportRequest.count({ where: { OR: pOR, isRecurring: true, status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] } } }),
    prisma.supportRequest.count({ where: { OR: pOR, urgency: "EMERGENCY", status: "OPEN" } }),
    prisma.supportRequest.count({ where: { OR: pOR, status: "CONFIRMED" } }),
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
      activeRequests:       openJobs.length,
      applicationsReceived: applicationsReceived,
      confirmedSupports:    confirmedCount,
      upcomingBookings:     upcomingShifts.length,
      urgentRequests:       urgentCount,
      draftRequests:        draftCount,
      unreadMessages:       unreadNotifications,
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
  const [openJobs, upcomingShifts, awaitingConfirmation, managedParticipantCount, unreadNotifications] = await Promise.all([
    prisma.supportRequest.findMany({ where: { postedByUserId: userId, status: "OPEN" }, select: JOB_SUMMARY, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.supportRequest.findMany({ where: { postedByUserId: userId, status: "IN_PROGRESS", scheduledStartAt: { gte: now } }, select: JOB_SUMMARY, orderBy: { scheduledStartAt: "asc" }, take: 5 }),
    prisma.supportRequest.findMany({ where: { postedByUserId: userId, status: "COMPLETED" }, select: JOB_SUMMARY, orderBy: { completedAt: "desc" }, take: 5 }),
    prisma.user.count({ where: { parentUserId: userId, accountType: "MANAGED", roles: { some: { role: "PARTICIPANT" } } } }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);

  const [draftCount, urgentCount, unfilledCount] = await Promise.all([
    prisma.supportRequest.count({ where: { postedByUserId: userId, status: "DRAFT" } }),
    prisma.supportRequest.count({ where: { postedByUserId: userId, urgency: "EMERGENCY", status: "OPEN" } }),
    prisma.supportRequest.count({ where: { postedByUserId: userId, status: "OPEN", applications: { none: {} } } }),
  ]);

  return {
    role: "COORDINATOR" as const,
    stats: {
      activeRequests:       openJobs.length,
      draftRequests:        draftCount,
      urgentRequests:       urgentCount,
      unfilledRequests:     unfilledCount,
      upcomingShifts:       upcomingShifts.length,
      awaitingConfirmation: awaitingConfirmation.length,
      managedParticipants:  managedParticipantCount,
      unreadMessages:       unreadNotifications,
    },
    openJobs,
    upcomingShifts,
    awaitingConfirmation,
    managedParticipantCount,
    unreadNotifications,
  };
}

// ── Provider ──────────────────────────────────────────────────────────────────

async function providerDashboard(userId: string) {
  const [
    pendingExpressions,
    activeShifts,
    unassignedAccepted,
    unreadNotifications,
    shortlistedCount,
    confirmedIntakesCount,
    allApplicationsCount,
  ] = await Promise.all([
    prisma.jobApplication.findMany({ where: { applicantUserId: userId, status: "INTERESTED" }, include: { job: { select: JOB_SUMMARY } }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.supportRequest.findMany({ where: { selectedApplicantUserId: userId, status: { in: ["ASSIGNED", "IN_PROGRESS"] } }, select: JOB_SUMMARY, orderBy: { scheduledStartAt: "asc" }, take: 5 }),
    prisma.supportRequest.findMany({ where: { selectedApplicantUserId: userId, status: "ASSIGNED", assignedWorkerUserId: null }, select: JOB_SUMMARY, orderBy: { scheduledStartAt: "asc" }, take: 5 }),
    prisma.notification.count({ where: { userId, read: false } }),
    prisma.jobApplication.count({ where: { applicantUserId: userId, status: "SHORTLISTED" } }),
    prisma.supportRequest.count({ where: { selectedApplicantUserId: userId, status: { in: ["CONFIRMED", "COMPLETED"] } } }),
    prisma.jobApplication.count({ where: { applicantUserId: userId } }),
  ]);

  return {
    role: "PROVIDER" as const,
    stats: {
      newEnquiries:          pendingExpressions.length,
      shortlistedCount,
      matchedRequests:       allApplicationsCount,
      confirmedIntakes:      confirmedIntakesCount,
      unfilledWorkforceGaps: unassignedAccepted.length,
      unreadMessages:        unreadNotifications,
    },
    pendingExpressions: pendingExpressions.map((a) => ({ applicationId: a.id, job: a.job })),
    activeShifts,
    unassignedAccepted,
    unreadNotifications,
  };
}

// ── Plan Manager ──────────────────────────────────────────────────────────────

async function planManagerDashboard(userId: string) {
  const [recentInvoices, connectionCounts, unreadNotifications] = await Promise.all([
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
      prisma.supportRequest.count({ where: { forParticipantUserId: idFilter, urgency: "EMERGENCY", status: "OPEN" } }),
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
      unreadMessages:     unreadNotifications,
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
  const activeStatuses = ["OPEN", "DRAFT", "ASSIGNED", "IN_PROGRESS"] as const;

  const [pendingUsers, totalUsers, openJobs, activeJobs, urgentJobs, completedToday, totalInvoices] = await Promise.all([
    prisma.user.count({ where: { status: "PENDING" } }),
    prisma.user.count(),
    prisma.supportRequest.count({ where: { status: "OPEN" } }),
    prisma.supportRequest.count({ where: { status: { in: activeStatuses } } }),
    prisma.supportRequest.count({ where: { status: "OPEN", urgency: "EMERGENCY" } }),
    prisma.supportRequest.count({ where: { status: "CONFIRMED", confirmedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
    prisma.invoice.count(),
  ]);

  return {
    role: "ADMIN" as const,
    stats: { pendingUsers, totalUsers, openJobs, activeJobs, urgentJobs, completedToday, totalInvoices },
  };
}
