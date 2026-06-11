import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import { uploadMiddleware } from "../../middleware/upload.middleware";
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

// ── Parent-managed onboarding (Provider fills profile + docs for the worker) ──
router.post(
  "/workers/:id/profile",
  requireAuth,
  requireRole("PROVIDER"),
  asyncHandler(ctrl.upsertWorkerProfile),
);
router.post(
  "/workers/:id/documents",
  requireAuth,
  requireRole("PROVIDER"),
  uploadMiddleware.single("file"),
  asyncHandler(ctrl.uploadWorkerDocument),
);
router.get(
  "/workers/:id/documents",
  requireAuth,
  requireRole("PROVIDER"),
  asyncHandler(ctrl.listWorkerDocuments),
);
router.delete(
  "/workers/:id/documents/:docId",
  requireAuth,
  requireRole("PROVIDER"),
  asyncHandler(ctrl.deleteWorkerDocument),
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

// ── Parent-managed onboarding (Coordinator fills the participant's profile) ──
router.post(
  "/participants/:id/profile",
  requireAuth,
  requireRole("COORDINATOR"),
  asyncHandler(ctrl.upsertParticipantProfile),
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
