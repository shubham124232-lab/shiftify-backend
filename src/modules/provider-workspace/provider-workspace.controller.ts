import type { Request, Response } from "express";
import { z } from "zod";
import { UnauthorizedError } from "../../lib/errors";
import { success } from "../../utils/response";
import { parse } from "../../utils/validate";
import * as svc from "./provider-workspace.service";

const uid = (req: Request): string => {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
};

export async function getMatched(req: Request, res: Response): Promise<void> { success(res, await svc.matchedRequests(uid(req))); }
export async function getBrowse(req: Request, res: Response): Promise<void> { success(res, await svc.browseRequests(uid(req))); }
export async function getSaved(req: Request, res: Response): Promise<void> { success(res, await svc.savedRequests(uid(req))); }
export async function getConfirmedStarts(req: Request, res: Response): Promise<void> { success(res, await svc.confirmedStarts(uid(req))); }
export async function getOffersAndAssignments(req: Request, res: Response): Promise<void> { success(res, await svc.offersAndAssignments(uid(req))); }
export async function getPromotions(req: Request, res: Response): Promise<void> { success(res, await svc.promotions(uid(req))); }

const serviceStartSchema = z.object({
  agreedStartAt: z.string().datetime({ offset: true }).nullable().optional(),
  nominatedWorkerId: z.string().uuid().nullable().optional(),
  serviceAgreement: z.enum(["AGREED", "PENDING"]).optional(),
  participantAgreement: z.enum(["CONFIRMED", "PENDING"]).optional(),
  notes: z.string().max(2000).optional(),
  isDraft: z.boolean().optional(),
}).strict();
export async function putServiceStart(req: Request, res: Response): Promise<void> {
  const body = parse(serviceStartSchema, req.body);
  success(res, { record: await svc.saveServiceStart(uid(req), req.params.jobId, body) });
}

export async function getReports(req: Request, res: Response): Promise<void> {
  const q = parse(z.object({ from: z.string().optional(), to: z.string().optional() }), req.query);
  success(res, { report: await svc.reports(uid(req), q.from, q.to) });
}

export async function getTeamAvailability(req: Request, res: Response): Promise<void> { success(res, await svc.teamAvailability(uid(req))); }

const createRequestSchema = z.object({
  jobId: z.string().uuid().optional(),
  title: z.string().min(1).max(200).optional(),
  message: z.string().max(1000).optional(),
  memberKeys: z.array(z.string().max(60)).min(1).max(100),
}).strict();

export async function createAvailabilityRequest(req: Request, res: Response): Promise<void> {
  const data = parse(createRequestSchema, req.body);
  success(res, { request: await svc.createAvailabilityRequest(uid(req), data) }, 201);
}

const replySchema = z.object({ status: z.enum(["AVAILABLE", "UNAVAILABLE"]) }).strict();

export async function recordRosterReply(req: Request, res: Response): Promise<void> {
  const { status } = parse(replySchema, req.body);
  success(res, { reply: await svc.recordRosterReply(uid(req), req.params.id, status) });
}

export async function getMyAvailabilityRequests(req: Request, res: Response): Promise<void> {
  success(res, { requests: await svc.myAvailabilityRequests(uid(req)) });
}

export async function respondToAvailabilityRequest(req: Request, res: Response): Promise<void> {
  const { status } = parse(replySchema, req.body);
  success(res, { reply: await svc.respondToAvailabilityRequest(uid(req), req.params.id, status) });
}

// ─── Internal shift offers ────────────────────────────────────────────────────

const createOfferSchema = z.object({ jobId: z.string().uuid(), memberKey: z.string().max(60) }).strict();
const offerResponseSchema = z.object({ status: z.enum(["ACCEPTED", "DECLINED"]) }).strict();

export async function createInternalOffer(req: Request, res: Response): Promise<void> {
  const data = parse(createOfferSchema, req.body);
  success(res, { offer: await svc.createInternalOffer(uid(req), data) }, 201);
}

export async function recordInternalOfferResponse(req: Request, res: Response): Promise<void> {
  const { status } = parse(offerResponseSchema, req.body);
  success(res, { offer: await svc.recordInternalOfferResponse(uid(req), req.params.id, status) });
}

export async function confirmInternalOffer(req: Request, res: Response): Promise<void> {
  success(res, await svc.confirmInternalOffer(uid(req), req.params.id));
}

export async function getMyInternalOffers(req: Request, res: Response): Promise<void> {
  success(res, { offers: await svc.myInternalOffers(uid(req)) });
}

export async function respondToInternalOffer(req: Request, res: Response): Promise<void> {
  const { status } = parse(offerResponseSchema, req.body);
  success(res, { offer: await svc.respondToInternalOffer(uid(req), req.params.id, status) });
}
