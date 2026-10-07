import { prisma } from "../../lib/prisma";
import { NotFoundError, ConflictError } from "../../lib/errors";
import type { CreateSavedProfessionalInput } from "../../validators/saved-professional.schema";

// ─── Save a worker/provider profile (SC-SV01/02) ───────────────────────────────

export async function saveProfessional(ownerUserId: string, input: CreateSavedProfessionalInput) {
  const professional = await prisma.user.findUnique({
    where:   { id: input.professionalUserId },
    include: { roles: true },
  });
  if (!professional || !professional.roles.some((r) => ["SUPPORT_WORKER", "PROVIDER"].includes(r.role))) {
    throw new NotFoundError("Worker or provider not found");
  }

  const existing = await prisma.savedProfessional.findFirst({
    where: {
      ownerUserId,
      professionalUserId: input.professionalUserId,
      listType: input.listType,
      forParticipantUserId: input.forParticipantUserId ?? null,
    },
  });
  if (existing) throw new ConflictError("Already saved to this list");

  return prisma.savedProfessional.create({
    data: {
      ownerUserId,
      professionalUserId: input.professionalUserId,
      note: input.note,
      listType: input.listType,
      forParticipantUserId: input.forParticipantUserId,
    },
    include: {
      professional: {
        select: {
          id: true, name: true, avatarUrl: true,
          roles: { select: { role: true } },
          workerProfile:   { select: { rating: true, totalReviews: true, hourlyRate: true, servicesOffered: true, suburb: true, state: true } },
          providerProfile: { select: { averageRating: true, totalRatings: true, coreServices: true, businessName: true } },
        },
      },
    },
  });
}

// ─── List saved professionals ──────────────────────────────────────────────────

export async function listSavedProfessionals(ownerUserId: string, listType?: string) {
  return prisma.savedProfessional.findMany({
    where: { ownerUserId, ...(listType ? { listType } : {}) },
    orderBy: { createdAt: "desc" },
    include: {
      professional: {
        select: {
          id: true, name: true, avatarUrl: true,
          roles: { select: { role: true } },
          workerProfile:   { select: { rating: true, totalReviews: true, hourlyRate: true, servicesOffered: true, suburb: true, state: true } },
          providerProfile: { select: { averageRating: true, totalRatings: true, coreServices: true, businessName: true } },
        },
      },
    },
  });
}

// ─── Remove a saved professional ───────────────────────────────────────────────

export async function removeSavedProfessional(
  ownerUserId: string,
  professionalUserId: string,
  listType: string = "GENERAL",
  forParticipantUserId?: string,
) {
  const existing = await prisma.savedProfessional.findFirst({
    where: {
      ownerUserId,
      professionalUserId,
      listType,
      forParticipantUserId: forParticipantUserId ?? null,
    },
  });
  if (!existing) throw new NotFoundError("Not saved");
  await prisma.savedProfessional.delete({ where: { id: existing.id } });
}
