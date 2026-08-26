import type { Request, Response } from "express";
import { UnauthorizedError } from "../../lib/errors";
import { success } from "../../utils/response";
import { parse } from "../../utils/validate";
import * as svc from "./coordinator-connection.service";
import {
  createCoordinatorConnectionSchema,
  respondCoordinatorConnectionSchema,
  updateCoordinatorConnectionPermissionsSchema,
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

// PATCH /coordinator-connections/:id/permissions
export async function updatePermissions(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(updateCoordinatorConnectionPermissionsSchema, req.body);
  const connection = await svc.updatePermissions(req.params.id, req.user.id, data);
  success(res, { connection });
}
