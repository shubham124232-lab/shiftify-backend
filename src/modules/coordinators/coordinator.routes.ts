import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import * as ctrl from "./coordinator.controller";

const router = Router();

// GET /coordinators/available — browse Coordinators who've finished onboarding.
// Open to Participants looking to engage a Support Coordinator directly.
router.get(
  "/available",
  requireAuth,
  requireRole("PARTICIPANT"),
  asyncHandler(ctrl.browseCoordinators),
);

export default router;
