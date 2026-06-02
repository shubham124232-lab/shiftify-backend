import type { Request, Response } from "express";
import { UnauthorizedError, ForbiddenError, ValidationError } from "../../lib/errors";
import { success } from "../../utils/response";
import { getUserById, sanitizeUser, updateProfile, computeCompletion, updateChildProfile } from "./user.service";
import { canAccessMarketplace } from "../../middleware/marketplace.middleware";
import { updateProfileSchema } from "../../validators/profile.schema";
import * as profileService from "../profiles/profile.service";
import { hashPassword } from "../../lib/hash";
import { prisma } from "../../lib/prisma";
import { workerProfileSchema } from "../../validators/profile-worker.schema";
import { participantProfileSchema } from "../../validators/profile-participant.schema";
import type { UserRole } from "@prisma/client";

export async function getMe(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const user       = await getUserById(req.user.id);
  const activeRole = req.activeRole as UserRole | undefined;
  const safe       = sanitizeUser(user);

  const profileCompletion = activeRole ? computeCompletion(user, activeRole) : null;
  const marketplace       = activeRole ? await canAccessMarketplace(req.user.id, activeRole) : null;

  success(res, { user: safe, profileCompletion, marketplace });
}

// GET /users/:id — parent fetches full profile of a managed child
export async function getChild(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const target = await getUserById(req.params.id);
  if (target.parentUserId !== req.user.id) {
    throw new ForbiddenError("You are not the parent of this account");
  }
  success(res, { user: sanitizeUser(target) });
}

// PATCH /users/:id — parent (provider/coordinator) patches a managed child
export async function patchChild(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const target = await getUserById(req.params.id);
  if (target.parentUserId !== req.user.id) {
    throw new ForbiddenError("You are not the parent of this account");
  }
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.errors[0]?.message ?? "Invalid input",
      parsed.error.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
    );
  }
  const updated = await updateProfile(req.params.id, parsed.data);
  success(res, { user: sanitizeUser(updated) });
}

// POST /users/:id/reset-password — parent resets a managed child's password
export async function resetChildPassword(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const target = await getUserById(req.params.id);
  if (target.parentUserId !== req.user.id) {
    throw new ForbiddenError("You are not the parent of this account");
  }
  if (target.accountType !== "MANAGED") {
    throw new ForbiddenError("Password reset via parent is only available for managed accounts");
  }
  const { password } = req.body as { password?: string };
  if (!password || password.length < 8) {
    throw new ValidationError("Password must be at least 8 characters", []);
  }
  const passwordHash = await hashPassword(password);
  await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash } });
  success(res, { ok: true });
}

// POST /users/:id/profile/worker  or  /users/:id/profile/participant
// Parent saves role-specific profile fields for a managed child account.
export async function patchChildProfile(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const target = await getUserById(req.params.id);
  if (target.parentUserId !== req.user.id) {
    throw new ForbiddenError("You are not the parent of this account");
  }

  const role = req.params.role;

  if (role === "worker") {
    const parsed = workerProfileSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "Invalid input", []);
    const profile = await profileService.upsertWorkerProfile(req.params.id, parsed.data);
    return success(res, { profile });
  }

  if (role === "participant") {
    const parsed = participantProfileSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "Invalid input", []);
    const profile = await profileService.upsertParticipantProfile(req.params.id, parsed.data);
    return success(res, { profile });
  }

  throw new ValidationError("Unknown role: " + role, []);
}

export async function patchMe(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  if (req.user.accountType === "MANAGED") {
    throw new ForbiddenError(
      "Managed accounts cannot edit their own profile. Contact your provider or coordinator.",
    );
  }
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.errors[0]?.message ?? "Invalid input",
      parsed.error.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
    );
  }
  const updated = await updateProfile(req.user.id, parsed.data);
  success(res, { user: sanitizeUser(updated) });
}
