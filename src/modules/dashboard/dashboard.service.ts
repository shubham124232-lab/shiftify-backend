// dashboard.service.ts — role-aware dashboard feed (GET /dashboard).
// Returns real DB data per DECISIONS.md section 13. One call, one response per role.

import { prisma } from "../../lib/prisma";
import type { UserRole } from "@prisma/client";

const JOB_SUMMARY = {
  id: true, title: true, category: true, urgency: true,
  suburb: true, state: true, scheduledStartAt: true, totalHours: true,
  status: true, createdAt: true,
} as const;

export async function getSummary(userId: string, activeRole: UserRole) {
  switch (activeRole) {
    case "SUPPORT_WORKER":  return workerDashboard(userId);
    case "PARTICIPANT":     return participantDashboard(userId);
    case "COORDINATOR":     return coordinatorDashboard(userId);
    case "PROVIDER":        return providerDashboard(userId);
    case "PLAN_MANAGER":    return planManagerDashboard(userId);
    case "ADMIN":           return adminDashboard();
    default:                return { role: activeRole as string };
  }
}

// Support Worker
async function workerDashboard(userId: string) {
  const now = new Date();
  const [upcomingShifts, pendingApplications, nearbyJobs, unreadNotifications] = await Promise.all([
    prisma.supportRequest.findMany({
      where: {
        OR: [{ selectedApplicantUserId: userId }, { assignedWorkerUserId: userId }],
        status: { in: ["ASSIGNED", "IN_PROGRESS"] },
        scheduledStartAt: { gte: now },
      },
      select: JOB_SUMMARY,
      orderBy: { scheduledStartAt: "asc" },
      take: 5,
    }),
    prisma.jobApplication.findMany({
      where: { applicantUserId: userId, status: "INTERESTED" },
      include: { job: { select: JOB_SUMMARY } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.supportRequest.findMany({
      where: { status: "OPEN" },
      select: JOB_SUMMARY,
      orderBy: [{ urgency: "asc" }, { scheduledStartAt: "asc" }],
      take: 10,
    }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);

  return {
    role: "SUPPORT_WORKER" as const,
    upcomingShifts,
    pendingApplications: pendingApplications.map((a) => ({
      applicationId: a.id,
      status:        a.status,
      job:           a.job,
    })),
    nearbyJobs,
    unreadNotifications,
  };
}

// Participant
async function participantDashboard(userId: string) {
  const now = new Date();
  const [openJobs, upcomingShifts, awaitingConfirmation, unreadNotifications] = await Promise.all([
    prisma.supportRequest.findMany({
      where: {
        OR: [{ forParticipantUserId: userId }, { postedByUserId: userId }],
        status: "OPEN",
      },
      select: JOB_SUMMARY,
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.supportRequest.findMany({
      where: {
        OR: [{ forParticipantUserId: userId }, { postedByUserId: userId }],
        status: "IN_PROGRESS",
        scheduledStartAt: { gte: now },
      },
      select: JOB_SUMMARY,
      orderBy: { scheduledStartAt: "asc" },
      take: 5,
    }),
    prisma.supportRequest.findMany({
      where: {
        OR: [{ forParticipantUserId: userId }, { postedByUserId: userId }],
        status: "COMPLETED",
      },
      select: JOB_SUMMARY,
      orderBy: { completedAt: "desc" },
      take: 5,
    }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);

  return {
    role: "PARTICIPANT" as const,
    openJobs,
    upcomingShifts,
    awaitingConfirmation,
    unreadNotifications,
  };
}

// Coordinator
async function coordinatorDashboard(userId: string) {
  const now = new Date();
  const [openJobs, upcomingShifts, awaitingConfirmation, managedParticipantCount, unreadNotifications] = await Promise.all([
    prisma.supportRequest.findMany({
      where: { postedByUserId: userId, status: "OPEN" },
      select: JOB_SUMMARY,
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.supportRequest.findMany({
      where: { postedByUserId: userId, status: "IN_PROGRESS", scheduledStartAt: { gte: now } },
      select: JOB_SUMMARY,
      orderBy: { scheduledStartAt: "asc" },
      take: 5,
    }),
    prisma.supportRequest.findMany({
      where: { postedByUserId: userId, status: "COMPLETED" },
      select: JOB_SUMMARY,
      orderBy: { completedAt: "desc" },
      take: 5,
    }),
    prisma.user.count({
      where: {
        parentUserId: userId,
        accountType:  "MANAGED",
        roles:        { some: { role: "PARTICIPANT" } },
      },
    }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);

  return {
    role: "COORDINATOR" as const,
    openJobs,
    upcomingShifts,
    awaitingConfirmation,
    managedParticipantCount,
    unreadNotifications,
  };
}

// Provider
async function providerDashboard(userId: string) {
  const [pendingExpressions, activeShifts, unassignedAccepted, unreadNotifications] = await Promise.all([
    prisma.jobApplication.findMany({
      where: { applicantUserId: userId, status: "INTERESTED" },
      include: { job: { select: JOB_SUMMARY } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.supportRequest.findMany({
      where: {
        selectedApplicantUserId: userId,
        status: { in: ["ASSIGNED", "IN_PROGRESS"] },
      },
      select: JOB_SUMMARY,
      orderBy: { scheduledStartAt: "asc" },
      take: 5,
    }),
    prisma.supportRequest.findMany({
      where: {
        selectedApplicantUserId: userId,
        status: "ASSIGNED",
        assignedWorkerUserId: null,
      },
      select: JOB_SUMMARY,
      orderBy: { scheduledStartAt: "asc" },
      take: 5,
    }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);

  return {
    role: "PROVIDER" as const,
    pendingExpressions: pendingExpressions.map((a) => ({ applicationId: a.id, job: a.job })),
    activeShifts,
    unassignedAccepted,
    unreadNotifications,
  };
}

// Plan Manager
async function planManagerDashboard(userId: string) {
  const [recentInvoices, connectionCounts, unreadNotifications] = await Promise.all([
    prisma.invoice.findMany({
      where:   { planManagerUserId: userId },
      orderBy: { sentAt: "desc" },
      take:    10,
      include: {
        sender:      { select: { id: true, name: true } },
        participant: { select: { id: true, name: true } },
        job:         { select: { id: true, title: true, suburb: true, scheduledStartAt: true } },
      },
    }),
    prisma.planManagerConnection.groupBy({
      by:    ["status"],
      where: { planManagerUserId: userId },
      _count: { _all: true },
    }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);

  const counts: Record<string, number> = {};
  for (const row of connectionCounts) {
    counts[row.status] = row._count._all;
  }

  return {
    role: "PLAN_MANAGER" as const,
    recentInvoices,
    connectionCounts: {
      pending:  counts["PENDING"]  ?? 0,
      accepted: counts["ACCEPTED"] ?? 0,
      declined: counts["DECLINED"] ?? 0,
    },
    unreadNotifications,
  };
}

// Admin
async function adminDashboard() {
  const [pendingUsers, totalUsers, openJobs, activeJobs] = await Promise.all([
    prisma.user.count({ where: { status: "PENDING" } }),
    prisma.user.count(),
    prisma.supportRequest.count({ where: { status: "OPEN" } }),
    prisma.supportRequest.count({ where: { status: { in: ["ASSIGNED", "IN_PROGRESS"] } } }),
  ]);

  return {
    role: "ADMIN" as const,
    pendingUsers,
    totalUsers,
    openJobs,
    activeJobs,
  };
}
