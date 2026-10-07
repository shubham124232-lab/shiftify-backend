import type { Request, Response } from "express";
import { UnauthorizedError } from "../../lib/errors";
import { success } from "../../utils/response";
import { parse } from "../../utils/validate";
import * as svc from "./direct-connect.service";
import { createDirectConnectSchema, respondDirectConnectSchema } from "../../validators/direct-connect.schema";

// POST /direct-connect
export async function createDirectConnect(req: Request, res: Response): Promise<void> {
  if (!req.user || !req.activeRole) throw new UnauthorizedError();
  const data = parse(createDirectConnectSchema, req.body);
  const request = await svc.createDirectConnect(req.user.id, req.activeRole, data);
  success(res, { request }, 201);
}

// GET /direct-connect
export async function listDirectConnects(req: Request, res: Response): Promise<void> {
  if (!req.user || !req.activeRole) throw new UnauthorizedError();
  const requests = await svc.listDirectConnects(req.user.id, req.activeRole);
  success(res, { requests });
}

// PATCH /direct-connect/:id/respond
export async function respondToDirectConnect(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(respondDirectConnectSchema, req.body);
  const request = await svc.respondToDirectConnect(req.params.id, req.user.id, data);
  success(res, { request });
}
