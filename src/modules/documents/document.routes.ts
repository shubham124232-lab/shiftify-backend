import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import { uploadMiddleware } from "../../middleware/upload.middleware";
import { blockManagedSelfService } from "../../middleware/managed.middleware";
import * as ctrl from "./document.controller";

const router = Router();

// POST /users/me/documents  — multipart/form-data: file + docType + optional fields
// MANAGED accounts cannot submit — their parent uploads via /linking/workers/:id/documents.
router.post(
  "/",
  requireAuth,
  blockManagedSelfService,
  uploadMiddleware.single("file"),
  asyncHandler(ctrl.uploadDocument),
);

// GET  /users/me/documents — managed accounts may still view what was uploaded for them
router.get("/", requireAuth, asyncHandler(ctrl.listDocuments));

// DELETE /users/me/documents/:id
router.delete("/:id", requireAuth, blockManagedSelfService, asyncHandler(ctrl.deleteDocument));

export default router;
