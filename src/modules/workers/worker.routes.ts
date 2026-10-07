import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import * as ctrl from "./worker.controller";

const router = Router();

// GET /workers/available — browse workers who opted into public listing.
// Open to the roles that hire/engage workers directly.
router.get(
  "/available",
  requireAuth,
  requireRole("PARTICIPANT", "COORDINATOR", "PLAN_MANAGER", "PROVIDER"),
  asyncHandler(ctrl.browseAvailableWorkers),
);

export default router;
