import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import * as ctrl from "./review.controller";

// Window 45 "Respond or report where allowed" — operates on a reviewId
// directly, not scoped under a job, so it gets its own top-level prefix
// rather than colliding with job.routes.ts's "/:id" pattern.
const router = Router();
router.use(requireAuth);

router.patch("/:reviewId/respond", asyncHandler(ctrl.respondToReview));
router.post ("/:reviewId/report",  asyncHandler(ctrl.reportReview));

export default router;
