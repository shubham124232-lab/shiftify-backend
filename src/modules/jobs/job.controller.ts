import type { Request, Response } from "express";
import { UnauthorizedError } from "../../lib/errors";
import { success } from "../../utils/response";
import { parse } from "../../utils/validate";
import * as svc from "./job.service";
import {
  createJobSchema,
  publishJobSchema,
  jobFiltersSchema,
  liveDashboardFiltersSchema,
  applyJobSchema,
  cancelJobSchema,
  createReplacementSchema,
  assignWorkerSchema,
  sendMessageSchema,
  createInvoiceSchema,
  proposeMeetAndGreetSchema,
  respondMeetAndGreetSchema,
  createChangeRequestSchema,
  respondChangeRequestSchema,
  closeConnectionSchema,
  notifyRunningLateSchema,
  saveWorkerNoteSchema,
  bookmarkJobSchema,
  updateDraftJobSchema,
  archiveThreadSchema,
} from "../../validators/job.schema";
import type { UserRole } from "@prisma/client";

function role(req: Request): UserRole {
  if (!req.activeRole) throw new UnauthorizedError("No active role");
  return req.activeRole;
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

// GET /jobs/live-dashboard
export async function listLiveDashboardJobs(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const filters = parse(liveDashboardFiltersSchema, req.query);
  const result  = await svc.listLiveDashboardJobs(req.user.id, role(req), filters);
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
  const job  = await svc.cancelJob(req.params.id, req.user.id, role(req), data);
  success(res, { job });
}

// POST /jobs/:id/replacement — SC-04-05 manual "Find Replacement"
export async function createReplacementRequest(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(createReplacementSchema, req.body);
  const job  = await svc.createReplacementRequest(req.params.id, req.user.id, role(req), data);
  success(res, { job }, 201);
}

// POST /jobs/:id/duplicate — participant portfolio "Repeat previous request"
export async function duplicateJob(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const job = await svc.duplicateJob(req.params.id, req.user.id);
  success(res, { job }, 201);
}

// PATCH /jobs/:id — SC-PT05 "Repeat support" edit, DRAFT-only
export async function updateDraftJob(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(updateDraftJobSchema, req.body);
  const job = await svc.updateDraftJob(req.params.id, req.user.id, data);
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

// PATCH /jobs/:id/confirm-assignment
export async function confirmAssignment(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const job = await svc.confirmAssignment(req.params.id, req.user.id);
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

// POST /jobs/:id/featured-shift
export async function purchaseFeaturedShift(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const purchase = await svc.purchaseFeaturedShift(req.params.id, req.user.id);
  success(res, { purchase });
}

// PATCH /jobs/:id/applications/:appId/shortlist
export async function shortlistApplicant(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const app = await svc.shortlistApplicant(req.params.id, req.params.appId, req.user.id);
  success(res, { application: app });
}

// PATCH /jobs/:id/applications/:appId/decline
export async function declineApplicant(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const app = await svc.declineApplicant(req.params.id, req.params.appId, req.user.id);
  success(res, { application: app });
}

// PATCH /jobs/:id/applications/:appId/withdraw
export async function withdrawApplication(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const app = await svc.withdrawApplication(req.params.id, req.user.id);
  success(res, { application: app });
}

// PATCH /jobs/:id/close-connection
export async function closeConnection(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(closeConnectionSchema, req.body);
  const job  = await svc.closeConnection(req.params.id, req.user.id, data);
  success(res, { job });
}

// PATCH /jobs/:id/save
export async function bookmarkJob(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(bookmarkJobSchema, req.body);
  const bookmark = await svc.bookmarkJob(req.params.id, req.user.id, data);
  success(res, { bookmark });
}

// DELETE /jobs/:id/save
export async function removeBookmark(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const result = await svc.removeBookmark(req.params.id, req.user.id);
  success(res, result);
}

// PATCH /jobs/:id/running-late
export async function notifyRunningLate(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(notifyRunningLateSchema, req.body);
  const job  = await svc.notifyRunningLate(req.params.id, req.user.id, data);
  success(res, { job });
}

// PATCH /jobs/:id/worker-note
export async function saveWorkerNote(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(saveWorkerNoteSchema, req.body);
  const job  = await svc.saveWorkerNote(req.params.id, req.user.id, data);
  success(res, { job });
}

// PATCH /jobs/:id/decline-assignment
export async function declineAssignment(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const job = await svc.declineAssignment(req.params.id, req.user.id);
  success(res, { job });
}

// GET /jobs/connections/mine — SW doc Window 27 "My Connections"
export async function listMyConnections(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const tabs = await svc.listMyConnections(req.user.id);
  success(res, tabs);
}

// POST /jobs/:id/meet-and-greet
export async function proposeMeetAndGreet(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(proposeMeetAndGreetSchema, req.body);
  const mag  = await svc.proposeMeetAndGreet(req.params.id, req.user.id, data);
  success(res, { meetAndGreet: mag }, 201);
}

// PATCH /jobs/meet-and-greet/:magId/respond
export async function respondToMeetAndGreet(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(respondMeetAndGreetSchema, req.body);
  const mag  = await svc.respondToMeetAndGreet(req.params.magId, req.user.id, data);
  success(res, { meetAndGreet: mag });
}

// POST /jobs/:id/change-request
export async function requestJobChange(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(createChangeRequestSchema, req.body);
  const cr   = await svc.requestJobChange(req.params.id, req.user.id, data);
  success(res, { changeRequest: cr }, 201);
}

// PATCH /jobs/change-request/:changeRequestId/respond
export async function respondToJobChange(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(respondChangeRequestSchema, req.body);
  const cr   = await svc.respondToJobChange(req.params.changeRequestId, req.user.id, data);
  success(res, { changeRequest: cr });
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

// GET /jobs/messages/threads
export async function listMessageThreads(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const includeArchived = req.query.includeArchived === "true";
  const result = await svc.listMessageThreads(req.user.id, role(req), includeArchived);
  success(res, result);
}

// PATCH /jobs/:id/messages/read
export async function markThreadRead(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const threadState = await svc.markThreadRead(req.params.id, req.user.id);
  success(res, { threadState });
}

// PATCH /jobs/:id/messages/archive
export async function archiveThread(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(archiveThreadSchema, req.body);
  const threadState = await svc.archiveThread(req.params.id, req.user.id, data.archived);
  success(res, { threadState });
}

// GET /jobs/:id/invoice-recipients
export async function getInvoiceRecipients(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const result = await svc.getInvoiceRecipients(req.params.id, req.user.id, role(req));
  success(res, result);
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
