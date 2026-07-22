import type { Request, Response } from "express";
import { UnauthorizedError } from "../../lib/errors";
import { success } from "../../utils/response";
import { parse } from "../../utils/validate";
import * as svc from "./review.service";
import { createReviewSchema } from "../../validators/job.schema";

// POST /jobs/:id/reviews
export async function createReview(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data   = parse(createReviewSchema, req.body);
  const review = await svc.createReview(req.params.id, req.user.id, data);
  success(res, { review }, 201);
}

// GET /jobs/:id/reviews
export async function listReviews(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const reviews = await svc.listReviews(req.params.id);
  success(res, { reviews });
}
