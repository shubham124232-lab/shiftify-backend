import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import * as ctrl from "./pm.controller";

const router = Router();

router.use(requireAuth);

router.post  ("/connect",                   asyncHandler(ctrl.createConnection));
router.get   ("/connections",               asyncHandler(ctrl.listConnections));
router.patch ("/connections/:id/respond",   asyncHandler(ctrl.respondToConnection));

export default router;
