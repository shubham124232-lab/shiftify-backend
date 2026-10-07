import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import * as ctrl from "./availability-listing.controller";

const router = Router();

router.use(requireAuth);

// Literal-segment route registered before "/:id" to avoid the id route swallowing it.
router.get   ("/mine", requireRole("SUPPORT_WORKER"), asyncHandler(ctrl.listMyAvailabilityListings));
router.get   ("/",                                    asyncHandler(ctrl.browseAvailabilityListings));
router.post  ("/",     requireRole("SUPPORT_WORKER"), asyncHandler(ctrl.createAvailabilityListing));
router.patch ("/:id",  requireRole("SUPPORT_WORKER"), asyncHandler(ctrl.updateAvailabilityListing));
router.delete("/:id",  requireRole("SUPPORT_WORKER"), asyncHandler(ctrl.deleteAvailabilityListing));

export default router;
