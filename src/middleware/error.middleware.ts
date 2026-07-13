// Central error handler. Express invokes this whenever next(err) is called
// or asyncHandler catches a rejection. Translates known errors into JSON,
// logs unknown errors and returns a 500.
import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import type { ZodIssue } from "zod";
import { ApiError } from "../lib/errors";

// Turns "fundingManagementType" into "Funding management type" so field-level
// errors read naturally instead of showing the raw camelCase API field name.
function humanizeFieldName(path: string): string {
  const last = path.split(".").pop() ?? path;
  const spaced = last.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  const lower = spaced.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

// Zod's default issue.message is written for developers ("Invalid enum value.
// Expected 'SELF_MANAGED' | 'PLAN_MANAGED' | 'NDIA_MANAGED', received 'PLAN'")
// and leaks internal type names straight to end users. Rewrite the common
// issue kinds into plain sentences; anything unrecognised falls back to a
// generic "check this field" line rather than the raw Zod text.
function humanizeZodIssue(issue: ZodIssue): string {
  const field = humanizeFieldName(issue.path.join("."));

  switch (issue.code) {
    case "invalid_enum_value":
      return `Please choose a valid option for "${field}".`;
    case "invalid_type":
      return issue.received === "undefined"
        ? `"${field}" is required.`
        : `"${field}" isn't the right type of value.`;
    case "too_small":
      return issue.type === "string"
        ? `"${field}" is too short.`
        : `"${field}" is too small.`;
    case "too_big":
      return issue.type === "string"
        ? `"${field}" is too long.`
        : `"${field}" is too large.`;
    case "invalid_string":
      return `"${field}" isn't in a valid format.`;
    case "invalid_date":
      return `"${field}" isn't a valid date.`;
    default:
      return `"${field}" is invalid. Please check this field.`;
  }
}

export const errorMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request body failed validation",
        details: err.issues.map((i) => ({
          path: i.path.join("."),
          message: humanizeZodIssue(i),
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
  // Other multer errors (wrong field name, too many files, …) are client mistakes, not 500s.
  if (err instanceof Error && err.name === "MulterError") {
    res.status(400).json({
      error: { code: "BAD_REQUEST", message: `Upload error: ${err.message}` },
    });
    return;
  }

  console.error("[shiftify-backend] Unhandled error:", err);
  res.status(500).json({
    error: { code: "INTERNAL", message: "Internal server error" },
  });
};
