import type { Request, Response } from "express";
import { success } from "../../utils/response";
import { BadRequestError, UnauthorizedError } from "../../lib/errors";
import * as adminService from "./admin.service";

export async function listUsers(req: Request, res: Response): Promise<void> {
  const page  = Math.max(1, parseInt(String(req.query.page  ?? "1"),  10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
  const { status, role } = req.query as { status?: string; role?: string };
  const result = await adminService.listUsers({ status, role, page, limit });
  success(res, result);
}

export async function getUser(req: Request, res: Response): Promise<void> {
  const user = await adminService.getUserById(req.params.id);
  success(res, { user });
}

export async function updateUserStatus(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const { status, reason } = req.body as { status?: string; reason?: string };
  if (!status || (status !== "ACTIVE" && status !== "SUSPENDED")) {
    throw new BadRequestError("status must be ACTIVE or SUSPENDED");
  }
  const result = await adminService.updateUserStatus({
    targetUserId: req.params.id,
    adminUserId:  req.user.id,
    status,
    reason,
  });
  success(res, result);
}

// ─── GET /admin/verification-queue ───────────────────────────────────────────

export async function getVerificationQueue(req: Request, res: Response): Promise<void> {
  const page  = Math.max(1, parseInt(String(req.query.page  ?? "1"),  10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
  const result = await adminService.verificationQueue({ page, limit });
  success(res, result);
}

// ─── PATCH /admin/users/:id/verify ───────────────────────────────────────────

export async function verifyUser(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const { approved, reason } = req.body as { approved?: unknown; reason?: string };
  if (typeof approved !== "boolean") {
    throw new BadRequestError("approved must be a boolean");
  }
  const result = await adminService.verifyUser({
    targetUserId: req.params.id,
    adminUserId:  req.user.id,
    approved,
    reason,
  });
  success(res, result);
}

// ─── GET /admin/audit-log ─────────────────────────────────────────────────────

export async function getAuditLog(req: Request, res: Response): Promise<void> {
  const page  = Math.max(1, parseInt(String(req.query.page  ?? "1"),  10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
  const { targetUserId, action } = req.query as { targetUserId?: string; action?: string };
  const result = await adminService.listAuditLog({ targetUserId, action, page, limit });
  success(res, result);
}

// ─── GET /admin/stats ─────────────────────────────────────────────────────────

export async function getStats(_req: Request, res: Response): Promise<void> {
  const result = await adminService.getPlatformStats();
  success(res, result);
}

// ─── GET /admin/jobs ──────────────────────────────────────────────────────────

export async function listJobs(req: Request, res: Response): Promise<void> {
  const page  = Math.max(1, parseInt(String(req.query.page  ?? "1"),  10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
  const { status, category, urgency, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
  const result = await adminService.listAllJobs({ status, category, urgency, dateFrom, dateTo, page, limit });
  success(res, result);
}

// ─── PATCH /admin/jobs/:id/cancel ─────────────────────────────────────────────

export async function cancelJob(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const { reason } = req.body as { reason?: string };
  const result = await adminService.adminCancelJob({
    jobId: req.params.id,
    adminUserId: req.user.id,
    reason,
  });
  success(res, result);
}

// ─── GET /admin/documents/:id/view ───────────────────────────────────────────

export async function viewDocument(req: Request, res: Response): Promise<void> {
  const result = await adminService.getDocumentViewUrl(req.params.id);
  success(res, result);
}

// ─── PATCH /admin/documents/:id/verify ───────────────────────────────────────

export async function verifyDocument(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const { approved, reason } = req.body as { approved?: unknown; reason?: string };
  if (typeof approved !== "boolean") {
    throw new BadRequestError("approved must be a boolean");
  }
  const result = await adminService.verifyDocument({
    documentId: req.params.id,
    adminUserId: req.user.id,
    approved,
    reason,
  });
  success(res, result);
}

// ─── POST /admin/users/:id/notify ────────────────────────────────────────────

export async function notifyUser(req: Request, res: Response): Promise<void> {
  const { title, body } = req.body as { title?: string; body?: string };
  if (!title?.trim() || !body?.trim()) {
    throw new BadRequestError("title and body are required");
  }
  const result = await adminService.notifyUser({
    targetUserId: req.params.id,
    title,
    body,
  });
  success(res, result);
}

// ─── POST /admin/broadcast ────────────────────────────────────────────────────

export async function broadcast(req: Request, res: Response): Promise<void> {
  const { title, body, role } = req.body as { title?: string; body?: string; role?: string };
  if (!title?.trim() || !body?.trim()) {
    throw new BadRequestError("title and body are required");
  }
  const result = await adminService.broadcastNotification({ title, body, role });
  success(res, result);
}

// ─── GET /admin/verification-queue (updated — SUSPENDED only) ─────────────────

export async function getSuspendedQueue(req: Request, res: Response): Promise<void> {
  const page  = Math.max(1, parseInt(String(req.query.page  ?? "1"),  10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
  const result = await adminService.suspendedUsersQueue({ page, limit });
  success(res, result);
}
