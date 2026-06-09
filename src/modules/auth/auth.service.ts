import { randomUUID } from "crypto";
import { prisma } from "../../lib/prisma";
import { hashPassword, verifyPassword, assertPasswordStrength } from "../../lib/hash";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  expiresInMs,
} from "../../lib/jwt";
import {
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  BadRequestError,
} from "../../lib/errors";
import { env } from "../../config/env";
import type { User, UserRole } from "@prisma/client";

// Shared include for loading a user's role assignments in priority order.
const ROLE_INCLUDE = {
  roles: { orderBy: [{ isActiveDefault: "desc" as const }, { createdAt: "asc" as const }] },
};

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface AuthResult {
  user: User;
  roles: UserRole[];
  activeRole: UserRole;
  tokens: AuthTokens;
  _dev_code?: string;
}

// Create a session (carrying the active role) and sign the token pair.
async function issueTokens(
  user: User,
  activeRole: UserRole,
  roles: UserRole[],
): Promise<AuthTokens> {
  const sessionId  = randomUUID();
  const expiresAt  = new Date(Date.now() + expiresInMs(env.JWT_REFRESH_EXPIRES_IN));

  const accessToken  = signAccessToken({ sub: user.id, activeRole, roles, status: user.status });
  const refreshToken = signRefreshToken({ sub: user.id, jti: sessionId });

  await prisma.session.create({
    data: {
      id:               sessionId,
      userId:           user.id,
      refreshTokenHash: hashToken(refreshToken),
      activeRole,
      expiresAt,
    },
  });

  return { accessToken, refreshToken, refreshTokenExpiresAt: expiresAt };
}

// Self-registration. Picks ONE initial role; more can be added later via addRole.
// Phone is required for SELF accounts (primary identity gate per §4.1).
// All SELF roles start PENDING and must complete the activation funnel.
export async function register(input: {
  email?: string;
  phone?: string;
  username?: string;
  password: string;
  name: string;
  role: UserRole;
}): Promise<AuthResult> {
  const email = input.email?.toLowerCase();
  const { phone, username } = input;

  // §4.5 — check password strength FIRST, before any DB lookups.
  assertPasswordStrength(input.password);

  // §4.1 — phone required for SELF accounts.
  if (!phone) {
    throw new BadRequestError("A mobile phone number is required to register.");
  }

  if (email && (await prisma.user.findUnique({ where: { email } }))) {
    throw new ConflictError("An account with this email already exists");
  }
  if (await prisma.user.findUnique({ where: { phone } })) {
    throw new ConflictError("An account with this phone number already exists");
  }
  if (username && (await prisma.user.findUnique({ where: { username } }))) {
    throw new ConflictError("That username is already taken");
  }

  const passwordHash = await hashPassword(input.password);

  // All SELF roles start PENDING — must complete activation funnel (phone OTP then plan).
  const user = await prisma.user.create({
    data: {
      email,
      phone,
      username,
      passwordHash,
      name: input.name,
      accountType: "SELF",
      status: "PENDING",
      roles: { create: { role: input.role, isActiveDefault: true } },
    },
  });

  // Auto-send phone OTP so the user can verify immediately.
  const roles: UserRole[] = [input.role];
  const tokens = await issueTokens(user, input.role, roles);
  const otp = await autoSendPhoneOtp(user.id);
  return { user, roles, activeRole: input.role, tokens, ...otp };
}

// Fire-and-forget helper — sends phone OTP after SELF registration.
async function autoSendPhoneOtp(userId: string): Promise<{ _dev_code?: string }> {
  try {
    const { requestVerification } = await import("../auth/otp.service");
    const result = await requestVerification({ userId, channel: "phone" });
    return result._dev_code ? { _dev_code: result._dev_code } : {};
  } catch (err) {
    // Non-fatal — user can request a new OTP manually via POST /auth/verify/request.
    console.error("[auth] autoSendPhoneOtp failed:", err);
    return {};
  }
}

// Create a MANAGED account (provider->worker or coordinator->participant).
// MANAGED accounts are APPROVED immediately — no OTP, no plan required.
export async function createManagedAccount(input: {
  parentUserId: string;
  name: string;
  username: string;
  password: string;
  role: UserRole;
}): Promise<{ user: User; roles: UserRole[] }> {
  assertPasswordStrength(input.password);

  if (await prisma.user.findUnique({ where: { username: input.username } })) {
    throw new ConflictError("That username is already taken");
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      username: input.username,
      passwordHash,
      name: input.name,
      accountType: "MANAGED",
      status: "ACTIVE",
      parentUserId: input.parentUserId,
      roles: { create: { role: input.role, isActiveDefault: true } },
    },
  });

  return { user, roles: [input.role] };
}

// Login by ANY identifier: email, phone, or username.
export async function login(input: {
  identifier: string;
  password: string;
}): Promise<AuthResult> {
  const id = input.identifier.trim();
  const row = await prisma.user.findFirst({
    where: { OR: [{ email: id.toLowerCase() }, { phone: id }, { username: id }] },
    include: ROLE_INCLUDE,
  });
  if (!row || !row.passwordHash) {
    throw new UnauthorizedError("Invalid credentials");
  }
  const ok = await verifyPassword(input.password, row.passwordHash);
  if (!ok) throw new UnauthorizedError("Invalid credentials");
  if (row.status === "SUSPENDED") {
    throw new UnauthorizedError("Account suspended. Contact support.");
  }

  const roles = row.roles.map((r) => r.role);
  if (roles.length === 0) throw new UnauthorizedError("Account has no roles assigned");
  const activeRole = roles[0];

  const { roles: _r, ...user } = row;
  const tokens = await issueTokens(user, activeRole, roles);
  return { user, roles, activeRole, tokens };
}

// Rotate the refresh token.
export async function refresh(refreshToken: string): Promise<AuthResult> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  const session = await prisma.session.findUnique({
    where: { id: payload.jti },
    include: { user: { include: ROLE_INCLUDE } },
  });
  if (!session || session.refreshTokenHash !== hashToken(refreshToken)) {
    throw new UnauthorizedError("Session not found");
  }
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } });
    throw new UnauthorizedError("Session expired");
  }

  const roles = session.user.roles.map((r) => r.role);
  if (roles.length === 0) throw new UnauthorizedError("Account has no roles assigned");
  const activeRole =
    session.activeRole && roles.includes(session.activeRole)
      ? session.activeRole
      : roles[0];

  const { roles: _r, ...user } = session.user;

  const tokens = await issueTokens(user, activeRole, roles);
  await prisma.session.delete({ where: { id: session.id } });
  return { user, roles, activeRole, tokens };
}

export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  try {
    const payload = verifyRefreshToken(refreshToken);
    await prisma.session.deleteMany({ where: { id: payload.jti } });
  } catch {
    // Token bad or already expired — nothing to clean up.
  }
}

// Add another role to the SAME account (multi-role).
export async function addRole(userId: string, role: UserRole): Promise<UserRole[]> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("User not found");
  if (user.accountType === "MANAGED") {
    throw new ForbiddenError("Managed accounts cannot add roles.");
  }
  const existing = await prisma.userRoleAssignment.findUnique({
    where: { userId_role: { userId, role } },
  });
  if (existing) throw new ConflictError("You already hold this role");
  await prisma.userRoleAssignment.create({ data: { userId, role } });
  const updated = await prisma.userRoleAssignment.findMany({
    where: { userId },
    orderBy: [{ isActiveDefault: "desc" }, { createdAt: "asc" }],
  });
  return updated.map((r) => r.role);
}

export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const existing = await prisma.user.findUnique({ where: { username } });
  return existing === null;
}

// Switch the active role for the current session and re-mint the access token.
export async function switchRole(input: {
  userId: string;
  targetRole: UserRole;
  refreshToken?: string;
}): Promise<{ activeRole: UserRole; roles: UserRole[]; accessToken: string }> {
  const row = await prisma.user.findUnique({
    where: { id: input.userId },
    include: ROLE_INCLUDE,
  });
  if (!row) throw new NotFoundError("User not found");
  const roles = row.roles.map((r) => r.role);
  const { roles: _r, ...user } = row;
  if (!roles.includes(input.targetRole)) {
    throw new ForbiddenError("You do not hold that role");
  }

  if (input.refreshToken) {
    try {
      const payload = verifyRefreshToken(input.refreshToken);
      await prisma.session.updateMany({
        where: { id: payload.jti, userId: input.userId },
        data: { activeRole: input.targetRole },
      });
    } catch {
      // No valid refresh session — still return re-scoped access token.
    }
  }

  const accessToken = signAccessToken({
    sub: user.id,
    activeRole: input.targetRole,
    roles,
    status: row.status,
  });
  return { activeRole: input.targetRole, roles, accessToken };
}
