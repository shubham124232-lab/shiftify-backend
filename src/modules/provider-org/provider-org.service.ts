// Provider organisation model (Pricing V2 §4/§4.4/§5) — Branches, Administrators
// (existing platform users who help manage the org), and Team Members (a
// Provider-internal roster entry with passwordless mobile verification, not a
// full independent User account). Capacity per tier is enforced Provider-wide
// via the active org-tier Plan's maxAdministrators/maxTeamMembers/maxBranches.

import crypto from "node:crypto";
import { prisma } from "../../lib/prisma";
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

export async function listBranches(providerUserId: string) {
  const branches = await prisma.providerBranch.findMany({
    where: { providerUserId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { administrators: true, teamMembers: true } } },
  });
  const names = await managerNames(providerUserId, branches.map((b) => b.managerUserId));
  return branches.map((b) => ({ ...b, managerName: b.managerUserId ? names.get(b.managerUserId) ?? null : null }));
}

// One Branch with its people — the "Open workspace" view.
export async function getBranch(providerUserId: string, branchId: string) {
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

export async function updateBranch(providerUserId: string, branchId: string, input: UpdateBranchInput) {
  const branch = await prisma.providerBranch.findUnique({ where: { id: branchId } });
  if (!branch || branch.providerUserId !== providerUserId) throw new NotFoundError("Branch not found");
  if (input.managerUserId !== undefined) await assertManager(providerUserId, input.managerUserId);
  return prisma.providerBranch.update({ where: { id: branchId }, data: input });
}

export async function deleteBranch(providerUserId: string, branchId: string) {
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

export async function createAdministrator(providerUserId: string, input: CreateAdministratorInput) {
  const caps = await requireCaps(providerUserId);

  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (!user) throw new NotFoundError("No Shiftify account exists with that email yet — ask them to sign up first.");
  if (user.id === providerUserId) throw new BadRequestError("You are already the owner of this organisation.");

  const existing = await prisma.providerAdministrator.findUnique({
    where: { providerUserId_userId: { providerUserId, userId: user.id } },
  });
  if (existing) throw new ConflictError("This person is already an Administrator on your organisation.");

  if (caps.maxAdministrators != null) {
    const count = await prisma.providerAdministrator.count({ where: { providerUserId } });
    if (count >= caps.maxAdministrators) {
      throw new ApiError(
        403,
        "SUBSCRIPTION_LIMIT",
        `Your ${planLabel(caps.planKey)} plan allows up to ${caps.maxAdministrators} Administrators. Upgrade to add more.`,
      );
    }
  }

  let branchIds = input.branchIds ?? [];
  if (branchIds.length > 0) {
    const owned = await prisma.providerBranch.count({ where: { id: { in: branchIds }, providerUserId } });
    if (owned !== branchIds.length) throw new BadRequestError("One or more Branches do not belong to your organisation.");
  }

  return prisma.providerAdministrator.create({
    data: {
      providerUserId,
      userId: user.id,
      ...(input.rolePreset ? { rolePreset: input.rolePreset } : {}),
      ...(input.billingAccess !== undefined ? { billingAccess: input.billingAccess } : {}),
      branches: branchIds.length > 0 ? { connect: branchIds.map((id) => ({ id })) } : undefined,
    },
    include: { user: { select: { id: true, name: true, email: true } }, branches: { select: { id: true, name: true } } },
  });
}

export async function listAdministrators(providerUserId: string) {
  return prisma.providerAdministrator.findMany({
    where: { providerUserId },
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

export async function createTeamMember(providerUserId: string, input: CreateTeamMemberInput) {
  const caps = await requireCaps(providerUserId);

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
        accessLevel: input.accessLevel ?? null, profileVisibility: input.profileVisibility ?? null,
      },
    });
    const _dev_code = await sendVerificationSms(restored.id, providerUserId);
    return { ...restored, _dev_code };
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
      accessLevel: input.accessLevel ?? null,
      profileVisibility: input.profileVisibility ?? null,
      consentAcknowledgedAt: new Date(),
    },
  });

  const _dev_code = await sendVerificationSms(teamMember.id, providerUserId);
  return { ...teamMember, _dev_code };
}

export async function listTeamMembers(providerUserId: string) {
  return prisma.providerTeamMember.findMany({
    where: { providerUserId, removedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, name: true, mobile: true, skills: true, inviteStatus: true,
      email: true, relationshipType: true, locations: true, accessLevel: true, profileVisibility: true,
      mobileVerifiedAt: true, claimedByUserId: true, createdAt: true,
      branch: { select: { id: true, name: true } },
    },
  });
}

export async function updateTeamMember(providerUserId: string, teamMemberId: string, input: UpdateTeamMemberInput) {
  const member = await prisma.providerTeamMember.findUnique({ where: { id: teamMemberId } });
  if (!member || member.providerUserId !== providerUserId || member.removedAt) throw new NotFoundError("Team Member not found");
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
      email: true, relationshipType: true, locations: true, accessLevel: true, profileVisibility: true,
      mobileVerifiedAt: true, claimedByUserId: true, createdAt: true,
      branch: { select: { id: true, name: true } },
    },
  });
}

export async function removeTeamMember(providerUserId: string, teamMemberId: string) {
  const member = await prisma.providerTeamMember.findUnique({ where: { id: teamMemberId } });
  if (!member || member.providerUserId !== providerUserId || member.removedAt) throw new NotFoundError("Team Member not found");
  // Soft-remove: the row stays so the person still counts toward this period's capacity.
  await prisma.providerTeamMember.update({ where: { id: teamMemberId }, data: { removedAt: new Date() } });
}

// Re-sends the mobile verification code (e.g. the first one expired).
export async function resendTeamMemberVerification(providerUserId: string, teamMemberId: string) {
  const member = await prisma.providerTeamMember.findUnique({ where: { id: teamMemberId } });
  if (!member || member.providerUserId !== providerUserId) throw new NotFoundError("Team Member not found");
  if (member.inviteStatus === "VERIFIED") throw new ConflictError("This Team Member is already verified.");
  const _dev_code = await sendVerificationSms(teamMemberId, providerUserId);
  return { _dev_code };
}

async function sendVerificationSms(teamMemberId: string, providerUserId: string): Promise<string | undefined> {
  const member = await prisma.providerTeamMember.findUnique({ where: { id: teamMemberId } });
  if (!member || member.providerUserId !== providerUserId) throw new NotFoundError("Team Member not found");

  const code = generateCode();
  await prisma.providerTeamMember.update({
    where: { id: teamMemberId },
    data: {
      verificationCodeHash: hashCode(code),
      verificationCodeExpiresAt: new Date(Date.now() + VERIFICATION_TTL_MINUTES * 60 * 1_000),
    },
  });

  await notify.sendSms(
    member.mobile,
    `[Shiftify] You've been added as a Team Member. Your verification code is ${code}. Valid ${VERIFICATION_TTL_MINUTES} minutes.`,
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
    prisma.providerAdministrator.count({ where: { providerUserId } }),
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
