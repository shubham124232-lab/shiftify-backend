import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import { uploadMiddleware } from "../../middleware/upload.middleware";
import * as ctrl from "./document.controller";

const router = Router();

// POST /users/me/documents  — multipart/form-data: file + docType + optional fields
router.post(
  "/",
  requireAuth,
  uploadMiddleware.single("file"),
  asyncHandler(ctrl.uploadDocument),
);

// GET  /users/me/documents
router.get("/", requireAuth, asyncHandler(ctrl.listDocuments));

// DELETE /users/me/documents/:id
router.delete("/:id", requireAuth, asyncHandler(ctrl.deleteDocument));

export default router;
