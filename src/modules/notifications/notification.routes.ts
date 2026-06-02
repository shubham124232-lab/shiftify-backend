import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import * as ctrl from "./notification.controller";

const router = Router();

router.get("/", requireAuth, asyncHandler(ctrl.listNotifications));
// read-all BEFORE /:id to avoid Express matching "read-all" as an :id param
router.patch("/read-all", requireAuth, asyncHandler(ctrl.readAll));
router.patch("/:id/read", requireAuth, asyncHandler(ctrl.readOne));

export default router;
