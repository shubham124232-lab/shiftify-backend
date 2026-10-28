// Provider organisation model (Pricing V2 §4/§4.4/§5) — Branches, Administrators
// (existing platform users who help manage the org), and Team Members (a
// Provider-internal roster entry with passwordless mobile verification, not a
// full independent User account). Capacity per tier is enforced Provider-wide
// via the active org-tier Plan's maxAdministrators/maxTeamMembers/maxBranches.

import crypto from "node:crypto";
import { prisma } from "../../lib/prisma";
import type { Prisma } from "@prisma/client";
import { BadRequestError, ConflictError, NotFoundError, UnauthorizedError } from "../../lib/errors";
import { ApiError } from "../../lib/errors";
import { notify } from "../../lib/notify";
import { devCodesEnabled } from "../../config/env";
import { getActiveProviderOrgCaps } from "../subscriptions/subscription.service";
import type {
  CreateBranchInput,
  UpdateBranchInput,
  CreateAdministratorInput,
  UpdateAdministratorInput,
  CreateTeamMemberInput,
  UpdateTeamMemberInput,
  ConfirmTeamMemberVerificationInput,
  SaveServiceLineInput,
} from "../../validators/provider-org.schema";

const VERIFICATION_TTL_MINUTES = 10;
const returnDevCode = (): boolean => devCodesEnabled;

async function requireCaps(providerUserId: string) {
  const caps = await getActiveProviderOrgCaps(providerUserId);
  if (!caps) {
    throw new ApiError(
      403,
      "SUBSCRIPTION_REQUIRED",
      "An active Provider organisation plan is required to manage Branches, Administrators, or Team Members. Choose a plan on the Subscription page to continue.",
    );
  }
  return caps;
}

// Managed worker login accounts (created at /linking/workers) are also Internal
// Workforce, so they share the Team Member allowance with invited roster entries.
function countManagedWorkers(providerUserId: string) {
  return prisma.user.count({
    where: { parentUserId: providerUserId, accountType: "MANAGED", roles: { some: { role: "SUPPORT_WORKER" } } },
  });
}

// ─── Branches ───────────────────────────────────────────────────────────────

// "PROVIDER_ORG_STARTER_ANNUAL" -> "Starter" for user-facing capacity messages.
function planLabel(planKey: string): string {
  const name = planKey.replace("PROVIDER_ORG_", "").replace("_ANNUAL", "").toLowerCase();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export async function createBranch(providerUserId: string, input: CreateBranchInput) {
  const caps = await requireCaps(providerUserId);
  if (caps.maxBranches != null) {
    const count = await prisma.providerBranch.count({ where: { providerUserId } });
    if (count >= caps.maxBranches) {
      throw new ApiError(
        403,
        "SUBSCRIPTION_LIMIT",
        `Your ${planLabel(caps.planKey)} plan allows up to ${caps.maxBranches} Branches. Upgrade to add more.`,
      );
    }
  }
  await assertManager(providerUserId, input.managerUserId);
  return prisma.providerBranch.create({
    data: {
      providerUserId,
      name: input.name,
      region: input.region ?? null,
      timezone: input.timezone ?? null,
      managerUserId: input.managerUserId ?? null,
      serviceLines: input.serviceLines ?? [],
      address: input.address ?? null,
      escalationContact: input.escalationContact ?? null,
      contact: input.contact ?? null,
      serviceRadiusKm: input.serviceRadiusKm ?? null,
    },
  });
}

// A Branch manager is the organisation owner or one of its Administrators.
async function assertManager(providerUserId: string, managerUserId: string | null | undefined) {
  if (!managerUserId || managerUserId === providerUserId) return;
  const admin = await prisma.providerAdministrator.findUnique({
    where: { providerUserId_userId: { providerUserId, userId: managerUserId } },
  });
  if (!admin) throw new BadRequestError("The Branch manager must be the owner or one of your Administrators.");
}

async function managerNames(providerUserId: string, userIds: (string | null)[]) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  return new Map(users.map((u) => [u.id, u.name]));
}

// Provider doc section 2: an Administrator only sees and changes the Branches they are authorised for.
// `scope` is their authorised Branch ids, or null/undefined for an organisation Owner (no restriction).
type BranchScope = string[] | null | undefined;
function assertBranchInScope(scope: BranchScope, branchId: string, message = "Branch not found"): void {
  if (scope && !scope.includes(branchId)) throw new NotFoundError(message);
}

export async function listBranches(providerUserId: string, scope?: BranchScope) {
  const branches = await prisma.providerBranch.findMany({
    where: { providerUserId, ...(scope ? { id: { in: scope } } : {}) },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { administrators: true, teamMembers: true } } },
  });
  const names = await managerNames(providerUserId, branches.map((b) => b.managerUserId));
  return branches.map((b) => ({ ...b, managerName: b.managerUserId ? names.get(b.managerUserId) ?? null : null }));
}

// One Branch with its people — the "Open workspace" view.
export async function getBranch(providerUserId: string, branchId: string, scope?: BranchScope) {
  assertBranchInScope(scope, branchId);
  const branch = await prisma.providerBranch.findUnique({
    where: { id: branchId },
    include: {
      administrators: { include: { user: { select: { id: true, name: true, email: true } } } },
      teamMembers: {
        where: { removedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, mobile: true, skills: true, inviteStatus: true, locations: true, relationshipType: true },
      },
    },
  });
  if (!branch || branch.providerUserId !== providerUserId) throw new NotFoundError("Branch not found");
  const names = await managerNames(providerUserId, [branch.managerUserId]);
  return { ...branch, managerName: branch.managerUserId ? names.get(branch.managerUserId) ?? null : null };
}

export async function updateBranch(providerUserId: string, branchId: string, input: UpdateBranchInput, scope?: BranchScope) {
  assertBranchInScope(scope, branchId);
  const branch = await prisma.providerBranch.findUnique({ where: { id: branchId } });
  if (!branch || branch.providerUserId !== providerUserId) throw new NotFoundError("Branch not found");
  if (input.managerUserId !== undefined) await assertManager(providerUserId, input.managerUserId);
  const { transferToBranchId, ...data } = input;
  if (data.isActive === false && branch.isActive) {
    // Doc P15: deactivating a Branch with active work needs its ownership handled first; history stays.
    const [requests, people] = await Promise.all([
      prisma.supportRequest.count({ where: { branchId, status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] }, scheduledStartAt: { gt: new Date() } } }),
      prisma.providerTeamMember.count({ where: { branchId, removedAt: null } }),
    ]);
    if (requests + people > 0) {
      if (!transferToBranchId) {
        throw new ApiError(409, "BRANCH_HAS_ACTIVE_WORK", `${requests} active staffing request${requests === 1 ? "" : "s"} and ${people} Team Member${people === 1 ? "" : "s"} are on this Branch. Transfer them to another Branch before deactivating it.`);
      }
      if (transferToBranchId === branchId) throw new BadRequestError("Choose a different Branch to transfer to.");
      assertBranchInScope(scope, transferToBranchId, "Branch does not belong to your organisation.");
      const target = await prisma.providerBranch.findUnique({ where: { id: transferToBranchId } });
      if (!target || target.providerUserId !== providerUserId || !target.isActive) throw new BadRequestError("Choose an active Branch of your organisation to transfer to.");
      await prisma.$transaction([
        prisma.supportRequest.updateMany({ where: { branchId, status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] }, scheduledStartAt: { gt: new Date() } }, data: { branchId: transferToBranchId } }),
        prisma.providerTeamMember.updateMany({ where: { branchId, removedAt: null }, data: { branchId: transferToBranchId } }),
      ]);
    }
  }
  return prisma.providerBranch.update({ where: { id: branchId }, data });
}

export async function deleteBranch(providerUserId: string, branchId: string, scope?: BranchScope) {
  assertBranchInScope(scope, branchId);
  const branch = await prisma.providerBranch.findUnique({ where: { id: branchId } });
  if (!branch || branch.providerUserId !== providerUserId) throw new NotFoundError("Branch not found");
  // Deleting a Branch cascades to its Team Member rows, which would erase the
  // record that keeps this period's capacity honest — so refuse while any are on it.
  const caps = await getActiveProviderOrgCaps(providerUserId);
  const stillCounted = await prisma.providerTeamMember.count({
    where: {
      branchId,
      ...(caps ? { OR: [{ removedAt: null }, { removedAt: { gte: caps.periodStart } }] } : {}),
    },
  });
  if (stillCounted > 0) {
    throw new BadRequestError("This Branch still has Team Members assigned this billing period. Move or remove them first; removed members stay counted until the period ends.");
  }
  await prisma.providerBranch.delete({ where: { id: branchId } });
}

// ─── Administrators ─────────────────────────────────────────────────────────

// The organisation owner this person acts for as an Administrator, or null if they own their own Provider
// profile (an owner always acts as their own organisation) or are not an active Administrator anywhere.
export async function resolveAdministeredOrgOwner(userId: string): Promise<string | null> {
  const admin = await prisma.providerAdministrator.findFirst({
    where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" }, select: { providerUserId: true },
  });
  if (!admin) return null;
  const own = await prisma.providerProfile.findUnique({ where: { userId }, select: { userId: true } });
  return own ? null : admin.providerUserId;
}

const INVITE_TTL_DAYS = 7;
// Statuses that hold a seat in the plan's Administrator limit (an Expired/Revoked invite does not).
const SEAT_STATUSES = ["PENDING", "ACTIVE", "INACTIVE"];
const ADMIN_INCLUDE = { user: { select: { id: true, name: true, email: true } }, branches: { select: { id: true, name: true } } } as const;

const inviteExpiry = (): Date => new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);

async function notifyInvite(providerUserId: string, inviteeId: string): Promise<void> {
  const org = await prisma.providerProfile.findUnique({ where: { userId: providerUserId }, select: { businessName: true } });
  await notify.sendPushNotification(inviteeId, "Invitation to administer a Provider organisation",
    `${org?.businessName ?? "A Provider organisation"} invited you to help manage it. Open Invitations to accept. The invitation expires in ${INVITE_TTL_DAYS} days.`);
}

// P16 - PENDING invitations past their expiry become EXPIRED (checked lazily, no scheduler needed).
async function expireStaleInvites(where: { providerUserId?: string; userId?: string }) {
  await prisma.providerAdministrator.updateMany({
    where: { ...where, status: "PENDING", inviteExpiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
}

export async function createAdministrator(providerUserId: string, input: CreateAdministratorInput) {
  const caps = await requireCaps(providerUserId);

  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() }, include: { roles: { select: { role: true } } } });
  if (!user) throw new NotFoundError("No Shiftify account exists with that email yet — ask them to sign up as a Provider first.");
  if (user.id === providerUserId) throw new BadRequestError("You are already the owner of this organisation.");
  // Each Shiftify login holds one account role, so an Administrator must have signed up as a Provider.
  if (!user.roles.some((r) => r.role === "PROVIDER")) {
    throw new BadRequestError("That email belongs to a different type of Shiftify account. Each login holds one account type, so ask them to sign up as a Provider with their work email.");
  }

  await expireStaleInvites({ providerUserId, userId: user.id });
  const existing = await prisma.providerAdministrator.findUnique({
    where: { providerUserId_userId: { providerUserId, userId: user.id } },
  });
  if (existing && SEAT_STATUSES.includes(existing.status)) {
    throw new ConflictError(existing.status === "PENDING"
      ? "This person already has a pending invitation. Resend it from the Administrators list."
      : "This person is already an Administrator on your organisation.");
  }

  if (caps.maxAdministrators != null) {
    const count = await prisma.providerAdministrator.count({ where: { providerUserId, status: { in: SEAT_STATUSES } } });
    if (count >= caps.maxAdministrators) {
      throw new ApiError(
        403,
        "SUBSCRIPTION_LIMIT",
        `Your ${planLabel(caps.planKey)} plan allows up to ${caps.maxAdministrators} Administrators. Upgrade to add more.`,
      );
    }
  }

  const branchIds = input.branchIds ?? [];
  if (branchIds.length > 0) {
    const owned = await prisma.providerBranch.count({ where: { id: { in: branchIds }, providerUserId } });
    if (owned !== branchIds.length) throw new BadRequestError("One or more Branches do not belong to your organisation.");
  }

  const data = {
    status: "PENDING",
    inviteExpiresAt: inviteExpiry(),
    acceptedAt: null,
    ...(input.rolePreset ? { rolePreset: input.rolePreset } : {}),
    ...(input.billingAccess !== undefined ? { billingAccess: input.billingAccess } : {}),
    ...(input.referralCode ? { referralCode: input.referralCode } : {}),
  };
  const administrator = existing
    // Re-inviting someone whose earlier invitation expired or was revoked reuses the same row.
    ? await prisma.providerAdministrator.update({ where: { id: existing.id }, data: { ...data, branches: { set: branchIds.map((id) => ({ id })) } }, include: ADMIN_INCLUDE })
    : await prisma.providerAdministrator.create({
        data: { providerUserId, userId: user.id, ...data, branches: branchIds.length > 0 ? { connect: branchIds.map((id) => ({ id })) } : undefined },
        include: ADMIN_INCLUDE,
      });
  await notifyInvite(providerUserId, user.id);
  return administrator;
}

// Resend refreshes the expiry and re-notifies; it also revives an Expired invitation.
export async function resendAdministratorInvite(providerUserId: string, administratorId: string) {
  const admin = await prisma.providerAdministrator.findUnique({ where: { id: administratorId } });
  if (!admin || admin.providerUserId !== providerUserId) throw new NotFoundError("Administrator not found");
  if (admin.status !== "PENDING" && admin.status !== "EXPIRED") throw new BadRequestError("Only a pending or expired invitation can be resent.");
  const updated = await prisma.providerAdministrator.update({
    where: { id: administratorId }, data: { status: "PENDING", inviteExpiresAt: inviteExpiry() }, include: ADMIN_INCLUDE,
  });
  await notifyInvite(providerUserId, admin.userId);
  return updated;
}

export async function revokeAdministratorInvite(providerUserId: string, administratorId: string) {
  const admin = await prisma.providerAdministrator.findUnique({ where: { id: administratorId } });
  if (!admin || admin.providerUserId !== providerUserId) throw new NotFoundError("Administrator not found");
  if (admin.status !== "PENDING" && admin.status !== "EXPIRED") throw new BadRequestError("Only a pending or expired invitation can be revoked. Remove an active Administrator instead.");
  await prisma.providerAdministrator.update({ where: { id: administratorId }, data: { status: "REVOKED", inviteExpiresAt: null } });
}

// The invited person's own view: invitations waiting for them (not yet an Administrator, so not org-scoped).
export async function listMyAdministratorInvitations(userId: string) {
  await expireStaleInvites({ userId });
  const rows = await prisma.providerAdministrator.findMany({
    where: { userId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: { provider: { select: { providerProfile: { select: { businessName: true } } } } },
  });
  return rows.map((r) => ({
    id: r.id, businessName: r.provider.providerProfile?.businessName ?? "A Provider organisation",
    rolePreset: r.rolePreset, expiresAt: r.inviteExpiresAt,
  }));
}

export async function acceptAdministratorInvitation(userId: string, administratorId: string) {
  await expireStaleInvites({ userId });
  const admin = await prisma.providerAdministrator.findUnique({ where: { id: administratorId } });
  if (!admin || admin.userId !== userId) throw new NotFoundError("Invitation not found");
  if (admin.status !== "PENDING") throw new BadRequestError(admin.status === "EXPIRED" ? "This invitation has expired. Ask the organisation to resend it." : "This invitation is no longer open.");
  await prisma.providerAdministrator.update({ where: { id: administratorId }, data: { status: "ACTIVE", acceptedAt: new Date(), inviteExpiresAt: null } });
  return { providerUserId: admin.providerUserId };
}

export async function declineAdministratorInvitation(userId: string, administratorId: string) {
  const admin = await prisma.providerAdministrator.findUnique({ where: { id: administratorId } });
  if (!admin || admin.userId !== userId || admin.status !== "PENDING") throw new NotFoundError("Invitation not found");
  await prisma.providerAdministrator.update({ where: { id: administratorId }, data: { status: "REVOKED", inviteExpiresAt: null } });
}

export async function listAdministrators(providerUserId: string) {
  await expireStaleInvites({ providerUserId });
  return prisma.providerAdministrator.findMany({
    where: { providerUserId, status: { not: "REVOKED" } },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, name: true, email: true } }, branches: { select: { id: true, name: true } } },
  });
}

export async function updateAdministrator(providerUserId: string, administratorId: string, input: UpdateAdministratorInput) {
  const admin = await prisma.providerAdministrator.findUnique({ where: { id: administratorId } });
  if (!admin || admin.providerUserId !== providerUserId) throw new NotFoundError("Administrator not found");
  if (input.branchIds) {
    const owned = await prisma.providerBranch.count({ where: { id: { in: input.branchIds }, providerUserId } });
    if (owned !== input.branchIds.length) throw new BadRequestError("One or more Branches do not belong to your organisation.");
  }
  return prisma.providerAdministrator.update({
    where: { id: administratorId },
    data: {
      ...(input.rolePreset ? { rolePreset: input.rolePreset } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.billingAccess !== undefined ? { billingAccess: input.billingAccess } : {}),
      ...(input.branchIds ? { branches: { set: input.branchIds.map((id) => ({ id })) } } : {}),
    },
    include: { user: { select: { id: true, name: true, email: true } }, branches: { select: { id: true, name: true } } },
  });
}

export async function removeAdministrator(providerUserId: string, administratorId: string) {
  const admin = await prisma.providerAdministrator.findUnique({ where: { id: administratorId } });
  if (!admin || admin.providerUserId !== providerUserId) throw new NotFoundError("Administrator not found");
  await prisma.providerAdministrator.delete({ where: { id: administratorId } });
}

// ─── Team Members ───────────────────────────────────────────────────────────

function generateCode(): string {
  return String(crypto.randomInt(100_000, 1_000_000));
}
function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export async function createTeamMember(providerUserId: string, input: CreateTeamMemberInput, scope?: BranchScope) {
  const caps = await requireCaps(providerUserId);
  assertBranchInScope(scope, input.branchId, "Branch does not belong to your organisation.");

  const branch = await prisma.providerBranch.findUnique({ where: { id: input.branchId } });
  if (!branch || branch.providerUserId !== providerUserId) throw new BadRequestError("Branch does not belong to your organisation.");
  if (!branch.isActive) throw new BadRequestError("This Branch is deactivated. Activate it before adding Team Members.");

  const existing = await prisma.providerTeamMember.findUnique({
    where: { providerUserId_mobile: { providerUserId, mobile: input.mobile } },
  });
  if (existing && !existing.removedAt) throw new ConflictError("A Team Member with that mobile number already exists on your organisation.");

  // Capacity is Provider-wide and counts each unique person once, including anyone
  // removed earlier in this billing period — so removing and re-adding someone,
  // or swapping people out, cannot be used to exceed the plan limit.
  const alreadyCounted = !!existing?.removedAt && existing.removedAt >= caps.periodStart;
  if (caps.maxTeamMembers != null && !alreadyCounted) {
    const [rosterCount, managedCount] = await Promise.all([
      prisma.providerTeamMember.count({
        where: { providerUserId, OR: [{ removedAt: null }, { removedAt: { gte: caps.periodStart } }] },
      }),
      countManagedWorkers(providerUserId),
    ]);
    if (rosterCount + managedCount >= caps.maxTeamMembers) {
      throw new ApiError(
        403,
        "SUBSCRIPTION_LIMIT",
        `Your ${planLabel(caps.planKey)} plan allows up to ${caps.maxTeamMembers} Team Members per billing period, including anyone removed earlier in the period. Upgrade to add more.`,
      );
    }
  }

  if (existing?.removedAt) {
    // Re-adding someone previously removed: restore the same row instead of creating a duplicate.
    const restored = await prisma.providerTeamMember.update({
      where: { id: existing.id },
      data: {
        removedAt: null, branchId: input.branchId, name: input.name, skills: input.skills ?? [],
        email: input.email ?? null, relationshipType: input.relationshipType, locations: input.locations ?? [], consentAcknowledgedAt: new Date(),
        languages: input.languages ?? [], credentialStatus: input.credentialStatus ?? null, experienceYears: input.experienceYears ?? null,
        accessLevel: input.accessLevel ?? null, profileVisibility: input.profileVisibility ?? null,
      },
    });
    const _dev_code = await sendVerificationEmail(restored.id, providerUserId);
    return { ...(await autoApproveForTesting(restored)), _dev_code };
  }

  const teamMember = await prisma.providerTeamMember.create({
    data: {
      providerUserId,
      branchId: input.branchId,
      name: input.name,
      mobile: input.mobile,
      skills: input.skills ?? [],
      email: input.email ?? null,
      relationshipType: input.relationshipType,
      locations: input.locations ?? [],
      languages: input.languages ?? [],
      credentialStatus: input.credentialStatus ?? null,
      experienceYears: input.experienceYears ?? null,
      accessLevel: input.accessLevel ?? null,
      profileVisibility: input.profileVisibility ?? null,
      consentAcknowledgedAt: new Date(),
    },
  });

  const _dev_code = await sendVerificationEmail(teamMember.id, providerUserId);
  return { ...(await autoApproveForTesting(teamMember)), _dev_code };
}

// TESTING ONLY: while dev codes are returned (local / staging with RETURN_DEV_OTP) a new Team Member is verified
// automatically so the flow can be tested without an inbox. Email stays required. Real deployments verify by email code.
async function autoApproveForTesting<T extends { id: string }>(member: T): Promise<T> {
  if (!returnDevCode()) return member;
  return prisma.providerTeamMember.update({
    where: { id: member.id },
    data: { inviteStatus: "VERIFIED", mobileVerifiedAt: new Date(), verificationCodeHash: null, verificationCodeExpiresAt: null },
  }) as unknown as T;
}

export async function listTeamMembers(providerUserId: string, scope?: BranchScope) {
  return prisma.providerTeamMember.findMany({
    where: { providerUserId, removedAt: null, ...(scope ? { branchId: { in: scope } } : {}) },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, name: true, mobile: true, skills: true, inviteStatus: true,
      email: true, relationshipType: true, locations: true, languages: true, credentialStatus: true, experienceYears: true, accessLevel: true, profileVisibility: true,
      mobileVerifiedAt: true, claimedByUserId: true, createdAt: true,
      branch: { select: { id: true, name: true } },
    },
  });
}

export async function updateTeamMember(providerUserId: string, teamMemberId: string, input: UpdateTeamMemberInput, scope?: BranchScope) {
  const member = await prisma.providerTeamMember.findUnique({ where: { id: teamMemberId } });
  if (!member || member.providerUserId !== providerUserId || member.removedAt) throw new NotFoundError("Team Member not found");
  assertBranchInScope(scope, member.branchId, "Team Member not found");
  if (input.branchId) assertBranchInScope(scope, input.branchId, "Branch does not belong to your organisation.");
  if (input.branchId && input.branchId !== member.branchId) {
    const branch = await prisma.providerBranch.findUnique({ where: { id: input.branchId } });
    if (!branch || branch.providerUserId !== providerUserId) throw new BadRequestError("Branch does not belong to your organisation.");
    if (!branch.isActive) throw new BadRequestError("This Branch is deactivated.");
  }
  return prisma.providerTeamMember.update({
    where: { id: teamMemberId },
    data: input,
    select: {
      id: true, name: true, mobile: true, skills: true, inviteStatus: true,
      email: true, relationshipType: true, locations: true, languages: true, credentialStatus: true, experienceYears: true, accessLevel: true, profileVisibility: true,
      mobileVerifiedAt: true, claimedByUserId: true, createdAt: true,
      branch: { select: { id: true, name: true } },
    },
  });
}

export async function removeTeamMember(providerUserId: string, teamMemberId: string, scope?: BranchScope) {
  const member = await prisma.providerTeamMember.findUnique({ where: { id: teamMemberId } });
  if (!member || member.providerUserId !== providerUserId || member.removedAt) throw new NotFoundError("Team Member not found");
  assertBranchInScope(scope, member.branchId, "Team Member not found");
  // Soft-remove: the row stays so the person still counts toward this period's capacity.
  await prisma.providerTeamMember.update({ where: { id: teamMemberId }, data: { removedAt: new Date() } });
}

// Re-sends the mobile verification code (e.g. the first one expired).
export async function resendTeamMemberVerification(providerUserId: string, teamMemberId: string) {
  const member = await prisma.providerTeamMember.findUnique({ where: { id: teamMemberId } });
  if (!member || member.providerUserId !== providerUserId) throw new NotFoundError("Team Member not found");
  if (member.inviteStatus === "VERIFIED") throw new ConflictError("This Team Member is already verified.");
  const _dev_code = await sendVerificationEmail(teamMemberId, providerUserId);
  return { _dev_code };
}

// Team Member verification is by emailed code (no phone OTP). `mobileVerifiedAt` keeps its column name but now records
// the moment the person confirmed their emailed code.
async function sendVerificationEmail(teamMemberId: string, providerUserId: string): Promise<string | undefined> {
  const member = await prisma.providerTeamMember.findUnique({ where: { id: teamMemberId } });
  if (!member || member.providerUserId !== providerUserId) throw new NotFoundError("Team Member not found");
  if (!member.email) throw new BadRequestError("Add an email address for this Team Member first. Verification codes are sent by email.");

  const code = generateCode();
  await prisma.providerTeamMember.update({
    where: { id: teamMemberId },
    data: {
      verificationCodeHash: hashCode(code),
      verificationCodeExpiresAt: new Date(Date.now() + VERIFICATION_TTL_MINUTES * 60 * 1_000),
    },
  });

  await notify.sendEmail(
    member.email,
    "Your Shiftify verification code",
    `You've been added as a Team Member. Your verification code is ${code}. It is valid for ${VERIFICATION_TTL_MINUTES} minutes.`,
  );

  return returnDevCode() ? code : undefined;
}

export async function confirmTeamMemberVerification(
  providerUserId: string,
  teamMemberId: string,
  input: ConfirmTeamMemberVerificationInput,
) {
  const member = await prisma.providerTeamMember.findUnique({ where: { id: teamMemberId } });
  if (!member || member.providerUserId !== providerUserId) throw new NotFoundError("Team Member not found");
  if (member.inviteStatus === "VERIFIED") throw new ConflictError("This Team Member is already verified.");
  if (!member.verificationCodeHash || !member.verificationCodeExpiresAt || member.verificationCodeExpiresAt < new Date()) {
    throw new UnauthorizedError("No active verification code — resend one.");
  }
  if (hashCode(input.code) !== member.verificationCodeHash) {
    throw new UnauthorizedError("Incorrect code.");
  }

  return prisma.providerTeamMember.update({
    where: { id: teamMemberId },
    data: {
      inviteStatus: "VERIFIED",
      mobileVerifiedAt: new Date(),
      verificationCodeHash: null,
      verificationCodeExpiresAt: null,
    },
  });
}

// Plan limits and current usage for the Internal Workforce screen (PR-W04). Usage
// counts each unique Team Member once for the billing period, including anyone
// removed earlier in it (Pricing V2 §5.3).
export async function getCapacitySummary(providerUserId: string) {
  const caps = await getActiveProviderOrgCaps(providerUserId);
  if (!caps) return null;
  const [rosterMembers, managedWorkers, administrators, branches] = await Promise.all([
    prisma.providerTeamMember.count({
      where: { providerUserId, OR: [{ removedAt: null }, { removedAt: { gte: caps.periodStart } }] },
    }),
    countManagedWorkers(providerUserId),
    prisma.providerAdministrator.count({ where: { providerUserId, status: { in: SEAT_STATUSES } } }),
    prisma.providerBranch.count({ where: { providerUserId } }),
  ]);
  return {
    planLabel: planLabel(caps.planKey),
    teamMembers:    { used: rosterMembers + managedWorkers, max: caps.maxTeamMembers },
    administrators: { used: administrators, max: caps.maxAdministrators },
    branches:       { used: branches,       max: caps.maxBranches },
  };
}

// Unified inbox (PR-M01) — worker responses to the Provider's staffing requests and the
// Provider's own responses to other people's opportunities, with every status kept so the
// PR-M02 staffing/opportunity status labels can be shown. Direct enquiries come from
// /direct-inquiries/received.
const INBOX_JOB = { id: true, title: true, suburb: true, urgency: true, status: true, scheduledStartAt: true } as const;

export async function getInbox(providerUserId: string) {
  const [workerResponses, opportunityResponses] = await Promise.all([
    prisma.jobApplication.findMany({
      where: { job: { postedByUserId: providerUserId } },
      include: { job: { select: INBOX_JOB }, applicant: { select: { id: true, name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    prisma.jobApplication.findMany({
      where: { applicantUserId: providerUserId },
      include: { job: { select: INBOX_JOB } },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
  ]);
  return {
    workerResponses: workerResponses.map((a) => ({
      id: a.id, status: a.status, applicantName: a.applicant.name, applicantRole: a.applicantRole,
      rateResponse: a.rateResponse, availabilityType: a.availabilityType, createdAt: a.createdAt, updatedAt: a.updatedAt, job: a.job,
      viewedAt: a.viewedAt,
      clarification: !!((a.applicationData ?? {}) as { clarificationQuestion?: string }).clarificationQuestion,
    })),
    opportunityResponses: opportunityResponses.map((a) => ({
      id: a.id, status: a.status, createdAt: a.createdAt, updatedAt: a.updatedAt, job: a.job, viewedAt: a.viewedAt,
    })),
  };
}

// PR-MR02 — joining an existing Provider organisation needs that organisation's approval: the owner is notified and
// adds the person as an administrator (or declines by ignoring). No access is granted by the request itself.
export async function requestToJoin(requesterId: string, abn: string) {
  const clean = abn.replace(/\s/g, "");
  const owner = await prisma.providerProfile.findUnique({ where: { abn: clean }, select: { userId: true, businessName: true } });
  if (!owner) throw new NotFoundError("No Provider is registered with that ABN.");
  if (owner.userId === requesterId) throw new BadRequestError("That is your own organisation.");
  const me = await prisma.user.findUnique({ where: { id: requesterId }, select: { name: true, email: true } });
  const dup = await prisma.notification.findFirst({ where: { userId: owner.userId, type: "PROVIDER_JOIN_REQUEST", data: { path: ["requesterId"], equals: requesterId } }, select: { id: true } });
  if (!dup) {
    await notify.sendPushNotification(owner.userId, "Request to join your organisation",
      `${me?.name ?? "Someone"} (${me?.email ?? "no email"}) asked to join ${owner.businessName ?? "your organisation"}. If you know them, add them as an Administrator on My Organisation.`,
      { requesterId, email: me?.email ?? null }, "PROVIDER_JOIN_REQUEST");
  }
  return { requested: true };
}


// ─── Service lines (Provider demo "Service capability") ─────────────────────

type ServiceLineDetail = { capabilityLimits: string; competencies: string[]; branchIds: string[]; managerUserId: string | null; updatedAt: string };

export async function listServiceLines(providerUserId: string): Promise<Record<string, ServiceLineDetail>> {
  const profile = await prisma.providerProfile.findUnique({ where: { userId: providerUserId }, select: { serviceLineDetails: true } });
  return ((profile?.serviceLineDetails ?? {}) as Record<string, ServiceLineDetail>);
}

// Saves the capability answers for one category and keeps each Branch's service-line list in step with the chosen coverage.
export async function saveServiceLine(providerUserId: string, category: string, input: SaveServiceLineInput, scope?: BranchScope) {
  const key = category.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!key || key.length > 60) throw new BadRequestError("Choose a service category.");
  const profile = await prisma.providerProfile.findUnique({ where: { userId: providerUserId }, select: { id: true } });
  if (!profile) throw new BadRequestError("Complete your Provider profile before adding service lines.");
  if (input.managerUserId !== undefined && input.managerUserId !== null) await assertManager(providerUserId, input.managerUserId);

  const branches = await prisma.providerBranch.findMany({ where: { providerUserId }, select: { id: true, serviceLines: true } });
  const covered = new Set(input.branchIds ?? []);
  for (const id of covered) {
    if (!branches.some((b) => b.id === id)) throw new BadRequestError("Choose Branches of your organisation.");
    assertBranchInScope(scope, id);
  }
  const label = key;
  await prisma.$transaction([
    ...(input.branchIds
      ? branches.map((b) => {
          const has = b.serviceLines.some((l) => l.trim().toUpperCase().replace(/[\s-]+/g, "_") === key);
          const lines = covered.has(b.id) ? (has ? b.serviceLines : [...b.serviceLines, label]) : b.serviceLines.filter((l) => l.trim().toUpperCase().replace(/[\s-]+/g, "_") !== key);
          return prisma.providerBranch.update({ where: { id: b.id }, data: { serviceLines: lines } });
        })
      : []),
  ]);
  const all = await listServiceLines(providerUserId);
  all[key] = {
    capabilityLimits: input.capabilityLimits, competencies: input.competencies ?? [], branchIds: input.branchIds ?? all[key]?.branchIds ?? [],
    managerUserId: input.managerUserId ?? null, updatedAt: new Date().toISOString(),
  };
  await prisma.providerProfile.update({ where: { userId: providerUserId }, data: { serviceLineDetails: all as unknown as Prisma.InputJsonValue } });
  return { category: key, ...all[key] };
}
