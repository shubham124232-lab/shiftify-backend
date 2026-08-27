import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import * as ctrl from "./job.controller";
import * as reviewCtrl from "./review.controller";
import * as assignmentCtrl from "./job-assignment.controller";
import * as incidentCtrl from "../incidents/incident.controller";

const router = Router();

// All routes require authentication
router.use(requireAuth);

// ── Jobs CRUD ──────────────────────────────────────────────────────────────
router.post  ("/",                                    asyncHandler(ctrl.createJob));
router.get   ("/",                                    asyncHandler(ctrl.listJobs));
router.get   ("/live-dashboard",                      asyncHandler(ctrl.listLiveDashboardJobs));
router.get   ("/my",                                  asyncHandler(ctrl.listMyJobs));
router.get   ("/connections/mine",                    asyncHandler(ctrl.listMyConnections));
router.get   ("/messages/threads",                    asyncHandler(ctrl.listMessageThreads));
router.patch ("/meet-and-greet/:magId/respond",       asyncHandler(ctrl.respondToMeetAndGreet));
router.patch ("/change-request/:changeRequestId/respond", asyncHandler(ctrl.respondToJobChange));
router.get   ("/:id",                                 asyncHandler(ctrl.getJob));
router.patch ("/:id",                                 asyncHandler(ctrl.updateDraftJob));
router.patch ("/:id/cancel",                          asyncHandler(ctrl.cancelJob));
router.post  ("/:id/replacement",                     asyncHandler(ctrl.createReplacementRequest));
router.post  ("/:id/duplicate",                       asyncHandler(ctrl.duplicateJob));
router.patch ("/:id/publish",                         asyncHandler(ctrl.publishJob));

// ── Lifecycle ──────────────────────────────────────────────────────────────
router.patch ("/:id/assign-worker",                   asyncHandler(ctrl.assignWorker));
router.patch ("/:id/confirm-assignment",              asyncHandler(ctrl.confirmAssignment));
router.patch ("/:id/start",                           asyncHandler(ctrl.startJob));
router.patch ("/:id/complete",                        asyncHandler(ctrl.completeJob));
router.patch ("/:id/confirm",                         asyncHandler(ctrl.confirmJob));

// ── Multi-worker roster (additive to assign-worker above) ──────────────────
router.post  ("/:id/assignments",                     asyncHandler(assignmentCtrl.createAssignment));
router.get   ("/:id/assignments",                     asyncHandler(assignmentCtrl.listAssignments));
router.patch ("/:id/assignments/:assignmentId/status", asyncHandler(assignmentCtrl.updateAssignmentStatus));

// ── Applications ───────────────────────────────────────────────────────────
router.post  ("/:id/apply",                           asyncHandler(ctrl.applyToJob));
router.get   ("/:id/applications",                    asyncHandler(ctrl.listApplications));
router.patch ("/:id/applications/:appId/select",      asyncHandler(ctrl.selectApplicant));
router.post  ("/:id/featured-shift",                  asyncHandler(ctrl.purchaseFeaturedShift));
router.patch ("/:id/applications/:appId/shortlist",   asyncHandler(ctrl.shortlistApplicant));
router.patch ("/:id/applications/:appId/decline",     asyncHandler(ctrl.declineApplicant));
router.patch ("/:id/applications/:appId/withdraw",    asyncHandler(ctrl.withdrawApplication));
router.patch ("/:id/decline-assignment",              asyncHandler(ctrl.declineAssignment));
router.patch ("/:id/close-connection",                asyncHandler(ctrl.closeConnection));
router.patch ("/:id/save",                            asyncHandler(ctrl.bookmarkJob));
router.delete("/:id/save",                            asyncHandler(ctrl.removeBookmark));
router.patch ("/:id/running-late",                    asyncHandler(ctrl.notifyRunningLate));
router.patch ("/:id/worker-note",                     asyncHandler(ctrl.saveWorkerNote));
router.post  ("/:id/meet-and-greet",                  asyncHandler(ctrl.proposeMeetAndGreet));
router.post  ("/:id/change-request",                  asyncHandler(ctrl.requestJobChange));

// ── Messaging ──────────────────────────────────────────────────────────────
router.post  ("/:id/messages",                        asyncHandler(ctrl.sendMessage));
router.get   ("/:id/messages",                        asyncHandler(ctrl.getMessages));
router.patch ("/:id/messages/read",                   asyncHandler(ctrl.markThreadRead));
router.patch ("/:id/messages/archive",                asyncHandler(ctrl.archiveThread));

// ── Invoices ───────────────────────────────────────────────────────────────
router.get   ("/:id/invoice-recipients",              asyncHandler(ctrl.getInvoiceRecipients));
router.post  ("/:id/invoice",                         asyncHandler(ctrl.createInvoice));

// ── Reviews ────────────────────────────────────────────────────────────────
router.post  ("/:id/reviews",                         asyncHandler(reviewCtrl.createReview));
router.get   ("/:id/reviews",                         asyncHandler(reviewCtrl.listReviews));

// ── Incidents (pilot safety gate) ───────────────────────────────────────────
router.post  ("/:id/incidents",                       asyncHandler(incidentCtrl.createIncident));
router.get   ("/:id/incidents/draft",                 asyncHandler(incidentCtrl.getDraftIncident));
router.patch ("/:id/incidents/:incidentId",           asyncHandler(incidentCtrl.updateIncident));

export default router;
