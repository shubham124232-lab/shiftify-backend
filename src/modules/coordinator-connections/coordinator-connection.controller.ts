import type { Request, Response } from "express";
import { UnauthorizedError } from "../../lib/errors";
import { success } from "../../utils/response";
import { parse } from "../../utils/validate";
import * as svc from "./coordinator-connection.service";
import {
  createCoordinatorConnectionSchema,
  respondCoordinatorConnectionSchema,
  updateCoordinatorConnectionPermissionsSchema,
  requestPostingApprovalSchema,
  respondPostingApprovalSchema,
  requestPermissionsSchema,
  respondPermissionRequestSchema,
} from "../../validators/coordinator-connection.schema";

// POST /coordinator-connections
export async function createConnection(req: Request, res: Response): Promise<void> {
  if (!req.user || !req.activeRole) throw new UnauthorizedError();
  const data = parse(createCoordinatorConnectionSchema, req.body);
  const connection = await svc.createConnection(req.user.id, req.activeRole, data);
  success(res, { connection }, 201);
}

// GET /coordinator-connections
export async function listConnections(req: Request, res: Response): Promise<void> {
  if (!req.user || !req.activeRole) throw new UnauthorizedError();
  const connections = await svc.listConnections(req.user.id, req.activeRole);
  success(res, { connections });
}

// PATCH /coordinator-connections/:id/respond
export async function respondToConnection(req: Request, res: Response): Promise<void> {
  if (!req.user || !req.activeRole) throw new UnauthorizedError();
  const data = parse(respondCoordinatorConnectionSchema, req.body);
  const connection = await svc.respondToConnection(req.params.id, req.user.id, req.activeRole, data);
  success(res, { connection });
}

// POST /coordinator-connections/:id/resend — SC-C04
export async function resendConnection(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const connection = await svc.resendConnection(req.params.id, req.user.id);
  success(res, { connection });
}

// PATCH /coordinator-connections/:id/cancel — SC-C04
export async function cancelConnection(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const connection = await svc.cancelConnection(req.params.id, req.user.id);
  success(res, { connection });
}

// PATCH /coordinator-connections/:id/permissions
export async function updatePermissions(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(updateCoordinatorConnectionPermissionsSchema, req.body);
  const connection = await svc.updatePermissions(req.params.id, req.user.id, data);
  success(res, { connection });
}

// POST /coordinator-connections/request-posting-approval
export async function requestPostingApproval(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(requestPostingApprovalSchema, req.body);
  const connection = await svc.requestPostingApproval(req.user.id, data.participantUserId);
  success(res, { connection });
}

// PATCH /coordinator-connections/:id/respond-posting-approval
export async function respondToPostingApproval(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(respondPostingApprovalSchema, req.body);
  const connection = await svc.respondToPostingApproval(req.params.id, req.user.id, data);
  success(res, { connection });
}

// POST /coordinator-connections/request-permissions
export async function requestPermissions(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(requestPermissionsSchema, req.body);
  const connection = await svc.requestPermissions(req.user.id, data);
  success(res, { connection });
}

// PATCH /coordinator-connections/:id/respond-permissions
export async function respondToPermissionRequest(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(respondPermissionRequestSchema, req.body);
  const connection = await svc.respondToPermissionRequest(req.params.id, req.user.id, data);
  success(res, { connection });
}
