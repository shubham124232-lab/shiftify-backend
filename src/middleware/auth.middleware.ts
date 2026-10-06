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
    // Session (refresh-token row) this access token belongs to.
    sessionId?: string;
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
    // Tokens minted before session binding existed carry no sid — force a refresh.
    if (!payload.sid) throw new UnauthorizedError("Invalid or expired token");
    const [user, session] = await Promise.all([
      prisma.user.findUnique({
        where:  { id: payload.sub },
        select: { id: true, status: true, adminTier: true, accountType: true },
      }),
      prisma.session.findFirst({
        where:  { id: payload.sid, userId: payload.sub, expiresAt: { gt: new Date() } },
        select: { id: true },
      }),
    ]);
    if (!user) throw new UnauthorizedError("User no longer exists");
    // Logged-out / revoked / expired session invalidates its access tokens too.
    if (!session) throw new UnauthorizedError("Session ended");
    if (user.status === "SUSPENDED") throw new UnauthorizedError("Account suspended. Contact support.");
    req.user      = user;
    req.activeRole = payload.activeRole as UserRole;
    req.roles      = (payload.roles ?? []) as UserRole[];
    req.sessionId  = session.id;
    next();
  } catch (err) {
    next(err);
  }
}
