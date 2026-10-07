import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import * as ctrl from "./saved-professional.controller";

const router = Router();

router.use(requireAuth);

router.post  ("/",                        asyncHandler(ctrl.saveProfessional));
router.get   ("/",                        asyncHandler(ctrl.listSavedProfessionals));
router.delete("/:professionalUserId",     asyncHandler(ctrl.removeSavedProfessional));

export default router;
