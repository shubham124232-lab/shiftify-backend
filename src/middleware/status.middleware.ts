// Blocks PENDING/REJECTED/SUSPENDED users from marketplace actions.
// Allows them to see their dashboard (requireAuth only).
// Uses ACTIVE — the live status for all approved accounts.
// APPROVED is a legacy enum value retained for Postgres compat; not checked here.
import type { Request, Response, NextFunction } from "express";
import { ForbiddenError, UnauthorizedError } from "../lib/errors";

export function requireApproved(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(new UnauthorizedError());
  if (req.user.status !== "ACTIVE") {
    return next(
      new ForbiddenError(
        `Account status is ${req.user.status}. This action is only available to active accounts.`,
      ),
    );
  }
  next();
}
