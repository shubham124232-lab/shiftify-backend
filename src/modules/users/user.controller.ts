import type { Request, Response } from "express";
import { UnauthorizedError, ForbiddenError, ValidationError, BadRequestError } from "../../lib/errors";
import { success } from "../../utils/response";
import { getUserById, sanitizeUser, updateProfile, computeCompletion, computeProfileStep, updateChildProfile } from "./user.service";
import { canAccessMarketplace } from "../../middleware/marketplace.middleware";
import { updateProfileSchema } from "../../validators/profile.schema";
import * as profileService from "../profiles/profile.service";
import * as documentService from "../documents/document.service";
import { uploadDocumentSchema } from "../../validators/document.schema";
import { hashPassword } from "../../lib/hash";
import { prisma } from "../../lib/prisma";
import { workerProfileSchema, availabilitySlotsSchema } from "../../validators/profile-worker.schema";
import { participantProfileSchema } from "../../validators/profile-participant.schema";
import type { UserRole } from "@prisma/client";

// Shared ownership check for all parent → managed-child endpoints below.
async function requireManagedChild(req: Request) {
  if (!req.user) throw new UnauthorizedError();
  const target = await getUserById(req.params.id);
  if (target.parentUserId !== req.user.id) {
    throw new ForbiddenError("You are not the parent of this account");
  }
  return target;
}

export async function getMe(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const user       = await getUserById(req.user.id);
  const activeRole = req.activeRole as UserRole | undefined;
  const safe       = sanitizeUser(user);

  const completion        = activeRole ? computeCompletion(user, activeRole) : null;
  const profileCompletion = completion?.pct ?? null;
  const completionMissing = completion?.missing ?? [];
  const profileStep       = activeRole ? computeProfileStep(user, activeRole) : 0;
  const marketplace       = activeRole ? await canAccessMarketplace(req.user.id, activeRole) : null;

  success(res, { user: safe, profileCompletion, completionMissing, profileStep, phoneVerified: user.phoneVerified, marketplace });
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
    success(res, { profile }); return;
  }

  if (role === "participant") {
    const parsed = participantProfileSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "Invalid input", []);
    const profile = await profileService.upsertParticipantProfile(req.params.id, parsed.data);
    success(res, { profile }); return;
  }

  throw new ValidationError("Unknown role: " + role, []);
}

// PUT /users/:id/availability — parent (Provider) sets a managed worker's
// availability slots. Mirrors PUT /users/me/availability but parent-scoped;
// availability lives outside workerProfileSchema (its own table), so it can't
// be set via POST /users/:id/profile/worker.
export async function putChildAvailability(req: Request, res: Response): Promise<void> {
  await requireManagedChild(req);
  const { slots } = availabilitySlotsSchema.parse(req.body);
  const availability = await profileService.replaceAvailabilitySlots(req.params.id, slots);
  success(res, { availability });
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

// POST /users/:id/documents — parent uploads a compliance document for a managed child
// (the worker never logs in to do this themselves — the provider supplies everything).
export async function uploadChildDocument(req: Request, res: Response): Promise<void> {
  const target = await requireManagedChild(req);
  if (!req.file) throw new BadRequestError("No file uploaded");

  const parsed = uploadDocumentSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.errors[0]?.message ?? "Invalid input",
      parsed.error.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
    );
  }

  const doc = await documentService.uploadDocument(target.id, req.file, parsed.data);
  success(res, { document: doc }, 201);
}

// GET /users/:id/documents — parent lists a managed child's uploaded documents
export async function listChildDocuments(req: Request, res: Response): Promise<void> {
  const target = await requireManagedChild(req);
  const documents = await documentService.listDocuments(target.id);
  success(res, { documents });
}

// DELETE /users/:id/documents/:docId - parent deletes a managed child's document
export async function deleteChildDocument(req: Request, res: Response): Promise<void> {
  const target = await requireManagedChild(req);
  await documentService.deleteDocument(target.id, req.params.docId);
  success(res, { ok: true });
}
