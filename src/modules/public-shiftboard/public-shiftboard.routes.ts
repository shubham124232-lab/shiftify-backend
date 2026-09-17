import { Router } from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "../../utils/async-handler";
import * as ctrl from "./public-shiftboard.controller";

const router = Router();

// This is the first endpoint in the app serving real data to a fully
// anonymous caller with no per-request identity to rate-limit by other means
// — scoped to just this router, not applied globally.
const shiftboardRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

// Deliberately NOT behind requireAuth — see app.ts for the mount point.
router.get("/", shiftboardRateLimit, asyncHandler(ctrl.listShiftboard));

export default router;
