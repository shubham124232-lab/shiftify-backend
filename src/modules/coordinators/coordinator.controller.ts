import type { Request, Response } from "express";
import { UnauthorizedError } from "../../lib/errors";
import { paginated } from "../../utils/response";
import { parse } from "../../utils/validate";
import * as svc from "./coordinator.service";
import { browseCoordinatorsFiltersSchema } from "../../validators/coordinator-browse.schema";

// GET /coordinators/available
export async function browseCoordinators(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const filters = parse(browseCoordinatorsFiltersSchema, req.query);
  const { coordinators, total, page, limit } = await svc.browseCoordinators(filters);
  paginated(res, coordinators, total, page, limit);
}
