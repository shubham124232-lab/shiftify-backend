import type { Request, Response } from "express";
import { UnauthorizedError, ValidationError } from "../../lib/errors";
import { success } from "../../utils/response";
import * as svc from "./pm.service";
import { createPmConnectionSchema, respondPmConnectionSchema } from "../../validators/pm.schema";
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

// POST /pm/connect
export async function createConnection(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(createPmConnectionSchema, req.body);
  const conn = await svc.createConnection(req.user.id, role(req), data);
  success(res, { connection: conn }, 201);
}

// GET /pm/connections
export async function listConnections(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const connections = await svc.listConnections(req.user.id, role(req));
  success(res, { connections });
}

// PATCH /pm/connections/:id/respond
export async function respondToConnection(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(respondPmConnectionSchema, req.body);
  const conn = await svc.respondToConnection(req.params.id, req.user.id, role(req), data);
  success(res, { connection: conn });
}
