import type { Request, Response } from "express";
import { UnauthorizedError } from "../../lib/errors";
import { success } from "../../utils/response";
import { parse } from "../../utils/validate";
import * as svc from "./incident.service";
import { createIncidentSchema } from "../../validators/incident.schema";

// POST /jobs/:id/incidents
export async function createIncident(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data     = parse(createIncidentSchema, req.body);
  const incident = await svc.createIncident(req.params.id, req.user.id, data);
  success(res, { incident }, 201);
}
