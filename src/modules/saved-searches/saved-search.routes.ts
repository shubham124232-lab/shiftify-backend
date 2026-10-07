import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import * as ctrl from "./saved-search.controller";

const router = Router();

router.use(requireAuth);

router.post   ("/",    asyncHandler(ctrl.createSavedSearch));
router.get    ("/",    asyncHandler(ctrl.listSavedSearches));
router.patch  ("/:id", asyncHandler(ctrl.updateSavedSearch));
router.delete ("/:id", asyncHandler(ctrl.deleteSavedSearch));

export default router;
