import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import * as ctrl from "./provider-org.controller";

const router = Router();

router.use(requireAuth, requireRole("PROVIDER"));

router.post("/branches", asyncHandler(ctrl.createBranch));
router.get("/branches", asyncHandler(ctrl.listBranches));
router.delete("/branches/:id", asyncHandler(ctrl.deleteBranch));

router.post("/administrators", asyncHandler(ctrl.createAdministrator));
router.get("/administrators", asyncHandler(ctrl.listAdministrators));
router.delete("/administrators/:id", asyncHandler(ctrl.removeAdministrator));

router.post("/team-members", asyncHandler(ctrl.createTeamMember));
router.get("/team-members", asyncHandler(ctrl.listTeamMembers));
router.delete("/team-members/:id", asyncHandler(ctrl.removeTeamMember));
router.post("/team-members/:id/verify/resend", asyncHandler(ctrl.resendTeamMemberVerification));
router.post("/team-members/:id/verify/confirm", asyncHandler(ctrl.confirmTeamMemberVerification));

export default router;
