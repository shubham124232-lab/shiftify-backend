import type { Request, Response } from "express";
import { UnauthorizedError } from "../../lib/errors";
import { paginated, success } from "../../utils/response";
import { parse } from "../../utils/validate";
import * as svc from "./professional-search.service";
import { professionalSearchFiltersSchema, inviteFromSearchSchema } from "../../validators/professional-search.schema";

// GET /professional-search — SC-F01-04
export async function search(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const filters = parse(professionalSearchFiltersSchema, req.query);
  const { results, total, page, limit } = await svc.searchProfessionals(req.user.id, filters);
  paginated(res, results, total, page, limit);
}

// GET /professional-search/:userId — SC-F05
export async function getProfile(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const profile = await svc.getProfessionalProfile(req.user.id, req.params.userId);
  success(res, { profile });
}

// POST /professional-search/connect — SC-F06 (shortlist / preferred-backup actions only;
// invite-to-existing-request and create-new-request go through their own existing endpoints)
export async function connect(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(inviteFromSearchSchema, req.body);
  const result = await svc.connectFromSearch(req.user.id, data);
  success(res, { result }, 201);
}
