// Wraps async route handlers so unhandled promise rejections forward to
// the error middleware instead of crashing the process.
import type { Request, Response, NextFunction, RequestHandler } from "express";

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
