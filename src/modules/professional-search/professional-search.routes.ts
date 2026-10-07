import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import * as ctrl from "./professional-search.controller";

const router = Router();

// SC-F01-06 "Find directly" — Coordinator-only per the SC journey doc.
router.use(requireAuth, requireRole("COORDINATOR"));

router.get ("/",         asyncHandler(ctrl.search));
router.post("/connect",  asyncHandler(ctrl.connect));
router.get ("/:userId",  asyncHandler(ctrl.getProfile));

export default router;
