import type { Request, Response } from "express";
import { UnauthorizedError } from "../../lib/errors";
import { success } from "../../utils/response";
import { parse } from "../../utils/validate";
import * as svc from "./saved-search.service";
import { createSavedSearchSchema, updateSavedSearchSchema } from "../../validators/saved-search.schema";

// POST /saved-searches
export async function createSavedSearch(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(createSavedSearchSchema, req.body);
  const savedSearch = await svc.createSavedSearch(req.user.id, data);
  success(res, { savedSearch }, 201);
}

// GET /saved-searches
export async function listSavedSearches(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const savedSearches = await svc.listSavedSearches(req.user.id);
  success(res, { savedSearches });
}

// PATCH /saved-searches/:id
export async function updateSavedSearch(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parse(updateSavedSearchSchema, req.body);
  const savedSearch = await svc.updateSavedSearch(req.user.id, req.params.id, data);
  success(res, { savedSearch });
}

// DELETE /saved-searches/:id
export async function deleteSavedSearch(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  await svc.deleteSavedSearch(req.user.id, req.params.id);
  success(res, { deleted: true });
}
