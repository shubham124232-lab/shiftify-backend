// Verifies the JWT access token and attaches the current user to req.user.
import type { Request, Response, NextFunction } from "express";
import { UnauthorizedError } from "../lib/errors";
import { verifyAccessToken } from "../lib/jwt";
import { prisma } from "../lib/prisma";
import type { UserRole, UserStatus, AdminTier, AccountType } from "@prisma/client";

// Minimal user shape — only the fields actually read from req.user across the codebase.
// Keeping this lean avoids fetching passwordHash, guestUntil, defaultSuburb, etc. on every request.
export type AuthUser = {
  id:          string;
  status:      UserStatus;
  adminTier:   AdminTier | null;
  accountType: AccountType;
};

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
    // The role this request is acting as, plus every role the account holds.
    // Read from the access-token claim (set at login / switch-role).
    activeRole?: UserRole;
    roles?: UserRole[];
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing bearer token");
    }
    const token = header.slice("Bearer ".length).trim();
    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw new UnauthorizedError("Invalid or expired token");
    }
    const user = await prisma.user.findUnique({
      where:  { id: payload.sub },
      select: { id: true, status: true, adminTier: true, accountType: true },
    });
    if (!user) throw new UnauthorizedError("User no longer exists");
    req.user      = user;
    req.activeRole = payload.activeRole as UserRole;
    req.roles      = (payload.roles ?? []) as UserRole[];
    next();
  } catch (err) {
    next(err);
  }
}
