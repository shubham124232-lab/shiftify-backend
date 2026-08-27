import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import * as ctrl from "./direct-inquiry.controller";

const router = Router();

router.use(requireAuth);

router.post ("/",          asyncHandler(ctrl.send));
router.get  ("/sent",      asyncHandler(ctrl.listSent));
router.get  ("/received",  asyncHandler(ctrl.listReceived));
router.patch("/:id/read",  asyncHandler(ctrl.markRead));

export default router;
