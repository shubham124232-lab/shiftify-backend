import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import * as ctrl from "./provider-workspace.controller";

const router = Router();

router.use(requireAuth);

// Provider pages
router.get("/matched-requests",       requireRole("PROVIDER"), asyncHandler(ctrl.getMatched));
router.get("/browse-requests",        requireRole("PROVIDER"), asyncHandler(ctrl.getBrowse));
router.get("/saved-requests",         requireRole("PROVIDER"), asyncHandler(ctrl.getSaved));
router.get("/confirmed-starts",       requireRole("PROVIDER"), asyncHandler(ctrl.getConfirmedStarts));
router.get("/offers-assignments",     requireRole("PROVIDER"), asyncHandler(ctrl.getOffersAndAssignments));
router.get("/reports",                requireRole("PROVIDER"), asyncHandler(ctrl.getReports));
router.get("/promotions",             requireRole("PROVIDER"), asyncHandler(ctrl.getPromotions));
router.put("/confirmed-starts/:jobId",   requireRole("PROVIDER"), asyncHandler(ctrl.putServiceStart));
router.get("/team-availability",      requireRole("PROVIDER"), asyncHandler(ctrl.getTeamAvailability));
router.post("/team-availability/requests",       requireRole("PROVIDER"), asyncHandler(ctrl.createAvailabilityRequest));
router.patch("/team-availability/replies/:id",   requireRole("PROVIDER"), asyncHandler(ctrl.recordRosterReply));

router.post("/internal-offers",                  requireRole("PROVIDER"), asyncHandler(ctrl.createInternalOffer));
router.patch("/internal-offers/:id/response",    requireRole("PROVIDER"), asyncHandler(ctrl.recordInternalOfferResponse));
router.post("/internal-offers/:id/confirm",      requireRole("PROVIDER"), asyncHandler(ctrl.confirmInternalOffer));

// Managed worker side: shift offers from their organisation
router.get("/my-internal-offers",                requireRole("SUPPORT_WORKER"), asyncHandler(ctrl.getMyInternalOffers));
router.post("/my-internal-offers/:id/respond",   requireRole("SUPPORT_WORKER"), asyncHandler(ctrl.respondToInternalOffer));

// Managed worker side: replies to availability requests from their organisation
router.get("/my-availability-requests",              requireRole("SUPPORT_WORKER"), asyncHandler(ctrl.getMyAvailabilityRequests));
router.post("/my-availability-requests/:id/respond", requireRole("SUPPORT_WORKER"), asyncHandler(ctrl.respondToAvailabilityRequest));

export default router;
