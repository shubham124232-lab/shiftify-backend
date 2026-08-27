import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import * as ctrl from "./job-invite.controller";

const router = Router();

router.use(requireAuth);

// Poster (Participant/Coordinator, free / Provider, paid Direct Connect) invites
// a worker or provider to their job — SW doc Window 19 / SC-F01-06 / Pricing V2 §9.
router.post("/:jobId",         requireRole("PARTICIPANT", "COORDINATOR", "PROVIDER"), asyncHandler(ctrl.createInvite));
router.get ("/:jobId",         requireRole("PARTICIPANT", "COORDINATOR", "PROVIDER"), asyncHandler(ctrl.listInvitesForJob));

// Invited worker/provider views and responds to their own invitations.
router.get ("/",               asyncHandler(ctrl.listMyInvites));
router.patch("/:id/respond",   asyncHandler(ctrl.respondToInvite));

export default router;
