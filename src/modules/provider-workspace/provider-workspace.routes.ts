import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import * as ctrl from "./provider-workspace.controller";

const router = Router();

router.use(requireAuth);

// Provider pages
router.get("/matched-requests",       requireRole("PROVIDER"), asyncHandler(ctrl.getMatched));
router.get("/saved-requests",         requireRole("PROVIDER"), asyncHandler(ctrl.getSaved));
router.get("/confirmed-starts",       requireRole("PROVIDER"), asyncHandler(ctrl.getConfirmedStarts));
router.get("/offers-assignments",     requireRole("PROVIDER"), asyncHandler(ctrl.getOffersAndAssignments));
router.get("/reports",                requireRole("PROVIDER"), asyncHandler(ctrl.getReports));
router.get("/promotions",             requireRole("PROVIDER"), asyncHandler(ctrl.getPromotions));
router.get("/team-availability",      requireRole("PROVIDER"), asyncHandler(ctrl.getTeamAvailability));
router.post("/team-availability/requests",       requireRole("PROVIDER"), asyncHandler(ctrl.createAvailabilityRequest));
router.patch("/team-availability/replies/:id",   requireRole("PROVIDER"), asyncHandler(ctrl.recordRosterReply));

// Managed worker side: replies to availability requests from their organisation
router.get("/my-availability-requests",              requireRole("SUPPORT_WORKER"), asyncHandler(ctrl.getMyAvailabilityRequests));
router.post("/my-availability-requests/:id/respond", requireRole("SUPPORT_WORKER"), asyncHandler(ctrl.respondToAvailabilityRequest));

export default router;
