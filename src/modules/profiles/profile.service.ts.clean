// Profile upsert services — one per role.
// All use Prisma upsert so the endpoint works for first-time submit AND subsequent updates.
// profileStep is advanced only forward — Math.max(existing, submitted).

import { prisma } from "../../lib/prisma";
import { NotFoundError } from "../../lib/errors";
import type { ParticipantProfileInput  } from "../../validators/profile-participant.schema";
import type { WorkerProfileInput       } from "../../validators/profile-worker.schema";
import type { ProviderProfileInput     } from "../../validators/profile-provider.schema";
import type { CoordinatorProfileInput  } from "../../validators/profile-coordinator.schema";
import type { PlanManagerProfileInput  } from "../../validators/profile-planmanager.schema";

// ─── Participant ─────────────────────────────────────────────────────────────

export async function upsertParticipantProfile(userId: string, data: ParticipantProfileInput) {
  const { profileStep: incomingStep, ...fields } = data;

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
  const { availability, profileStep: incomingStep, ...profileData } = data;

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
  const { profileStep: incomingStep, ...fields } = data;

  const existing = await prisma.providerProfile.findUnique({ where: { userId } });
  const nextStep  = Math.max(existing?.profileStep ?? 0, incomingStep ?? 0);

  return prisma.providerProfile.upsert({
    where:  { userId },
    create: { userId, profileStep: nextStep, businessName: fields.businessName ?? "", abn: fields.abn ?? "", ...(fields as any) },
    update: { profileStep: nextStep, ...(fields as any) },
  });
}

// ─── Coordinator ─────────────────────────────────────────────────────────────

export async function upsertCoordinatorProfile(userId: string, data: CoordinatorProfileInput) {
  const { profileStep: incomingStep, ...fields } = data;

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
  const { profileStep: incomingStep, ...fields } = data;

  const existing = await prisma.planManagerProfile.findUnique({ where: { userId } });
  const nextStep  = Math.max(existing?.profileStep ?? 0, incomingStep ?? 0);

  return prisma.planManagerProfile.upsert({
    where:  { userId },
    create: { userId, profileStep: nextStep, businessName: fields.businessName ?? "", ...(fields as any) },
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
