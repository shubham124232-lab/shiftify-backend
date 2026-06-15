import { prisma } from "../../lib/prisma";
import { BadRequestError, NotFoundError } from "../../lib/errors";
import { notify } from "../../lib/notify";
import { writeAudit } from "../../utils/audit";
import { generateGetPresignedUrl } from "../../lib/storage";
import type { UserStatus, UserRole, AdminTier, JobStatus, JobCategory, JobUrgency } from "@prisma/client";

// ─── GET /admin/db-snapshot ───────────────────────────────────────────────────
// Super-admin only. Returns every table in the database with full row data.
// Sensitive fields (passwordHash, refreshTokenHash, codeHash) are stripped.
// Session + VerificationCode rows are returned as counts only (security).

export async function getDbSnapshot() {
  // Split into two batches — TypeScript's Promise.all overloads top out at ~10 items.
  const [users, workerProfiles, providerProfiles, participantProfiles, coordinatorProfiles, planManagerProfiles, addresses, documents, plans] =
    await Promise.all([
      prisma.user.findMany({ include: { roles: true }, orderBy: { createdAt: "desc" } }),
      prisma.workerProfile.findMany({ include: { availability: true, unavailability: true }, orderBy: { createdAt: "desc" } }),
      prisma.providerProfile.findMany({ include: { availability: true }, orderBy: { createdAt: "desc" } }),
      prisma.participantProfile.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.coordinatorProfile.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.planManagerProfile.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.address.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.document.findMany({ orderBy: { uploadedAt: "desc" } }),
      prisma.plan.findMany({ orderBy: { createdAt: "desc" } }),
    ]);

  const [subscriptions, supportRequests, jobApplications, jobMessages, invoices, pmConnections, notifications, auditLogs, sessionCount, verificationCodeCount] =
    await Promise.all([
      prisma.userSubscription.findMany({ include: { plan: { select: { key: true, name: true, role: true, amountAud: true } } }, orderBy: { createdAt: "desc" } }),
      prisma.supportRequest.findMany({ include: { _count: { select: { applications: true, messages: true } } }, orderBy: { createdAt: "desc" } }),
      prisma.jobApplication.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.jobMessage.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.invoice.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.planManagerConnection.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.notification.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.auditLog.findMany({ include: { admin: { select: { id: true, name: true, email: true } }, targetUser: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "desc" } }),
      prisma.session.count(),
      prisma.verificationCode.count(),
    ]);

  // Strip passwordHash from user rows
  const safeUsers = users.map((u) => {
    const safe = u as Record<string, unknown>;
    delete safe["passwordHash"];
    return safe;
  });

  return {
    _meta: {
      generatedAt: new Date().toISOString(),
      tables: {
        User:                  safeUsers.length,
        WorkerProfile:         workerProfiles.length,
        ProviderProfile:       providerProfiles.length,
        ParticipantProfile:    participantProfiles.length,
        CoordinatorProfile:    coordinatorProfiles.length,
        PlanManagerProfile:    planManagerProfiles.length,
        Address:               addresses.length,
        Document:              documents.length,
        Plan:                  plans.length,
        UserSubscription:      subscriptions.length,
        SupportRequest:        supportRequests.length,
        JobApplication:        jobApplications.length,
        JobMessage:            jobMessages.length,
        Invoice:               invoices.length,
        PlanManagerConnection: pmConnections.length,
        Notification:          notifications.length,
        AuditLog:              auditLogs.length,
        Session:               sessionCount,
        VerificationCode:      verificationCodeCount,
      },
    },
    users:                safeUsers,
    workerProfiles,
    providerProfiles,
    participantProfiles,
    coordinatorProfiles,
    planManagerProfiles,
    addresses,
    documents,
    plans,
    subscriptions,
    supportRequests,
    jobApplications,
    jobMessages,
    invoices,
    pmConnections,
    notifications,
    auditLogs,
    // Counts only — full rows contain hashed tokens / OTP codes
    sessionCount,
    verificationCodeCount,
  };
}

// ─── GET /admin/users ─────────────────────────────────────────────────────────

export interface UserListItem {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  username: string | null;
  accountType: string;
  status: UserStatus;
  adminTier: AdminTier | null;
  roles: { role: UserRole; isActiveDefault: boolean }[];
  createdAt: Date;
}

export async function listUsers(params: {
  status?: string;
  role?: string;
  page: number;
  limit: number;
}): Promise<{ users: UserListItem[]; total: number; page: number; limit: number }> {
  const { page, limit } = params;
  const skip = (page - 1) * limit;

  // Build filter
  const where: Record<string, unknown> = {};
  if (params.status) where.status = params.status as UserStatus;
  if (params.role) {
    where.roles = { some: { role: params.role as UserRole } };
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        username: true,
        accountType: true,
        status: true,
        adminTier: true,
        roles: { select: { role: true, isActiveDefault: true } },
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total, page, limit };
}

// ─── GET /admin/users/:id ─────────────────────────────────────────────────────

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      addresses: true,
      roles: { select: { role: true, isActiveDefault: true } },
      participantProfile: true,
      workerProfile: {
        include: { availability: true, unavailability: true },
      },
      providerProfile: true,
      coordinatorProfile: true,
      planManagerProfile: true,
      documents: {
        select: {
          id: true,
          docType: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          referenceNumber: true,
          issueDate: true,
          expiryDate: true,
          status: true,
          uploadedAt: true,
        },
      },
    },
  });

  if (!user) throw new NotFoundError("User not found");
  return user;
}

// ─── PATCH /admin/users/:id/status ───────────────────────────────────────────

export async function updateUserStatus(params: {
  targetUserId: string;
  adminUserId: string;
  status: "ACTIVE" | "SUSPENDED";
  reason?: string;
}) {
  const { targetUserId, adminUserId, status, reason } = params;

  if (status !== "ACTIVE" && status !== "SUSPENDED") {
    throw new BadRequestError("status must be ACTIVE or SUSPENDED");
  }

  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) throw new NotFoundError("User not found");

  // Map status → audit action
  const action = status === "ACTIVE" ? "USER_REACTIVATED" : "USER_SUSPENDED";

  // Map status → notification type / copy
  const notifTitle =
    status === "ACTIVE" ? "Account reactivated" : "Account suspended";
  const notifBody =
    status === "ACTIVE"
      ? "Your Shiftify account has been reactivated by an administrator."
      : `Your Shiftify account has been suspended.${reason ? ` Reason: ${reason}` : ""} Contact support for assistance.`;

  const [updatedUser] = await Promise.all([
    prisma.user.update({
      where: { id: targetUserId },
      data: { status },
      include: {
        roles: { select: { role: true, isActiveDefault: true } },
        addresses: true,
      },
    }),
    prisma.auditLog.create({
      data: {
        adminUserId,
        action,
        targetUserId,
        reason: reason ?? null,
      },
    }),
  ]);

  // Fire push notification (writes Notification row + returns _dev_notification).
  const notifResult = await notify.sendPushNotification(
    targetUserId,
    notifTitle,
    notifBody,
    { action, reason },
    status === "ACTIVE" ? "REGISTRATION_APPROVED" : "REGISTRATION_REJECTED",
  );

  return { user: updatedUser, ...notifResult };
}

// ─── GET /admin/verification-queue ───────────────────────────────────────────
// Returns PENDING users that hold at least one role requiring admin sign-off
// (PROVIDER or PLAN_MANAGER). Ordered oldest-first so reviewers work FIFO.

const VERIFICATION_ROLES: UserRole[] = ["PROVIDER", "PLAN_MANAGER"];

export async function verificationQueue(params: {
  page: number;
  limit: number;
}) {
  const { page, limit } = params;
  const skip = (page - 1) * limit;

  const where = {
    status: "PENDING" as UserStatus,
    roles: { some: { role: { in: VERIFICATION_ROLES } } },
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        username: true,
        accountType: true,
        status: true,
        adminTier: true,
        roles: { select: { role: true, isActiveDefault: true } },
        providerProfile: {
          select: {
            businessName: true,
            abn: true,
            ndisRegistered: true,
            ndisProviderNumber: true,
          },
        },
        planManagerProfile: {
          select: {
            businessName: true,
            abn: true,
            ndisRegistered: true,
          },
        },
        documents: {
          select: {
            id: true,
            docType: true,
            fileName: true,
            status: true,
            uploadedAt: true,
          },
        },
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total, page, limit };
}

// ─── PATCH /admin/users/:id/verify ───────────────────────────────────────────
// approve → ACTIVE  |  reject → REJECTED (requires reason)

export async function verifyUser(params: {
  targetUserId: string;
  adminUserId: string;
  approved: boolean;
  reason?: string;
}) {
  const { targetUserId, adminUserId, approved, reason } = params;

  if (!approved && !reason?.trim()) {
    throw new BadRequestError("reason is required when rejecting a user");
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: { roles: { select: { role: true } } },
  });
  if (!target) throw new NotFoundError("User not found");
  if (target.status !== "PENDING") {
    throw new BadRequestError(
      `User is not PENDING (current status: ${target.status})`,
    );
  }

  const newStatus: UserStatus = approved ? "ACTIVE" : "REJECTED";
  const auditAction = approved ? "USER_APPROVED" : ("USER_REJECTED" as const);

  const [updatedUser] = await Promise.all([
    prisma.user.update({
      where: { id: targetUserId },
      data: {
        status: newStatus,
        rejectionReason: approved ? null : (reason ?? null),
      },
      include: { roles: { select: { role: true, isActiveDefault: true } } },
    }),
    writeAudit({
      adminUserId,
      action: auditAction,
      targetUserId,
      reason: reason ?? undefined,
    }),
  ]);

  const notifTitle = approved
    ? "Registration approved"
    : "Registration rejected";
  const notifBody = approved
    ? "Your Shiftify account has been approved. You can now use the platform."
    : `Your Shiftify registration was rejected.${reason ? ` Reason: ${reason}` : ""} Contact support for assistance.`;

  const notifResult = await notify.sendPushNotification(
    targetUserId,
    notifTitle,
    notifBody,
    { action: auditAction, reason },
    approved ? "REGISTRATION_APPROVED" : "REGISTRATION_REJECTED",
  );

  return { user: updatedUser, ...notifResult };
}

// ─── GET /admin/stats ────────────────────────────────────────────────────────

export async function getPlatformStats() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    totalUsers,
    usersByRole,
    pendingUsers,
    suspendedUsers,
    activeJobs,
    completedToday,
    totalJobs,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.userRoleAssignment.groupBy({ by: ["role"], _count: { role: true } }),
    prisma.user.count({ where: { status: "PENDING" } }),
    prisma.user.count({ where: { status: "SUSPENDED" } }),
    prisma.supportRequest.count({
      where: { status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] } },
    }),
    prisma.supportRequest.count({
      where: { status: "CONFIRMED", updatedAt: { gte: todayStart } },
    }),
    prisma.supportRequest.count(),
  ]);

  const roleBreakdown = Object.fromEntries(
    usersByRole.map((r) => [r.role, r._count.role]),
  );

  return {
    totalUsers,
    roleBreakdown,
    pendingUsers,
    suspendedUsers,
    activeJobs,
    completedToday,
    totalJobs,
  };
}

// ─── GET /admin/audit-log ─────────────────────────────────────────────────────
// SUPER_ADMIN only. Paginated; optionally filtered by targetUserId or action.

export async function listAuditLog(params: {
  targetUserId?: string;
  action?: string;
  page: number;
  limit: number;
}) {
  const { page, limit } = params;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (params.targetUserId) where.targetUserId = params.targetUserId;
  if (params.action) where.action = params.action;

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        admin: { select: { id: true, name: true, email: true, adminTier: true } },
        targetUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { entries, total, page, limit };
}

// ─── GET /admin/jobs ──────────────────────────────────────────────────────────

export async function listAllJobs(params: {
  status?: string;
  category?: string;
  urgency?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  limit: number;
}) {
  const { page, limit } = params;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (params.status)   where.status   = params.status   as JobStatus;
  if (params.category) where.category = params.category as JobCategory;
  if (params.urgency)  where.urgency  = params.urgency  as JobUrgency;
  if (params.dateFrom || params.dateTo) {
    where.createdAt = {
      ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
      ...(params.dateTo   ? { lte: new Date(params.dateTo)   } : {}),
    };
  }

  const [jobs, total] = await Promise.all([
    prisma.supportRequest.findMany({
      where,
      select: {
        id: true,
        title: true,
        category: true,
        urgency: true,
        status: true,
        suburb: true,
        state: true,
        scheduledStartAt: true,
        totalHours: true,
        createdAt: true,
        postedBy: { select: { id: true, name: true, email: true } },
        _count: { select: { applications: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.supportRequest.count({ where }),
  ]);

  return { jobs, total, page, limit };
}

// ─── PATCH /admin/jobs/:id/cancel ─────────────────────────────────────────────

export async function adminCancelJob(params: {
  jobId: string;
  adminUserId: string;
  reason?: string;
}) {
  const { jobId, adminUserId, reason } = params;

  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  if (!job) throw new NotFoundError("Job not found");
  if (job.status === "CANCELLED" || job.status === "CONFIRMED") {
    throw new BadRequestError(`Cannot cancel a job with status ${job.status}`);
  }

  const [updatedJob] = await Promise.all([
    prisma.supportRequest.update({
      where: { id: jobId },
      data: { status: "CANCELLED" },
    }),
    writeAudit({
      adminUserId,
      action: "USER_EDITED", // closest available; no JOB_CANCELLED action in enum yet
      targetUserId: job.postedByUserId,
      reason: reason ? `Admin cancelled job ${jobId}: ${reason}` : `Admin cancelled job ${jobId}`,
    }),
  ]);

  return { job: updatedJob };
}

// ─── GET /admin/documents/:id/view ────────────────────────────────────────────

export async function getDocumentViewUrl(documentId: string) {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      filePath: true,
      fileName: true,
      mimeType: true,
      status: true,
      user: { select: { id: true, name: true } },
    },
  });
  if (!doc) throw new NotFoundError("Document not found");

  const viewUrl = generateGetPresignedUrl({ fileKey: doc.filePath, expiresIn: 300 });
  return { document: doc, viewUrl, expiresIn: 300 };
}

// ─── PATCH /admin/documents/:id/verify ──────────────────────────────────────
export async function verifyDocument(params: {
  documentId: string;
  adminUserId: string;
  approved: boolean;
  reason?: string;
}) {
  const { documentId, adminUserId, approved, reason } = params;

  if (!approved && !reason?.trim()) {
    throw new BadRequestError("reason is required when rejecting a document");
  }

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!doc) throw new NotFoundError("Document not found");

  const newStatus   = approved ? ("VERIFIED" as const) : ("REJECTED" as const);
  const auditAction = approved ? ("DOC_VERIFIED" as const) : ("DOC_REJECTED" as const);

  const [updatedDoc] = await Promise.all([
    prisma.document.update({
      where: { id: documentId },
      data: {
        status: newStatus,
        rejectionReason:   approved ? null : (reason ?? null),
        verifiedByAdminId: approved ? adminUserId : null,
        verifiedAt:        approved ? new Date() : null,
      },
    }),
    writeAudit({
      adminUserId,
      action: auditAction,
      targetUserId: doc.userId,
      reason: reason ?? undefined,
    }),
  ]);

  const notifTitle = approved ? "Document verified" : "Document rejected";
  const notifBody  = approved
    ? `Your ${doc.docType} document has been verified.`
    : `Your ${doc.docType} document was rejected.${reason ? ` Reason: ${reason}` : ""} Please re-upload.`;

  const notifResult = await notify.sendPushNotification(
    doc.userId,
    notifTitle,
    notifBody,
    { action: auditAction, documentId },
    approved ? "REGISTRATION_APPROVED" : "REGISTRATION_REJECTED",
  );

  return { document: updatedDoc, ...notifResult };
}

// ─── POST /admin/users/:id/notify ─────────────────────────────────────────────

export async function notifyUser(params: {
  targetUserId: string;
  title: string;
  body: string;
}) {
  const { targetUserId, title, body } = params;

  const user = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!user) throw new NotFoundError("User not found");

  const notifResult = await notify.sendPushNotification(
    targetUserId,
    title,
    body,
    { source: "admin" },
  );

  return notifResult;
}

// ─── POST /admin/broadcast ────────────────────────────────────────────────────

export async function broadcastNotification(params: {
  title: string;
  body: string;
  role?: string;
}) {
  const { title, body, role } = params;

  const where: Record<string, unknown> = {};
  if (role) where.roles = { some: { role: role as UserRole } };

  const users = await prisma.user.findMany({ where, select: { id: true } });

  const results = await Promise.allSettled(
    users.map((u) =>
      notify.sendPushNotification(u.id, title, body, { source: "broadcast", role }),
    ),
  );

  const sent   = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  return { sent, failed, total: users.length };
}

// ─── GET /admin/verification-queue — SUSPENDED users only ─────────────────────

export async function suspendedUsersQueue(params: { page: number; limit: number }) {
  const { page, limit } = params;
  const skip  = (page - 1) * limit;
  const where = { status: "SUSPENDED" as UserStatus };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true, name: true, email: true, phone: true, username: true,
        accountType: true, status: true, adminTier: true,
        roles:     { select: { role: true, isActiveDefault: true } },
        documents: { select: { id: true, docType: true, fileName: true, status: true, uploadedAt: true } },
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total, page, limit };
}
