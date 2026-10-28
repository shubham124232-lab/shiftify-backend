import { Router } from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "../../utils/async-handler";
import { success } from "../../utils/response";
import * as svc from "./public-home.service";

const router = Router();

const homeRateLimit = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });

// Deliberately NOT behind requireAuth — mounted outside it in app.ts.
router.get("/", homeRateLimit, asyncHandler(async (_req, res) => {
  success(res, await svc.getPublicHome());
}));

export default router;
