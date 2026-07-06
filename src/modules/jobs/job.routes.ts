import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import * as ctrl from "./job.controller";

const router = Router();

// All routes require authentication
router.use(requireAuth);

// ── Jobs CRUD ──────────────────────────────────────────────────────────────
router.post  ("/",                                    asyncHandler(ctrl.createJob));
router.get   ("/",                                    asyncHandler(ctrl.listJobs));
router.get   ("/my",                                  asyncHandler(ctrl.listMyJobs));
router.get   ("/:id",                                 asyncHandler(ctrl.getJob));
router.patch ("/:id/cancel",                          asyncHandler(ctrl.cancelJob));
router.patch ("/:id/publish",                         asyncHandler(ctrl.publishJob));

// ── Lifecycle ──────────────────────────────────────────────────────────────
router.patch ("/:id/assign-worker",                   asyncHandler(ctrl.assignWorker));
router.patch ("/:id/start",                           asyncHandler(ctrl.startJob));
router.patch ("/:id/complete",                        asyncHandler(ctrl.completeJob));
router.patch ("/:id/confirm",                         asyncHandler(ctrl.confirmJob));

// ── Applications ───────────────────────────────────────────────────────────
router.post  ("/:id/apply",                           asyncHandler(ctrl.applyToJob));
router.get   ("/:id/applications",                    asyncHandler(ctrl.listApplications));
router.patch ("/:id/applications/:appId/select",      asyncHandler(ctrl.selectApplicant));
router.patch ("/:id/applications/:appId/shortlist",   asyncHandler(ctrl.shortlistApplicant));
router.patch ("/:id/applications/:appId/decline",     asyncHandler(ctrl.declineApplicant));
router.patch ("/:id/applications/:appId/withdraw",    asyncHandler(ctrl.withdrawApplication));

// ── Messaging ──────────────────────────────────────────────────────────────
router.post  ("/:id/messages",                        asyncHandler(ctrl.sendMessage));
router.get   ("/:id/messages",                        asyncHandler(ctrl.getMessages));

// ── Invoices ───────────────────────────────────────────────────────────────
router.post  ("/:id/invoice",                         asyncHandler(ctrl.createInvoice));

export default router;
