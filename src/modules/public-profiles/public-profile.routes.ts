import { Router } from "express";
import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import { success } from "../../utils/response";
import { UnauthorizedError } from "../../lib/errors";
import * as svc from "./public-profile.service";

const router = Router();

// GET /public-profiles/:userId
router.get("/:userId", requireAuth, asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  success(res, await svc.getPublicProfile(req.user.id, req.params.userId));
}));

export default router;
