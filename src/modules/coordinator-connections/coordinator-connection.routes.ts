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

// SC-C04 — whichever side sent a still-pending request can resend or cancel it.
router.post(
  "/:id/resend",
  requireRole("COORDINATOR", "PARTICIPANT"),
  asyncHandler(ctrl.resendConnection),
);
router.patch(
  "/:id/cancel",
  requireRole("COORDINATOR", "PARTICIPANT"),
  asyncHandler(ctrl.cancelConnection),
);

// Participant adjusts granular permissions on an accepted connection.
router.patch(
  "/:id/permissions",
  requireRole("PARTICIPANT"),
  asyncHandler(ctrl.updatePermissions),
);

// SC-P01 — coordinator asks the participant to approve a specific posting
// instead of self-certifying authority.
router.post(
  "/request-posting-approval",
  requireRole("COORDINATOR"),
  asyncHandler(ctrl.requestPostingApproval),
);

// Participant approves or declines a pending posting-approval request.
router.patch(
  "/:id/respond-posting-approval",
  requireRole("PARTICIPANT"),
  asyncHandler(ctrl.respondToPostingApproval),
);

// SC-PT04 — coordinator requests one or more additional permissions.
router.post(
  "/request-permissions",
  requireRole("COORDINATOR"),
  asyncHandler(ctrl.requestPermissions),
);

// Participant approves or declines a pending permission request.
router.patch(
  "/:id/respond-permissions",
  requireRole("PARTICIPANT"),
  asyncHandler(ctrl.respondToPermissionRequest),
);

export default router;
