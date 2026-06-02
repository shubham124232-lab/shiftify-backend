import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { requireAuth } from "../../middleware/auth.middleware";
import * as ctrl from "./upload.controller";

const router = Router();

// GET /upload/presign?fileName=x&contentType=y&category=compliance|avatars
// Returns a presigned PUT URL for direct client → R2 upload.
// Falls back to a placeholder when R2 is not configured (dev: upload via POST /users/me/documents).
router.get("/presign", requireAuth, asyncHandler(ctrl.presign));

// POST /upload/register-document
// Called AFTER the client successfully PUT the file to R2.
// Creates the Document row in the DB.
router.post("/register-document", requireAuth, asyncHandler(ctrl.registerDocument));

export default router;
