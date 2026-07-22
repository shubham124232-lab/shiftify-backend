import type { Request, Response } from "express";
import { UnauthorizedError } from "../../lib/errors";
import { paginated } from "../../utils/response";
import { parse } from "../../utils/validate";
import * as svc from "./worker.service";
import { browseWorkersFiltersSchema } from "../../validators/worker-browse.schema";

// GET /workers/available
export async function browseAvailableWorkers(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const filters = parse(browseWorkersFiltersSchema, req.query);
  const { workers, total, page, limit } = await svc.browseAvailableWorkers(filters);
  paginated(res, workers, total, page, limit);
}
