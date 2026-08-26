import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import * as ctrl from "./coordinator-connection.controller";

const router = Router();

router.use(requireAuth);

// Either side sends a request — a Coordinator connecting to a participant they
// know, or a Participant enquiring from a coordinator's public profile.
router.post(
  "/",
  requireRole("COORDINATOR", "PARTICIPANT"),
  asyncHandler(ctrl.createConnection),
);

// Coordinator views their inbox (sent + received, filterable client-side by
// status), participant views their connections.
router.get(
  "/",
  requireRole("COORDINATOR", "PARTICIPANT"),
  asyncHandler(ctrl.listConnections),
);

// Whichever side did not initiate accepts or declines.
router.patch(
  "/:id/respond",
  requireRole("COORDINATOR", "PARTICIPANT"),
  asyncHandler(ctrl.respondToConnection),
);

// Participant adjusts granular permissions on an accepted connection.
router.patch(
  "/:id/permissions",
  requireRole("PARTICIPANT"),
  asyncHandler(ctrl.updatePermissions),
);

export default router;
