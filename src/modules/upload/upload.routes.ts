import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import * as ctrl from "./upload.controller";

const router = Router();

// Image-only multer for avatar uploads (5 MB max)
const AVATAR_MIME = ["image/jpeg", "image/png", "image/heic", "image/webp"];
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (AVATAR_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Avatar must be jpeg, png, heic, or webp"));
    }
  },
});

// GET /upload/presign
router.get("/presign", requireAuth, asyncHandler(ctrl.presign));

// POST /upload/avatar -- multipart, saves to local disk
router.post("/avatar", requireAuth, avatarUpload.single("avatar"), asyncHandler(ctrl.uploadAvatar));

// POST /upload/register-document
router.post("/register-document", requireAuth, asyncHandler(ctrl.registerDocument));

export default router;
