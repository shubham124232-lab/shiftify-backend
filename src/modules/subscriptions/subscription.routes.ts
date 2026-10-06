import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import { activateSubscription, listPlans, getMySubscription, getMyActiveSubscriptions, purchaseShiftPass, cancelSubscription, getIntroductoryAllowance, activateAddOn } from "./subscription.controller";

const router = Router();

// Public — no auth needed to browse available plans.
router.get("/plans",    asyncHandler(listPlans));

// Authenticated
router.post("/activate",   requireAuth, asyncHandler(activateSubscription));
router.get ("/me",         requireAuth, asyncHandler(getMySubscription));
router.get ("/me/all",     requireAuth, asyncHandler(getMyActiveSubscriptions));
router.post("/shift-pass", requireAuth, asyncHandler(purchaseShiftPass));
router.post("/add-on",    requireAuth, asyncHandler(activateAddOn));
router.post("/cancel",     requireAuth, asyncHandler(cancelSubscription));
router.get ("/me/allowance", requireAuth, asyncHandler(getIntroductoryAllowance));

export default router;
