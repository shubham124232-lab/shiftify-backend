import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import { activateSubscription, listPlans, getMySubscription, getMyActiveSubscriptions, purchaseShiftPass } from "./subscription.controller";

const router = Router();

// Public — no auth needed to browse available plans.
router.get("/plans",    asyncHandler(listPlans));

// Authenticated
router.post("/activate",   requireAuth, asyncHandler(activateSubscription));
router.get ("/me",         requireAuth, asyncHandler(getMySubscription));
router.get ("/me/all",     requireAuth, asyncHandler(getMyActiveSubscriptions));
router.post("/shift-pass", requireAuth, asyncHandler(purchaseShiftPass));

export default router;
