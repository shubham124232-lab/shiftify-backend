// Profile upsert services — one per role.
// All use Prisma upsert so the endpoint works for first-time submit AND subsequent updates.
// profileStep is advanced only forward — Math.max(existing, submitted).

import { prisma } from "../../lib/prisma";
import { ConflictError, NotFoundError } from "../../lib/errors";
import type { ParticipantProfileInput  } from "../../validators/profile-participant.schema";
import type { WorkerProfileInput       } from "../../validators/profile-worker.schema";
import type { ProviderProfileInput     } from "../../validators/profile-provider.schema";
import type { CoordinatorProfileInput  } from "../../validators/profile-coordinator.schema";
import type { PlanManagerProfileInput  } from "../../validators/profile-planmanager.schema";

// ─── GET profile (read-back for wizard pre-fill) ─────────────────────────────

export async function getParticipantProfile(userId: string) {
  return prisma.participantProfile.findUnique({ where: { userId } });
}

export async function getWorkerProfile(userId: string) {
  return prisma.workerProfile.findUnique({
    where:   { userId },
    include: { availability: true, unavailability: true },
  });
}

export async function getProviderProfile(userId: string) {
  return prisma.providerProfile.findUnique({
    where:   { userId },
    include: { availability: true },
  });
}

export async function getCoordinatorProfile(userId: string) {
  return prisma.coordinatorProfile.findUnique({ where: { userId } });
}

export async function getPlanManagerProfile(userId: string) {
  return prisma.planManagerProfile.findUnique({ where: { userId } });
}

// ─── Profile progress ─────────────────────────────────────────────────────────

// Must match the wizard step array lengths in Web/lib/registration/stepComponents.ts.
const ROLE_TOTAL_STEPS: Record<string, number> = {
  PARTICIPANT:    5,
  SUPPORT_WORKER: 9,
  PROVIDER:       12,
  COORDINATOR:    9,
  PLAN_MANAGER:   15,
};

export async function getProfileProgress(userId: string, activeRole: string) {
  let profileStep = 0;

  switch (activeRole) {
    case "PARTICIPANT": {
      const p = await prisma.participantProfile.findUnique({ where: { userId }, select: { profileStep: true } });
      profileStep = p?.profileStep ?? 0;
      break;
    }
    case "SUPPORT_WORKER": {
      const p = await prisma.workerProfile.findUnique({ where: { userId }, select: { profileStep: true } });
      profileStep = p?.profileStep ?? 0;
      break;
    }
    case "PROVIDER": {
      const p = await prisma.providerProfile.findUnique({ where: { userId }, select: { profileStep: true } });
      profileStep = p?.profileStep ?? 0;
      break;
    }
    case "COORDINATOR": {
      const p = await prisma.coordinatorProfile.findUnique({ where: { userId }, select: { profileStep: true } });
      profileStep = p?.profileStep ?? 0;
      break;
    }
    case "PLAN_MANAGER": {
      const p = await prisma.planManagerProfile.findUnique({ where: { userId }, select: { profileStep: true } });
      profileStep = p?.profileStep ?? 0;
      break;
    }
  }

  const totalSteps = ROLE_TOTAL_STEPS[activeRole] ?? 0;
  const isComplete = profileStep >= totalSteps;
  const nextStep   = isComplete ? totalSteps : profileStep + 1;

  return { role: activeRole, profileStep, totalSteps, isComplete, nextStep };
}

// ─── Date helpers ────────────────────────────────────────────────────────────
// Prisma DateTime columns reject bare "YYYY-MM-DD" strings — convert to Date.
function toDate(v: string | undefined | null): Date | undefined {
  if (!v) return undefined;
  // Already a full ISO string
  if (v.includes("T")) return new Date(v);
  // Date-only "YYYY-MM-DD" — treat as UTC midnight
  return new Date(`${v}T00:00:00.000Z`);
}

function datesToDates<T extends Record<string, unknown>>(obj: T, keys: string[]): T {
  const out = { ...obj } as Record<string, unknown>;
  for (const k of keys) {
    if (k in out && out[k] !== undefined) out[k] = toDate(out[k] as string);
  }
  return out as T;
}

// ─── Participant ─────────────────────────────────────────────────────────────

export async function upsertParticipantProfile(userId: string, data: ParticipantProfileInput) {
  const { profileStep: incomingStep, ...raw } = data;
  const fields = datesToDates(raw as Record<string, unknown>, ["ndisStartDate", "ndisEndDate"]);

  const existing = await prisma.participantProfile.findUnique({ where: { userId } });
  const nextStep  = Math.max(existing?.profileStep ?? 0, incomingStep ?? 0);

  return prisma.participantProfile.upsert({
    where:  { userId },
    create: { userId, profileStep: nextStep, ...(fields as any) },
    update: { profileStep: nextStep, ...(fields as any) },
  });
}

// ─── Worker ──────────────────────────────────────────────────────────────────

export async function upsertWorkerProfile(userId: string, data: WorkerProfileInput) {
  const { availability, profileStep: incomingStep, ...raw } = data;
  const profileData = datesToDates(raw as Record<string, unknown>, [
    "dob", "visaExpiry", "publicLiabilityExpiry", "personalAccidentExpiry",
    "ndisScreeningExpiry", "policeCheckIssueDate", "policeCheckExpiry",
    "wwccExpiry", "firstAidExpiry", "cprExpiry", "driversLicenceExpiry",
  ]);

  const existing  = await prisma.workerProfile.findUnique({ where: { userId } });
  const nextStep  = Math.max(existing?.profileStep ?? 0, incomingStep ?? 0);

  const profile = await prisma.workerProfile.upsert({
    where:  { userId },
    create: { userId, profileStep: nextStep, ...(profileData as any) },
    update: { profileStep: nextStep, ...(profileData as any) },
  });

  // Replace all availability slots only if the caller supplied the key.
  if (availability !== undefined) {
    await prisma.$transaction([
      prisma.workerAvailability.deleteMany({ where: { workerProfileId: profile.id } }),
      ...(availability.length > 0
        ? [
            prisma.workerAvailability.createMany({
              data: availability.map((s) => ({
                workerProfileId: profile.id,
                dayOfWeek: s.dayOfWeek,
                startTime: s.startTime,
                endTime:   s.endTime,
              })),
            }),
          ]
        : []),
    ]);
  }

  return prisma.workerProfile.findUnique({
    where: { userId },
    include: { availability: true, unavailability: true },
  });
}

// ─── Provider ────────────────────────────────────────────────────────────────

export async function upsertProviderProfile(userId: string, data: ProviderProfileInput) {
  const { profileStep: incomingStep, abn: rawAbn, ...raw } = data;
  const fields = datesToDates(raw as Record<string, unknown>, [
    "publicLiabilityExpiryDate", "professionalIndemnityExpiryDate", "workersCompExpiryDate",
  ]);

  const existing = await prisma.providerProfile.findUnique({ where: { userId } });
  const nextStep  = Math.max(existing?.profileStep ?? 0, incomingStep ?? 0);

  const abn = rawAbn?.trim() || undefined;
  if (abn) {
    const taken = await prisma.providerProfile.findUnique({ where: { abn } });
    if (taken && taken.userId !== userId) {
      throw new ConflictError("That ABN is already registered to another provider");
    }
  }

  const profileFields = { ...fields, ...(abn !== undefined ? { abn } : {}) };

  return prisma.providerProfile.upsert({
    where:  { userId },
    create: { userId, profileStep: nextStep, businessName: (fields.businessName as string) ?? "", ...(profileFields as any) },
    update: { profileStep: nextStep, ...(profileFields as any) },
  });
}

// ─── Coordinator ─────────────────────────────────────────────────────────────

export async function upsertCoordinatorProfile(userId: string, data: CoordinatorProfileInput) {
  const { profileStep: incomingStep, ...raw } = data;
  const fields = datesToDates(raw as Record<string, unknown>, [
    "policeCheckExpiry", "wwccExpiry", "ndisScreeningExpiry",
    "professionalIndemnityExpiry", "publicLiabilityExpiry",
  ]);

  const existing = await prisma.coordinatorProfile.findUnique({ where: { userId } });
  const nextStep  = Math.max(existing?.profileStep ?? 0, incomingStep ?? 0);

  return prisma.coordinatorProfile.upsert({
    where:  { userId },
    create: { userId, profileStep: nextStep, ...(fields as any) },
    update: { profileStep: nextStep, ...(fields as any) },
  });
}

// ─── Plan Manager ────────────────────────────────────────────────────────────

export async function upsertPlanManagerProfile(userId: string, data: PlanManagerProfileInput) {
  const { profileStep: incomingStep, ...raw } = data;
  const fields = datesToDates(raw as Record<string, unknown>, ["registrationExpiryDate"]);

  const existing = await prisma.planManagerProfile.findUnique({ where: { userId } });
  const nextStep  = Math.max(existing?.profileStep ?? 0, incomingStep ?? 0);

  return prisma.planManagerProfile.upsert({
    where:  { userId },
    create: { userId, profileStep: nextStep, businessName: (fields.businessName as string) ?? "", ...(fields as any) },
    update: { profileStep: nextStep, ...(fields as any) },
  });
}

// ─── Worker availability ─────────────────────────────────────────────────────

export async function getWorkerAvailability(userId: string) {
  const profile = await prisma.workerProfile.findUnique({
    where: { userId },
    include: { availability: true, unavailability: true },
  });
  if (!profile) throw new NotFoundError("Worker profile not found. Submit your profile first.");
  return { availability: profile.availability, unavailability: profile.unavailability };
}

export async function replaceAvailabilitySlots(
  userId: string,
  slots: { dayOfWeek: string; startTime: string; endTime: string }[],
) {
  const profile = await prisma.workerProfile.findUnique({ where: { userId } });
  if (!profile) throw new NotFoundError("Worker profile not found. Submit your profile first.");

  await prisma.$transaction([
    prisma.workerAvailability.deleteMany({ where: { workerProfileId: profile.id } }),
    ...(slots.length > 0
      ? [
          prisma.workerAvailability.createMany({
            data: slots.map((s) => ({
              workerProfileId: profile.id,
              dayOfWeek: s.dayOfWeek as never,
              startTime: s.startTime,
              endTime:   s.endTime,
            })),
          }),
        ]
      : []),
  ]);

  return prisma.workerAvailability.findMany({ where: { workerProfileId: profile.id } });
}

export async function addUnavailabilityDate(
  userId: string,
  date: string,
  reason?: string,
) {
  const profile = await prisma.workerProfile.findUnique({ where: { userId } });
  if (!profile) throw new NotFoundError("Worker profile not found. Submit your profile first.");
  return prisma.workerUnavailability.create({
    data: {
      workerProfileId: profile.id,
      date:   new Date(date),
      reason: reason ?? null,
    },
  });
}

export async function deleteUnavailabilityDate(userId: string, unavailabilityId: string) {
  const profile = await prisma.workerProfile.findUnique({ where: { userId } });
  if (!profile) throw new NotFoundError("Worker profile not found.");
  const row = await prisma.workerUnavailability.findFirst({
    where: { id: unavailabilityId, workerProfileId: profile.id },
  });
  if (!row) throw new NotFoundError("Unavailability record not found.");
  await prisma.workerUnavailability.delete({ where: { id: unavailabilityId } });
}

// ─── Provider availability ────────────────────────────────────────────────────

export async function getProviderAvailability(userId: string) {
  const profile = await prisma.providerProfile.findUnique({
    where: { userId },
    include: { availability: true },
  });
  if (!profile) throw new NotFoundError("Provider profile not found. Submit your profile first.");
  return { availability: profile.availability };
}

export async function replaceProviderAvailabilitySlots(
  userId: string,
  slots: { dayOfWeek: string; startTime: string; endTime: string }[],
) {
  const profile = await prisma.providerProfile.findUnique({ where: { userId } });
  if (!profile) throw new NotFoundError("Provider profile not found. Submit your profile first.");

  await prisma.$transaction([
    prisma.providerAvailability.deleteMany({ where: { providerProfileId: profile.id } }),
    ...(slots.length > 0
      ? [
          prisma.providerAvailability.createMany({
            data: slots.map((s) => ({
              providerProfileId: profile.id,
              dayOfWeek: s.dayOfWeek as never,
              startTime: s.startTime,
              endTime:   s.endTime,
            })),
          }),
        ]
      : []),
  ]);

  return prisma.providerAvailability.findMany({ where: { providerProfileId: profile.id } });
}