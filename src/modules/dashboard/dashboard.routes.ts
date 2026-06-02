import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import * as ctrl from "./dashboard.controller";

const router = Router();

// GET /dashboard/summary — returns role-scoped summary with real DB counts + placeholders
router.get("/summary", requireAuth, asyncHandler(ctrl.getSummary));

export default router;
