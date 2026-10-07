// MANAGED sub-accounts (created by a Provider/Coordinator) do not onboard
// themselves — the parent account fills the profile and uploads documents via
// the /linking/* endpoints. This middleware keeps the self-service onboarding
// routes closed to them.
import type { Request, Response, NextFunction } from "express";
import { ForbiddenError, UnauthorizedError } from "../lib/errors";

export function blockManagedSelfService(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new UnauthorizedError());
    return;
  }
  if (req.user.accountType === "MANAGED") {
    next(
      new ForbiddenError(
        "Your account is managed by the organisation that created it — profile details and documents are submitted on your behalf.",
      ),
    );
    return;
  }
  next();
}

// Pricing V2 §4.4 — a Provider-managed Team Member sees only their personal offers,
// assignments, calendar and assignment messages; the Provider-wide Live Shift Board
// (marketplace browsing) is not part of that access.
export function blockManagedMarketplaceBrowse(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new UnauthorizedError());
    return;
  }
  if (req.user.accountType === "MANAGED" && req.activeRole === "SUPPORT_WORKER") {
    next(new ForbiddenError("Your account shows only the assignments your organisation gives you — the live shift board is managed by your organisation."));
    return;
  }
  next();
}
