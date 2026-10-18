import { Router } from "express";
import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import { UnauthorizedError } from "../../lib/errors";
import { success } from "../../utils/response";
import { myReferrals } from "./refer-earn.service";

const router = Router();
router.use(requireAuth);

router.get("/me", requireRole("PROVIDER"), asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  success(res, await myReferrals(req.user.id));
}));

export default router;
