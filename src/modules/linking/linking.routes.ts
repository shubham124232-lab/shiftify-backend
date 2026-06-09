import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import * as ctrl from "./linking.controller";

const router = Router();

// ── Workers (Provider only) ───────────────────────────────────────────────
router.post(
  "/workers",
  requireAuth,
  requireRole("PROVIDER"),
  asyncHandler(ctrl.createWorker),
);
router.get(
  "/workers",
  requireAuth,
  requireRole("PROVIDER"),
  asyncHandler(ctrl.listWorkers),
);
router.get(
  "/workers/:id/onboarding-status",
  requireAuth,
  requireRole("PROVIDER"),
  asyncHandler(ctrl.getWorkerOnboardingStatus),
);
router.post(
  "/workers/:id/activate",
  requireAuth,
  requireRole("PROVIDER"),
  asyncHandler(ctrl.activateWorker),
);

// ── Participants (Coordinator only) ──────────────────────────────────────
router.post(
  "/participants",
  requireAuth,
  requireRole("COORDINATOR"),
  asyncHandler(ctrl.createParticipant),
);
router.get(
  "/participants",
  requireAuth,
  requireRole("COORDINATOR"),
  asyncHandler(ctrl.listParticipants),
);

// ── Unlink (parent detaches managed sub-account; admin can also call) ────
// Provider unlinks worker — requireRole("PROVIDER") enforces active role;
// admin bypass is handled inside the service via callerIsAdmin flag.
router.delete(
  "/workers/:id",
  requireAuth,
  requireRole("PROVIDER"),
  asyncHandler(ctrl.unlinkWorker),
);
router.delete(
  "/participants/:id",
  requireAuth,
  requireRole("COORDINATOR"),
  asyncHandler(ctrl.unlinkParticipant),
);

export default router;
