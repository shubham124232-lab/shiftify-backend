// Multer config for file uploads. Stores in memory; the route handler
// hands the buffer to the storage adapter.
import multer from "multer";
import { env } from "../config/env";
import { ALLOWED_MIME_TYPES } from "../config/constants";
import { BadRequestError } from "../lib/errors";

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if ((ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestError(`File type ${file.mimetype} not allowed`));
    }
  },
});
