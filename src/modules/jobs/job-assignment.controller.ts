import type { Request, Response } from "express";
import { UnauthorizedError } from "../../lib/errors";
import { success } from "../../utils/response";
import { parse } from "../../utils/validate";
import * as svc from "./job-assignment.service";
import { createAssignmentSchema, updateAssignmentStatusSchema } from "../../validators/job.schema";

// POST /jobs/:id/assignments
export async function createAssignment(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data       = parse(createAssignmentSchema, req.body);
  const assignment = await svc.createAssignment(req.params.id, req.user.id, data);
  success(res, { assignment }, 201);
}

// GET /jobs/:id/assignments
export async function listAssignments(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const assignments = await svc.listAssignments(req.params.id, req.user.id);
  success(res, { assignments });
}

// PATCH /jobs/:id/assignments/:assignmentId/status
export async function updateAssignmentStatus(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data       = parse(updateAssignmentStatusSchema, req.body);
  const assignment = await svc.updateAssignmentStatus(req.params.id, req.params.assignmentId, req.user.id, data);
  success(res, { assignment });
}
