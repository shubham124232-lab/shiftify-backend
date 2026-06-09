import type { Request, Response } from "express";
import { createWorkerSchema, createParticipantSchema } from "../../validators/linking.schema";
import * as linkingService from "./linking.service";
import { success } from "../../utils/response";
import { UnauthorizedError } from "../../lib/errors";

// POST /linking/workers — Provider creates a MANAGED SUPPORT_WORKER sub-account
// in DRAFT status. Profile, availability, service area and documents are added
// afterwards from the worker's edit page, then the provider explicitly activates it.
export async function createWorker(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const body = createWorkerSchema.parse(req.body);
  const worker = await linkingService.createWorker({
    parentUserId: req.user.id,
    username:     body.username,
    password:     body.password,
    name:         body.name,
  });
  success(res, { user: worker }, 201);
}

// GET /linking/workers/:id/onboarding-status — completeness check for a draft worker.
export async function getWorkerOnboardingStatus(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const status = await linkingService.getWorkerOnboardingStatus({
    parentUserId: req.user.id,
    workerId:     req.params.id,
  });
  success(res, status);
}

// POST /linking/workers/:id/activate — Provider explicitly finishes setup,
// flipping the worker from DRAFT to ACTIVE once onboarding is complete.
export async function activateWorker(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const worker = await linkingService.activateWorker({
    parentUserId: req.user.id,
    workerId:     req.params.id,
  });
  success(res, { user: worker });
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
