// Profile routes.
// Mounted at /users/me/profile  in app.ts

import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import { blockManagedSelfService } from "../../middleware/managed.middleware";
import * as ctrl from "./profile.controller";

const router = Router();

// GET /users/me/profile/progress
router.get("/progress", requireAuth, asyncHandler(ctrl.getProgress));

// GET /users/me/profile/<role> — read back profile for wizard pre-fill
router.get("/participant",  requireAuth, requireRole("PARTICIPANT"),    asyncHandler(ctrl.getParticipant));
router.get("/worker",       requireAuth, requireRole("SUPPORT_WORKER"), asyncHandler(ctrl.getWorker));
router.get("/provider",     requireAuth, requireRole("PROVIDER"),       asyncHandler(ctrl.getProvider));
router.get("/coordinator",  requireAuth, requireRole("COORDINATOR"),    asyncHandler(ctrl.getCoordinator));
router.get("/plan-manager", requireAuth, requireRole("PLAN_MANAGER"),   asyncHandler(ctrl.getPlanManager));

// POST /users/me/profile/<role> — upsert (MANAGED accounts blocked; parent uses /linking)
router.post("/participant",  requireAuth, blockManagedSelfService, requireRole("PARTICIPANT"),    asyncHandler(ctrl.upsertParticipant));
router.post("/worker",       requireAuth, blockManagedSelfService, requireRole("SUPPORT_WORKER"), asyncHandler(ctrl.upsertWorker));
router.post("/provider",     requireAuth, blockManagedSelfService, requireRole("PROVIDER"),       asyncHandler(ctrl.upsertProvider));
router.post("/coordinator",  requireAuth, blockManagedSelfService, requireRole("COORDINATOR"),    asyncHandler(ctrl.upsertCoordinator));
router.post("/plan-manager", requireAuth, blockManagedSelfService, requireRole("PLAN_MANAGER"),   asyncHandler(ctrl.upsertPlanManager));

// PATCH /users/me/profile/<role> — same upsert semantics, for wizard step-by-step saves
router.patch("/participant",  requireAuth, blockManagedSelfService, requireRole("PARTICIPANT"),    asyncHandler(ctrl.upsertParticipant));
router.patch("/worker",       requireAuth, blockManagedSelfService, requireRole("SUPPORT_WORKER"), asyncHandler(ctrl.upsertWorker));
router.patch("/provider",     requireAuth, blockManagedSelfService, requireRole("PROVIDER"),       asyncHandler(ctrl.upsertProvider));
router.patch("/coordinator",  requireAuth, blockManagedSelfService, requireRole("COORDINATOR"),    asyncHandler(ctrl.upsertCoordinator));
router.patch("/plan-manager", requireAuth, blockManagedSelfService, requireRole("PLAN_MANAGER"),   asyncHandler(ctrl.upsertPlanManager));

export default router;
