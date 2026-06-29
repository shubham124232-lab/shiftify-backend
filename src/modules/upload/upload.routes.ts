import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import { BadRequestError } from "../../lib/errors";
import * as ctrl from "./upload.controller";

const router = Router();

const AVATAR_MIME = ["image/jpeg", "image/png", "image/heic", "image/webp"];
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (AVATAR_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestError("Avatar must be jpeg, png, heic, or webp"));
    }
  },
});

router.get("/presign",            requireAuth, asyncHandler(ctrl.presign));
router.post("/avatar",            requireAuth, avatarUpload.single("avatar"), asyncHandler(ctrl.uploadAvatar));
router.post("/register-document", requireAuth, asyncHandler(ctrl.registerDocument));
router.post("/document/presign",  requireAuth, asyncHandler(ctrl.documentPresign));
router.post("/document/confirm",  requireAuth, asyncHandler(ctrl.documentConfirm));
router.get("/document",           requireAuth, asyncHandler(ctrl.listUserDocuments));
router.delete("/document/:id",    requireAuth, asyncHandler(ctrl.deleteUserDocument));

export default router;
