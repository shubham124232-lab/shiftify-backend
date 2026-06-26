import jwt, { SignOptions } from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../config/env";

export interface AccessTokenPayload {
  sub: string; // user id
  activeRole: string; // the role this token is currently operating as
  roles: string[]; // every role the account holds (for the client switcher)
  status: string;
  name?: string; // display name — cached so first render shows correct greeting
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string; // session id
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as SignOptions);
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}

// Short-lived token issued after credential check, before OTP verification.
// Scoped so it can never be used as an access token.
export interface PendingTokenPayload {
  sub: string; // user id
  scope: "login-pending";
}

export function signPendingToken(userId: string): string {
  return jwt.sign({ sub: userId, scope: "login-pending" }, env.JWT_ACCESS_SECRET, {
    expiresIn: "1d",
  } as SignOptions);
}

export function verifyPendingToken(token: string): PendingTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as PendingTokenPayload;
  if (decoded.scope !== "login-pending") throw new Error("Invalid token scope");
  return decoded;
}

// Hash a refresh token before storing it in the DB so a leaked DB doesn't
// expose live tokens.
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Parse an expiry like "30d" into milliseconds since epoch.
export function expiresInMs(expr: string): number {
  const m = expr.match(/^(\d+)([smhdw])$/);
  if (!m) throw new Error(`Invalid expiry format: ${expr}`);
  const n = parseInt(m[1], 10);
  switch (m[2]) {
    case "s": return n * 1000;
    case "m": return n * 60 * 1000;
    case "h": return n * 60 * 60 * 1000;
    case "d": return n * 24 * 60 * 60 * 1000;
    case "w": return n * 7 * 24 * 60 * 60 * 1000;
    default: throw new Error(`Unknown unit in ${expr}`);
  }
}
