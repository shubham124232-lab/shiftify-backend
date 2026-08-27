import type { Request, Response } from "express";
import { UnauthorizedError } from "../../lib/errors";
import { success } from "../../utils/response";
import { parse } from "../../utils/validate";
import * as svc from "./job-invite.service";
import { createJobInviteSchema, respondJobInviteSchema } from "../../validators/job-invite.schema";
import type { UserRole } from "@prisma/client";

function role(req: Request): UserRole {
  if (!req.activeRole) throw new UnauthorizedError("No active role");
  return req.activeRole;
}

// POST /jobs/:jobId/invites
export async function createInvite(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(createJobInviteSchema, req.body);
  const invite = await svc.createInvite(req.params.jobId, req.user.id, role(req), data);
  success(res, { invite }, 201);
}

// GET /jobs/:jobId/invites
export async function listInvitesForJob(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const invites = await svc.listInvitesForJob(req.params.jobId, req.user.id);
  success(res, { invites });
}

// GET /job-invites/my
export async function listMyInvites(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const invites = await svc.listMyInvites(req.user.id);
  success(res, { invites });
}

// PATCH /job-invites/:id/respond
export async function respondToInvite(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(respondJobInviteSchema, req.body);
  const invite = await svc.respondToInvite(req.params.id, req.user.id, role(req), data);
  success(res, { invite });
}
