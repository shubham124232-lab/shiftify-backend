import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import * as ctrl from "./provider-org.controller";

const router = Router();

// The invited person is not an Administrator yet, so these need a login but not the Provider role.
router.get("/my-invitations", requireAuth, asyncHandler(ctrl.listMyInvitations));
router.post("/my-invitations/:id/accept", requireAuth, asyncHandler(ctrl.acceptInvitation));
router.post("/my-invitations/:id/decline", requireAuth, asyncHandler(ctrl.declineInvitation));

router.use(requireAuth, requireRole("PROVIDER"));

router.post("/join-request", asyncHandler(ctrl.requestToJoin));
router.get("/capacity", asyncHandler(ctrl.getCapacity));
router.get("/identity", asyncHandler(ctrl.getIdentity));
router.get("/inbox", asyncHandler(ctrl.getInbox));
router.post("/branches", asyncHandler(ctrl.createBranch));
router.get("/branches", asyncHandler(ctrl.listBranches));
router.get("/branches/:id", asyncHandler(ctrl.getBranch));
router.patch("/branches/:id", asyncHandler(ctrl.updateBranch));
router.delete("/branches/:id", asyncHandler(ctrl.deleteBranch));

router.post("/administrators", asyncHandler(ctrl.createAdministrator));
router.get("/administrators", asyncHandler(ctrl.listAdministrators));
router.patch("/administrators/:id", asyncHandler(ctrl.updateAdministrator));
router.delete("/administrators/:id", asyncHandler(ctrl.removeAdministrator));
router.post("/administrators/:id/resend", asyncHandler(ctrl.resendAdministratorInvite));
router.post("/administrators/:id/revoke", asyncHandler(ctrl.revokeAdministratorInvite));

router.post("/team-members", asyncHandler(ctrl.createTeamMember));
router.get("/team-members", asyncHandler(ctrl.listTeamMembers));
router.patch("/team-members/:id", asyncHandler(ctrl.updateTeamMember));
router.delete("/team-members/:id", asyncHandler(ctrl.removeTeamMember));
router.post("/team-members/:id/verify/resend", asyncHandler(ctrl.resendTeamMemberVerification));
router.post("/team-members/:id/verify/confirm", asyncHandler(ctrl.confirmTeamMemberVerification));

export default router;
