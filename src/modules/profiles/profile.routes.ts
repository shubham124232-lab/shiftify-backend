// Profile routes.
// Mounted at /users/me/profile  in app.ts → POST /participant, /worker, /provider, etc.
// Availability routes also live here, accessed via the /users/me mount in user.routes.ts.

import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import * as ctrl from "./profile.controller";

const router = Router();

// ── Progress ───────────────────────────────────────────────────────────────
router.get("/progress", requireAuth, asyncHandler(ctrl.getProgress));

// ── Role-specific profile upserts ─────────────────────────────────────────
router.post("/participant",  requireAuth, requireRole("PARTICIPANT"),   asyncHandler(ctrl.upsertParticipant));
router.post("/worker",       requireAuth, requireRole("SUPPORT_WORKER"), asyncHandler(ctrl.upsertWorker));
router.post("/provider",     requireAuth, requireRole("PROVIDER"),      asyncHandler(ctrl.upsertProvider));
router.post("/coordinator",  requireAuth, requireRole("COORDINATOR"),   asyncHandler(ctrl.upsertCoordinator));
router.post("/plan-manager", requireAuth, requireRole("PLAN_MANAGER"),  asyncHandler(ctrl.upsertPlanManager));

export default router;
