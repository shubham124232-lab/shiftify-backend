import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import * as ctrl from "./pm.controller";

const router = Router();

router.use(requireAuth);

router.post  ("/connect",                                            asyncHandler(ctrl.createConnection));
router.get   ("/connections",                                        asyncHandler(ctrl.listConnections));
router.patch ("/connections/:id/respond",                            asyncHandler(ctrl.respondToConnection));

// Plan Manager — participant management
router.get   ("/participants",                                        asyncHandler(ctrl.listLinkedParticipants));
router.get   ("/participants/:participantId/budget-statement",        asyncHandler(ctrl.getParticipantBudgetStatement));

// Load board — plan manager posts referral on behalf of linked participant
router.post  ("/referral",                                           asyncHandler(ctrl.postReferral));

// List referrals posted by this PM
router.get   ("/referrals",                                          asyncHandler(ctrl.listReferrals));

// Browse the open support request load board
router.get   ("/load-board",                                         asyncHandler(ctrl.browseLoadBoard));

export default router;
