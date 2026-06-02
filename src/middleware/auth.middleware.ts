// Verifies the JWT access token and attaches the current user to req.user.
import type { Request, Response, NextFunction } from "express";
import { UnauthorizedError } from "../lib/errors";
import { verifyAccessToken } from "../lib/jwt";
import { prisma } from "../lib/prisma";
import type { User, UserRole } from "@prisma/client";

declare module "express-serve-static-core" {
  interface Request {
    user?: User;
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
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedError("User no longer exists");
    req.user = user;
    req.activeRole = payload.activeRole as UserRole;
    req.roles = (payload.roles ?? []) as UserRole[];
    next();
  } catch (err) {
    next(err);
  }
}
