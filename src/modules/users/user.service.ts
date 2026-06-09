import { prisma } from "../../lib/prisma";
import { NotFoundError, ConflictError } from "../../lib/errors";
import type { UpdateProfileInput } from "../../validators/profile.schema";
import type { User, UserRole } from "@prisma/client";

// ─── Shared include ───────────────────────────────────────────────────────────

const USER_INCLUDE = {
  addresses: { orderBy: [{ isDefault: "desc" as const }, { createdAt: "asc" as const }] },
  roles: { orderBy: [{ isActiveDefault: "desc" as const }, { createdAt: "asc" as const }] },
  participantProfile: true as const,
  workerProfile:      { include: { availability: true as const } },
  providerProfile:    true as const,
  coordinatorProfile: true as const,
  planManagerProfile: true as const,
  documents:          { orderBy: { uploadedAt: "desc" as const } },
};

export async function getUserById(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: USER_INCLUDE,
  });
  if (!user) throw new NotFoundError("User not found");
  return user;
}

export function sanitizeUser<T extends { passwordHash: string | null }>(user: T): Omit<T, "passwordHash"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _ph, ...safe } = user;
  return safe;
}

// ─── Profile completion % (per active role) ───────────────────────────────────

type FullUser = Awaited<ReturnType<typeof getUserById>>;

export function computeProfileStep(user: FullUser, activeRole: UserRole): number {
  switch (activeRole) {
    case "PARTICIPANT":    return user.participantProfile?.profileStep ?? 0;
    case "SUPPORT_WORKER": return user.workerProfile?.profileStep ?? 0;
    case "PROVIDER":       return user.providerProfile?.profileStep ?? 0;
    case "COORDINATOR":    return user.coordinatorProfile?.profileStep ?? 0;
    case "PLAN_MANAGER":   return user.planManagerProfile?.profileStep ?? 0;
    default:               return 0;
  }
}

export function computeCompletion(user: FullUser, activeRole: UserRole): number {
  const wp  = user.workerProfile;
  const pp  = user.participantProfile;
  const cp  = user.coordinatorProfile;
  const pr  = user.providerProfile;
  const pm  = user.planManagerProfile;
  const hasSuburb = !!user.defaultSuburb;

  const pct = (filled: number, total: number) => Math.round((filled / total) * 100);
  const has  = (v: unknown) => v !== null && v !== undefined && v !== "";

  switch (activeRole) {
    case "PARTICIPANT": {
      const fields = [
        user.phoneVerified,
        hasSuburb,
        has(pp?.preferredName),
        has(pp?.primaryDisability),
        has(pp?.fundingManagementType),
        has(pp?.emergencyContactName),
        has(pp?.ndisNumber),
      ];
      return pct(fields.filter(Boolean).length, fields.length);
    }

    case "SUPPORT_WORKER": {
      const fields = [
        user.phoneVerified,
        hasSuburb,
        has(wp?.rightToWork),
        has(wp?.servicesOffered),
        has(wp?.experienceLevel),
        has(wp?.availabilityType),
        has(wp?.bio),
        has(wp?.hourlyRate),
        wp && (wp.availability?.length ?? 0) > 0,
      ];
      return pct(fields.filter(Boolean).length, fields.length);
    }

    case "COORDINATOR": {
      const fields = [
        user.phoneVerified,
        has(cp?.roleType),
        has(cp?.organisationName),
        has(cp?.serviceAreas),
        has(cp?.bio),
        has(cp?.hourlyRate),
        has(cp?.serviceMode),
        has(cp?.supportCoordinationLevel),
      ];
      return pct(fields.filter(Boolean).length, fields.length);
    }

    case "PROVIDER": {
      const fields = [
        user.phoneVerified,
        has(pr?.businessName),
        has(pr?.abn),
        has(pr?.coreServices),
        has(pr?.serviceAreas),
        has(pr?.primaryContactName),
        has(pr?.businessDescription),
        has(pr?.serviceMode),
        user.status === "ACTIVE",
      ];
      return pct(fields.filter(Boolean).length, fields.length);
    }

    case "PLAN_MANAGER": {
      const fields = [
        user.phoneVerified,
        has(pm?.businessName),
        has(pm?.abn),
        has(pm?.serviceAreas),
        user.status === "ACTIVE",
      ];
      return pct(fields.filter(Boolean).length, fields.length);
    }

    default:
      return 0;
  }
}

// Parent edits a child — same logic, just a different userId
export const updateChildProfile = updateProfile;

// ─── Profile update (PATCH /users/me) ────────────────────────────────────────

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const { address, ...scalar } = input;

  if (scalar.email) {
    const existing = await prisma.user.findUnique({ where: { email: scalar.email } });
    if (existing && existing.id !== userId) throw new ConflictError("That email is already in use");
  }
  if (scalar.phone) {
    const existing = await prisma.user.findUnique({ where: { phone: scalar.phone } });
    if (existing && existing.id !== userId) throw new ConflictError("That phone number is already in use");
  }
  if (scalar.username) {
    const existing = await prisma.user.findUnique({ where: { username: scalar.username } });
    if (existing && existing.id !== userId) throw new ConflictError("That username is already taken");
  }

  const scalarData: Record<string, unknown> = {};
  if (scalar.name            !== undefined) scalarData.name            = scalar.name;
  if (scalar.email           !== undefined) scalarData.email           = scalar.email.toLowerCase();
  if (scalar.phone           !== undefined) scalarData.phone           = scalar.phone;
  if (scalar.avatarUrl       !== undefined) scalarData.avatarUrl       = scalar.avatarUrl;
  if (scalar.username        !== undefined) scalarData.username        = scalar.username;
  if (scalar.defaultSuburb   !== undefined) scalarData.defaultSuburb   = scalar.defaultSuburb;
  if (scalar.defaultState    !== undefined) scalarData.defaultState    = scalar.defaultState;
  if (scalar.defaultPostcode !== undefined) scalarData.defaultPostcode = scalar.defaultPostcode;

  await prisma.user.update({ where: { id: userId }, data: scalarData });

  // Address: upsert the isDefault address
  if (address) {
    const defaultAddr = await prisma.address.findFirst({
      where: { userId, isDefault: true },
    });
    if (defaultAddr) {
      await prisma.address.update({
        where: { id: defaultAddr.id },
        data: {
          unitApartment: address.unitApartment ?? null,
          street:        address.street ?? null,
          suburb:        address.suburb,
          state:         address.state ?? null,
          postcode:      address.postcode ?? null,
          notes:         address.notes ?? null,
        },
      });
    } else {
      await prisma.address.create({
        data: {
          userId,
          isDefault:     true,
          unitApartment: address.unitApartment ?? null,
          street:        address.street ?? null,
          suburb:        address.suburb,
          state:         address.state ?? null,
          postcode:      address.postcode ?? null,
          notes:         address.notes ?? null,
        },
      });
    }

    // Mirror suburb to user.defaultSuburb for quick access
    await prisma.user.update({
      where: { id: userId },
      data: {
        defaultSuburb:   address.suburb,
        defaultState:    address.state ?? null,
        defaultPostcode: address.postcode ?? null,
      },
    });
  }

  return getUserById(userId);
}
