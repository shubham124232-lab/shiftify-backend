import type { Request, Response } from "express";
import { success } from "../../utils/response";
import { UnauthorizedError } from "../../lib/errors";
import * as dashboardService from "./dashboard.service";

export async function getSummary(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const summary = await dashboardService.getSummary(req.user.id, req.activeRole!);
  success(res, { summary });
}
