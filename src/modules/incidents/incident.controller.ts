import type { Request, Response } from "express";
import { UnauthorizedError } from "../../lib/errors";
import { success } from "../../utils/response";
import { parse } from "../../utils/validate";
import * as svc from "./incident.service";
import { createIncidentSchema, updateIncidentSchema } from "../../validators/incident.schema";

// POST /jobs/:id/incidents
export async function createIncident(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data     = parse(createIncidentSchema, req.body);
  const incident = await svc.createIncident(req.params.id, req.user.id, data);
  success(res, { incident }, 201);
}

// GET /jobs/:id/incidents/draft — resume an in-progress report for this job, if any.
export async function getDraftIncident(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const incident = await svc.getDraftIncident(req.params.id, req.user.id);
  success(res, { incident });
}

// PATCH /jobs/:id/incidents/:incidentId — complete a draft and/or attach evidence.
export async function updateIncident(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data     = parse(updateIncidentSchema, req.body);
  const incident = await svc.updateIncident(req.params.incidentId, req.user.id, data);
  success(res, { incident });
}
