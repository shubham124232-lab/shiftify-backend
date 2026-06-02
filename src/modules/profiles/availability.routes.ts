// Availability routes — mounted at /users/me/availability in app.ts.
// All require SUPPORT_WORKER active role.

import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import * as ctrl from "./profile.controller";

const router = Router();

// GET  /users/me/availability
router.get("/", requireAuth, requireRole("SUPPORT_WORKER"), asyncHandler(ctrl.getAvailability));

// PUT  /users/me/availability  — replaces all slots
router.put("/", requireAuth, requireRole("SUPPORT_WORKER"), asyncHandler(ctrl.replaceAvailability));

// POST /users/me/unavailability
router.post("/unavailability", requireAuth, requireRole("SUPPORT_WORKER"), asyncHandler(ctrl.addUnavailability));

// DELETE /users/me/unavailability/:id
router.delete("/unavailability/:id", requireAuth, requireRole("SUPPORT_WORKER"), asyncHandler(ctrl.deleteUnavailability));

export default router;
