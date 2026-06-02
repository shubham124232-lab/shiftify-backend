import type { Request, Response } from "express";
import { createWorkerSchema, createParticipantSchema } from "../../validators/linking.schema";
import * as linkingService from "./linking.service";
import { success } from "../../utils/response";
import { UnauthorizedError } from "../../lib/errors";

// POST /linking/workers — Provider creates a MANAGED SUPPORT_WORKER sub-account.
export async function createWorker(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const body = createWorkerSchema.parse(req.body);
  const worker = await linkingService.createWorker({
    parentUserId: req.user.id,
    username: body.username,
    password: body.password,
    name: body.name,
  });
  success(res, { user: worker }, 201);
}

// GET /linking/workers — Provider lists their managed workers.
export async function listWorkers(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const workers = await linkingService.listWorkers(req.user.id);
  success(res, { users: workers });
}

// POST /linking/participants — Coordinator creates a MANAGED PARTICIPANT sub-account.
export async function createParticipant(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const body = createParticipantSchema.parse(req.body);
  const participant = await linkingService.createParticipant({
    parentUserId: req.user.id,
    username: body.username,
    password: body.password,
    name: body.name,
  });
  success(res, { user: participant }, 201);
}

// GET /linking/participants — Coordinator lists their managed participants.
export async function listParticipants(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const participants = await linkingService.listParticipants(req.user.id);
  success(res, { users: participants });
}

// DELETE /linking/workers/:id — Provider (or admin) unlinks a managed worker.
export async function unlinkWorker(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  await linkingService.unlinkWorker({
    callerId: req.user.id,
    callerIsAdmin: req.activeRole === "ADMIN",
    workerId: req.params.id,
  });
  success(res, { ok: true });
}

// DELETE /linking/participants/:id — Coordinator (or admin) unlinks a managed participant.
export async function unlinkParticipant(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  await linkingService.unlinkParticipant({
    callerId: req.user.id,
    callerIsAdmin: req.activeRole === "ADMIN",
    participantId: req.params.id,
  });
  success(res, { ok: true });
}
