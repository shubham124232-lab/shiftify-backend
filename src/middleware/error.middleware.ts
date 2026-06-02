// Central error handler. Express invokes this whenever next(err) is called
// or asyncHandler catches a rejection. Translates known errors into JSON,
// logs unknown errors and returns a 500.
import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { ApiError } from "../lib/errors";

export const errorMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request body failed validation",
        details: err.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
    });
    return;
  }

  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  // Multer errors (file upload)
  if (err && typeof err === "object" && "code" in err && err.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({
      error: { code: "FILE_TOO_LARGE", message: "Uploaded file exceeds size limit" },
    });
    return;
  }

  console.error("[shiftify-backend] Unhandled error:", err);
  res.status(500).json({
    error: { code: "INTERNAL", message: "Internal server error" },
  });
};
