import type { Request, Response } from "express";
import { UnauthorizedError } from "../../lib/errors";
import { success } from "../../utils/response";
import { parse } from "../../utils/validate";
import * as svc from "./saved-professional.service";
import {
  createSavedProfessionalSchema,
  listSavedProfessionalsQuerySchema,
  removeSavedProfessionalQuerySchema,
} from "../../validators/saved-professional.schema";

// POST /saved-professionals
export async function saveProfessional(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(createSavedProfessionalSchema, req.body);
  const saved = await svc.saveProfessional(req.user.id, data);
  success(res, { saved }, 201);
}

// GET /saved-professionals?listType=
export async function listSavedProfessionals(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const query = parse(listSavedProfessionalsQuerySchema, req.query);
  const saved = await svc.listSavedProfessionals(req.user.id, query.listType);
  success(res, { saved });
}

// DELETE /saved-professionals/:professionalUserId?listType=&forParticipantUserId=
export async function removeSavedProfessional(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const query = parse(removeSavedProfessionalQuerySchema, req.query);
  await svc.removeSavedProfessional(req.user.id, req.params.professionalUserId, query.listType, query.forParticipantUserId);
  success(res, { removed: true });
}
