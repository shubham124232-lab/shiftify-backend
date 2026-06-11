// Profile routes.
// Mounted at /users/me/profile  in app.ts → POST /participant, /worker, /provider, etc.
// Availability routes also live here, accessed via the /users/me mount in user.routes.ts.

import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import { blockManagedSelfService } from "../../middleware/managed.middleware";
import * as ctrl from "./profile.controller";

const router = Router();

// ── Progress ───────────────────────────────────────────────────────────────
router.get("/progress", requireAuth, asyncHandler(ctrl.getProgress));

// ── Role-specific profile upserts ─────────────────────────────────────────
// MANAGED accounts are read-only here — the parent fills their profile via
// POST /linking/workers/:id/profile or /linking/participants/:id/profile.
router.post("/participant",  requireAuth, blockManagedSelfService, requireRole("PARTICIPANT"),   asyncHandler(ctrl.upsertParticipant));
router.post("/worker",       requireAuth, blockManagedSelfService, requireRole("SUPPORT_WORKER"), asyncHandler(ctrl.upsertWorker));
router.post("/provider",     requireAuth, blockManagedSelfService, requireRole("PROVIDER"),      asyncHandler(ctrl.upsertProvider));
router.post("/coordinator",  requireAuth, blockManagedSelfService, requireRole("COORDINATOR"),   asyncHandler(ctrl.upsertCoordinator));
router.post("/plan-manager", requireAuth, blockManagedSelfService, requireRole("PLAN_MANAGER"),  asyncHandler(ctrl.upsertPlanManager));

export default router;
