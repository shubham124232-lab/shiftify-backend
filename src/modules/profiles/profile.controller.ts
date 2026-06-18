import type { Request, Response } from "express";
import { success } from "../../utils/response";
import { UnauthorizedError, ValidationError } from "../../lib/errors";
import * as profileService from "./profile.service";
import type { UserRole } from "@prisma/client";
import { participantProfileSchema  } from "../../validators/profile-participant.schema";
import { workerProfileSchema, availabilitySlotsSchema, unavailabilitySchema } from "../../validators/profile-worker.schema";
import { providerProfileSchema     } from "../../validators/profile-provider.schema";
import { coordinatorProfileSchema  } from "../../validators/profile-coordinator.schema";
import { planManagerProfileSchema  } from "../../validators/profile-planmanager.schema";

function parseOrThrow<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { errors: { path: (string | number)[]; message: string }[] } } }, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error!.errors[0]?.message ?? "Invalid input",
      result.error!.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
    );
  }
  return result.data!;
}

// GET /users/me/profile/participant
export async function getParticipant(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const profile = await profileService.getParticipantProfile(req.user.id);
  success(res, { profile });
}

// GET /users/me/profile/worker
export async function getWorker(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const profile = await profileService.getWorkerProfile(req.user.id);
  success(res, { profile });
}

// GET /users/me/profile/provider
export async function getProvider(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const profile = await profileService.getProviderProfile(req.user.id);
  success(res, { profile });
}

// GET /users/me/profile/coordinator
export async function getCoordinator(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const profile = await profileService.getCoordinatorProfile(req.user.id);
  success(res, { profile });
}

// GET /users/me/profile/plan-manager
export async function getPlanManager(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const profile = await profileService.getPlanManagerProfile(req.user.id);
  success(res, { profile });
}

// GET /users/me/profile/progress
export async function getProgress(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const activeRole = (req as unknown as { activeRole?: UserRole }).activeRole;
  if (!activeRole) throw new UnauthorizedError("No active role");
  const progress = await profileService.getProfileProgress(req.user.id, activeRole);
  success(res, progress);
}

// POST /users/me/profile/participant
export async function upsertParticipant(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parseOrThrow(participantProfileSchema, req.body);
  const profile = await profileService.upsertParticipantProfile(req.user.id, data);
  success(res, { profile, profileStep: profile?.profileStep ?? 0 });
}

// POST /users/me/profile/worker
export async function upsertWorker(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parseOrThrow(workerProfileSchema, req.body);
  const profile = await profileService.upsertWorkerProfile(req.user.id, data);
  success(res, { profile, profileStep: (profile as { profileStep?: number } | null)?.profileStep ?? 0 });
}

// POST /users/me/profile/provider
export async function upsertProvider(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parseOrThrow(providerProfileSchema, req.body);
  const profile = await profileService.upsertProviderProfile(req.user.id, data);
  success(res, { profile, profileStep: profile?.profileStep ?? 0 });
}

// POST /users/me/profile/coordinator
export async function upsertCoordinator(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parseOrThrow(coordinatorProfileSchema, req.body);
  const profile = await profileService.upsertCoordinatorProfile(req.user.id, data);
  success(res, { profile, profileStep: profile?.profileStep ?? 0 });
}

// POST /users/me/profile/plan-manager
export async function upsertPlanManager(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const data = parseOrThrow(planManagerProfileSchema, req.body);
  const profile = await profileService.upsertPlanManagerProfile(req.user.id, data);
  success(res, { profile, profileStep: profile?.profileStep ?? 0 });
}

// GET /users/me/availability
export async function getAvailability(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const result = await profileService.getWorkerAvailability(req.user.id);
  success(res, result);
}

// PUT /users/me/availability
export async function replaceAvailability(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const { slots } = parseOrThrow(availabilitySlotsSchema, req.body);
  const availability = await profileService.replaceAvailabilitySlots(req.user.id, slots);
  success(res, { availability });
}

// POST /users/me/unavailability
export async function addUnavailability(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const { date, reason } = parseOrThrow(unavailabilitySchema, req.body);
  const row = await profileService.addUnavailabilityDate(req.user.id, date, reason);
  success(res, { unavailability: row }, 201);
}

// DELETE /users/me/unavailability/:id
export async function deleteUnavailability(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  await profileService.deleteUnavailabilityDate(req.user.id, req.params.id);
  success(res, { ok: true });
}

// GET /users/me/provider-availability
export async function getProviderAvailability(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const result = await profileService.getProviderAvailability(req.user.id);
  success(res, result);
}

// PUT /users/me/provider-availability
export async function replaceProviderAvailability(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const { slots } = parseOrThrow(availabilitySlotsSchema, req.body);
  const availability = await profileService.replaceProviderAvailabilitySlots(req.user.id, slots);
  success(res, { availability });
}
