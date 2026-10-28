// Used after requireAuth. Guards on the ACTIVE role carried in the token
// (req.activeRole), not on a stored column — so role-switching takes effect.
import type { Request, Response, NextFunction } from "express";
import { ForbiddenError, UnauthorizedError } from "../lib/errors";
import { ROLE_LABELS } from "../config/constants";
import type { UserRole } from "@prisma/client";

export function requireRole(...allowed: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError());
    if (!req.activeRole || !allowed.includes(req.activeRole)) {
      const labels = allowed.map((r) => ROLE_LABELS[r] ?? r).join(", ");
      return next(new ForbiddenError(`This action requires one of these roles: ${labels}`));
    }
    next();
  };
}

// Provider doc section 2: billing is for the Owner, or an Administrator who was separately granted billing access.
export function requireBillingAccess(req: Request, _res: Response, next: NextFunction): void {
  if (req.providerAdmin && !req.providerAdmin.billingAccess) {
    return next(new ForbiddenError("Billing is limited to the organisation Owner and Administrators with billing access."));
  }
  next();
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
