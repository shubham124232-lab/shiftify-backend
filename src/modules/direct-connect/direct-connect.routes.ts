import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import * as ctrl from "./direct-connect.controller";

const router = Router();

router.use(requireAuth);

// Provider sends an invite to a worker off their public listing.
router.post(
  "/",
  requireRole("PROVIDER"),
  asyncHandler(ctrl.createDirectConnect),
);

// Provider views sent invites, worker views received invites.
router.get(
  "/",
  requireRole("PROVIDER", "SUPPORT_WORKER"),
  asyncHandler(ctrl.listDirectConnects),
);

// Worker accepts or declines.
router.patch(
  "/:id/respond",
  requireRole("SUPPORT_WORKER"),
  asyncHandler(ctrl.respondToDirectConnect),
);

export default router;
