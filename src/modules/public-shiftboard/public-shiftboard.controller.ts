import type { Request, Response } from "express";
import { success } from "../../utils/response";
import { parse } from "../../utils/validate";
import { publicShiftboardFiltersSchema } from "../../validators/public-shiftboard.schema";
import * as svc from "./public-shiftboard.service";

// GET /public/shiftboard — no req.user anywhere in this file. This route is
// mounted outside requireAuth (see app.ts) and must stay that way.
export async function listShiftboard(req: Request, res: Response): Promise<void> {
  const filters = parse(publicShiftboardFiltersSchema, req.query);
  const result = await svc.listPublicShiftboardJobs(filters);
  success(res, result);
}
