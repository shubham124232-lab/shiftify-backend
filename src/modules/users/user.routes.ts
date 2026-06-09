import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import { uploadMiddleware } from "../../middleware/upload.middleware";
import * as ctrl from "./user.controller";

const router = Router();

router.get("/me",   requireAuth, asyncHandler(ctrl.getMe));
router.patch("/me", requireAuth, asyncHandler(ctrl.patchMe));

// Parent fetches full profile of a managed child
router.get("/:id",                requireAuth, asyncHandler(ctrl.getChild));
// Parent/coordinator edits a managed child account
router.patch("/:id",              requireAuth, asyncHandler(ctrl.patchChild));
// Parent saves role-specific profile for a managed child
router.post("/:id/profile/:role",    requireAuth, asyncHandler(ctrl.patchChildProfile));
// Parent resets managed child's password
router.post("/:id/reset-password",   requireAuth, asyncHandler(ctrl.resetChildPassword));

// Parent uploads/lists/deletes a managed child's compliance documents
router.post("/:id/documents",        requireAuth, uploadMiddleware.single("file"), asyncHandler(ctrl.uploadChildDocument));
router.get("/:id/documents",         requireAuth, asyncHandler(ctrl.listChildDocuments));
router.delete("/:id/documents/:docId", requireAuth, asyncHandler(ctrl.deleteChildDocument));

export default router;
