import type { Request, Response } from "express";
import { UnauthorizedError, ValidationError, BadRequestError } from "../../lib/errors";
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

// GET /pm/participants
export async function listLinkedParticipants(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const participants = await svc.listLinkedParticipants(req.user.id, role(req));
  success(res, { participants });
}

// POST /pm/referral
export async function postReferral(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const {
    participantUserId, title, description, category,
    suburb, state, scheduledStartAt, scheduledEndAt,
    urgency, fundingType, totalHours,
  } = req.body as Record<string, unknown>;

  if (!participantUserId || !title || !description || !category || !suburb || !state || !scheduledStartAt || !scheduledEndAt) {
    throw new BadRequestError(
      "participantUserId, title, description, category, suburb, state, scheduledStartAt, scheduledEndAt are required",
    );
  }

  const job = await svc.postReferral(req.user.id, role(req), {
    participantUserId: String(participantUserId),
    title:             String(title),
    description:       String(description),
    category:          String(category),
    suburb:            String(suburb),
    state:             String(state),
    scheduledStartAt:  String(scheduledStartAt),
    scheduledEndAt:    String(scheduledEndAt),
    urgency:           urgency ? String(urgency) : undefined,
    fundingType:       fundingType ? String(fundingType) : undefined,
    totalHours:        totalHours !== undefined ? Number(totalHours) : undefined,
  });
  success(res, { job }, 201);
}

// GET /pm/participants/:participantId/budget-statement
export async function getParticipantBudgetStatement(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const statement = await svc.getParticipantBudgetStatement(
    req.user.id,
    req.params.participantId,
    role(req),
  );
  success(res, { statement });
}

// GET /pm/referrals
export async function listReferrals(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const page  = Math.max(1, parseInt(String(req.query.page  ?? "1"),  10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
  const status   = typeof req.query.status   === "string" ? req.query.status   : undefined;
  const result = await svc.listReferrals(req.user.id, role(req), { status, page, limit });
  success(res, result);
}

// GET /pm/load-board
export async function browseLoadBoard(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const page     = Math.max(1, parseInt(String(req.query.page  ?? "1"),  10) || 1);
  const limit    = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const urgency  = typeof req.query.urgency  === "string" ? req.query.urgency  : undefined;
  const suburb   = typeof req.query.suburb   === "string" ? req.query.suburb   : undefined;
  const result = await svc.browseLoadBoard(req.user.id, role(req), { category, urgency, suburb, page, limit });
  success(res, result);
}
