import type { Request, Response } from "express";
import { UnauthorizedError, ValidationError } from "../../lib/errors";
import { success } from "../../utils/response";
import * as svc from "./job.service";
import {
  createJobSchema,
  publishJobSchema,
  jobFiltersSchema,
  applyJobSchema,
  cancelJobSchema,
  assignWorkerSchema,
  sendMessageSchema,
  createInvoiceSchema,
} from "../../validators/job.schema";
import type { UserRole } from "@prisma/client";

function role(req: Request): UserRole {
  if (!req.activeRole) throw new UnauthorizedError("No active role");
  return req.activeRole;
}

function parse<T>(schema: { safeParse(v: unknown): { success: boolean; data?: T; error?: { errors: { path: (string|number)[]; message: string }[] } } }, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw new ValidationError(
      r.error!.errors[0]?.message ?? "Invalid input",
      r.error!.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
    );
  }
  return r.data!;
}

// POST /jobs
export async function createJob(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(createJobSchema, req.body);
  const job  = await svc.createJob(req.user.id, role(req), data);
  success(res, { job }, 201);
}

// GET /jobs
export async function listJobs(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const filters = parse(jobFiltersSchema, req.query);
  const result  = await svc.listJobs(req.user.id, role(req), filters);
  success(res, result);
}

// GET /jobs/my
export async function listMyJobs(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const result = await svc.listMyJobs(req.user.id, role(req), status);
  success(res, result);
}

// GET /jobs/:id
export async function getJob(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const job = await svc.getJob(req.params.id, req.user.id, role(req));
  success(res, { job });
}

// PATCH /jobs/:id/cancel
export async function cancelJob(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(cancelJobSchema, req.body);
  const job  = await svc.cancelJob(req.params.id, req.user.id, data);
  success(res, { job });
}

// PATCH /jobs/:id/publish
export async function publishJob(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const job = await svc.publishJob(req.params.id, req.user.id);
  success(res, { job });
}

// PATCH /jobs/:id/assign-worker
export async function assignWorker(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(assignWorkerSchema, req.body);
  const job  = await svc.assignWorker(req.params.id, req.user.id, data);
  success(res, { job });
}

// PATCH /jobs/:id/start
export async function startJob(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const job = await svc.startJob(req.params.id, req.user.id);
  success(res, { job });
}

// PATCH /jobs/:id/complete
export async function completeJob(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const job = await svc.completeJob(req.params.id, req.user.id);
  success(res, { job });
}

// PATCH /jobs/:id/confirm
export async function confirmJob(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const job = await svc.confirmJob(req.params.id, req.user.id);
  success(res, { job });
}

// POST /jobs/:id/apply
export async function applyToJob(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(applyJobSchema, req.body);
  const app  = await svc.applyToJob(req.params.id, req.user.id, role(req), data);
  success(res, { application: app }, 201);
}

// GET /jobs/:id/applications
export async function listApplications(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const apps = await svc.listApplications(req.params.id, req.user.id);
  success(res, { applications: apps });
}

// PATCH /jobs/:id/applications/:appId/select
export async function selectApplicant(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const job = await svc.selectApplicant(req.params.id, req.params.appId, req.user.id);
  success(res, { job });
}

// POST /jobs/:id/messages
export async function sendMessage(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(sendMessageSchema, req.body);
  const msg  = await svc.sendMessage(req.params.id, req.user.id, data);
  success(res, { message: msg }, 201);
}

// GET /jobs/:id/messages
export async function getMessages(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const msgs = await svc.getMessages(req.params.id, req.user.id);
  success(res, { messages: msgs });
}

// POST /jobs/:id/invoice
export async function createInvoice(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data    = parse(createInvoiceSchema, req.body);
  const invoice = await svc.createInvoice(req.params.id, req.user.id, role(req), data);
  success(res, { invoice }, 201);
}

// GET /invoices
export async function listInvoices(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const invoices = await svc.listInvoices(req.user.id, role(req));
  success(res, { invoices });
}
