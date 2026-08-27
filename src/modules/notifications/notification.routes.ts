import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import * as ctrl from "./notification.controller";

const router = Router();

router.get("/", requireAuth, asyncHandler(ctrl.listNotifications));
// Literal-segment routes BEFORE /:id to avoid Express matching them as an :id param
router.patch("/read-all", requireAuth, asyncHandler(ctrl.readAll));
router.get  ("/preferences", requireAuth, asyncHandler(ctrl.getPreference));
router.patch("/preferences", requireAuth, asyncHandler(ctrl.updatePreference));
router.patch("/:id/read", requireAuth, asyncHandler(ctrl.readOne));

export default router;
