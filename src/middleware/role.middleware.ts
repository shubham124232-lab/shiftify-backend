// Used after requireAuth. Guards on the ACTIVE role carried in the token
// (req.activeRole), not on a stored column — so role-switching takes effect.
import type { Request, Response, NextFunction } from "express";
import { ForbiddenError, UnauthorizedError } from "../lib/errors";
import type { UserRole } from "@prisma/client";

export function requireRole(...allowed: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError());
    if (!req.activeRole || !allowed.includes(req.activeRole)) {
      return next(new ForbiddenError(`This action requires one of: ${allowed.join(", ")}`));
    }
    next();
  };
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(new UnauthorizedError());
  if (req.activeRole !== "ADMIN") return next(new ForbiddenError("Admin only"));
  next();
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(new UnauthorizedError());
  if (req.activeRole !== "ADMIN" || req.user.adminTier !== "SUPER_ADMIN") {
    return next(new ForbiddenError("Super admin only"));
  }
  next();
}
