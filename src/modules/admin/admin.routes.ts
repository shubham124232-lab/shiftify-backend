import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAdmin, requireSuperAdmin } from "../../middleware/role.middleware";
import * as ctrl from "./admin.controller";

const router = Router();

router.use(requireAuth, requireAdmin);

// ── DB Snapshot — SUPER_ADMIN only ────────────────────────────────────────────
router.get("/db-snapshot", requireSuperAdmin, asyncHandler(ctrl.getDbSnapshot));

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get("/stats", asyncHandler(ctrl.getStats));

// ── User management ───────────────────────────────────────────────────────────
router.get("/users",              asyncHandler(ctrl.listUsers));
router.get("/users/:id",          asyncHandler(ctrl.getUser));
router.patch("/users/:id/status", asyncHandler(ctrl.updateUserStatus));
router.post("/users/:id/notify",  asyncHandler(ctrl.notifyUser));

// ── Verification queue — SUSPENDED users only ─────────────────────────────────
router.get("/verification-queue",  asyncHandler(ctrl.getSuspendedQueue));
router.patch("/users/:id/verify",  asyncHandler(ctrl.verifyUser));

// ── Jobs ──────────────────────────────────────────────────────────────────────
router.get("/jobs",              asyncHandler(ctrl.listJobs));
router.patch("/jobs/:id/cancel", asyncHandler(ctrl.cancelJob));

// ── Documents ─────────────────────────────────────────────────────────────────
router.get("/documents/:id/view",    asyncHandler(ctrl.viewDocument));
router.patch("/documents/:id/verify", asyncHandler(ctrl.verifyDocument));

// ── Subscriptions ─────────────────────────────────────────────────────────────
router.get("/subscriptions",                asyncHandler(ctrl.listSubscriptions));
router.patch("/subscriptions/:id/cancel",   asyncHandler(ctrl.cancelSubscription));

// ── Broadcast ─────────────────────────────────────────────────────────────────
router.post("/broadcast", requireSuperAdmin, asyncHandler(ctrl.broadcast));

// ── Reports / Analytics ───────────────────────────────────────────────────────
router.get("/reports", asyncHandler(ctrl.getReports));

// ── Audit log — SUPER_ADMIN only ──────────────────────────────────────────────
router.get("/audit-log", requireSuperAdmin, asyncHandler(ctrl.getAuditLog));

export default router;
