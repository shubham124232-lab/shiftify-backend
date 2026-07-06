import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import * as ctrl from "./listing.controller";

const router = Router();

// Provider-only: post + list own listings (Web posts to /provider/listings).
router.post("/", requireAuth, requireRole("PROVIDER"), asyncHandler(ctrl.createListing));
router.get("/",  requireAuth, requireRole("PROVIDER"), asyncHandler(ctrl.listMyListings));

export default router;
