import type { Request, Response } from "express";
import {
  baseRegisterSchema,
  loginSchema,
  addRoleSchema,
  switchRoleSchema,
} from "../../validators/auth.schema";
import * as authService from "./auth.service";
import { success } from "../../utils/response";
import { UnauthorizedError } from "../../lib/errors";
import { env } from "../../config/env";
import type { User, UserRole } from "@prisma/client";

const REFRESH_COOKIE_NAME = "shiftify_refresh";

function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "strict" : "lax",
    path: "/",
    expires: expiresAt,
  });
}

function publicUser(user: User, roles: UserRole[], activeRole: UserRole) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    username: user.username,
    name: user.name,
    accountType: user.accountType,
    status: user.status,
    adminTier: user.adminTier,
    roles,
    activeRole,
  };
}

export async function register(req: Request, res: Response): Promise<void> {
  const body = baseRegisterSchema.parse(req.body);
  const r = await authService.register(body);
  setRefreshCookie(res, r.tokens.refreshToken, r.tokens.refreshTokenExpiresAt);
  success(
    res,
    { user: publicUser(r.user, r.roles, r.activeRole), accessToken: r.tokens.accessToken },
    201,
  );
}

export async function login(req: Request, res: Response): Promise<void> {
  const body = loginSchema.parse(req.body);
  const r = await authService.login(body);
  setRefreshCookie(res, r.tokens.refreshToken, r.tokens.refreshTokenExpiresAt);
  success(res, {
    user: publicUser(r.user, r.roles, r.activeRole),
    accessToken: r.tokens.accessToken,
  });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const token =
    (req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined) ?? req.body?.refreshToken;
  const r = await authService.refresh(token ?? "");
  setRefreshCookie(res, r.tokens.refreshToken, r.tokens.refreshTokenExpiresAt);
  success(res, { accessToken: r.tokens.accessToken, activeRole: r.activeRole, roles: r.roles });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const token =
    (req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined) ?? req.body?.refreshToken;
  await authService.logout(token);
  res.clearCookie(REFRESH_COOKIE_NAME, { path: "/" });
  success(res, { ok: true });
}

// POST /auth/roles — add another role to the current account.
export async function addRole(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const { role } = addRoleSchema.parse(req.body);
  const roles = await authService.addRole(req.user.id, role);
  success(res, { roles }, 201);
}

// GET /auth/check-username?username=<value>
export async function checkUsername(req: Request, res: Response): Promise<void> {
  const username = (req.query.username as string | undefined)?.trim();
  if (!username || username.length < 3) {
    success(res, { available: false, reason: "Username must be at least 3 characters" });
    return;
  }
  const existing = await authService.checkUsernameAvailable(username);
  success(res, { available: existing });
}

// POST /auth/switch-role — change the active role; returns a re-scoped access token.
export async function switchRole(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const { role } = switchRoleSchema.parse(req.body);
  const token = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
  const r = await authService.switchRole({
    userId: req.user.id,
    targetRole: role,
    refreshToken: token,
  });
  success(res, { activeRole: r.activeRole, roles: r.roles, accessToken: r.accessToken });
}
