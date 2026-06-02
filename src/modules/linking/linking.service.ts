// Linking service — Provider/Coordinator create MANAGED sub-accounts.
//
// A MANAGED account:
//   • Has username + password only (no email, no phone, no OTP).
//   • accountType = MANAGED; parentUserId = creator's user id.
//   • Starts as PENDING (Admin can bulk-approve; avoids bypassing review).
//   • Holds exactly one role (SUPPORT_WORKER or PARTICIPANT).

import { prisma } from "../../lib/prisma";
import { hashPassword } from "../../lib/hash";
import { ConflictError, ForbiddenError, NotFoundError } from "../../lib/errors";
import type { UserRole } from "@prisma/client";

export interface ManagedAccountResult {
  id: string;
  username: string;
  name: string;
  accountType: string;
  status: string;
  roles: UserRole[];
  parentUserId: string;
}

// Generic creator. Called by the two public wrappers below.
async function createManagedAccount(input: {
  parentUserId: string;
  username: string;
  password: string;
  name: string;
  role: UserRole;
}): Promise<ManagedAccountResult> {
  if (await prisma.user.findUnique({ where: { username: input.username } })) {
    throw new ConflictError("That username is already taken.");
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

  return {
    id: user.id,
    username: user.username!,
    name: user.name,
    accountType: user.accountType,
    status: user.status,
    roles: [input.role],
    parentUserId: input.parentUserId,
  };
}

// POST /linking/workers — Provider creates a MANAGED SUPPORT_WORKER.
export async function createWorker(input: {
  parentUserId: string;
  username: string;
  password: string;
  name: string;
}): Promise<ManagedAccountResult> {
  return createManagedAccount({ ...input, role: "SUPPORT_WORKER" });
}

// POST /linking/participants — Coordinator creates a MANAGED PARTICIPANT.
export async function createParticipant(input: {
  parentUserId: string;
  username: string;
  password: string;
  name: string;
}): Promise<ManagedAccountResult> {
  return createManagedAccount({ ...input, role: "PARTICIPANT" });
}

// GET /linking/workers — list MANAGED SUPPORT_WORKERs created by this Provider.
export async function listWorkers(parentUserId: string): Promise<ManagedAccountResult[]> {
  const users = await prisma.user.findMany({
    where: {
      parentUserId,
      accountType: "MANAGED",
      roles: { some: { role: "SUPPORT_WORKER" } },
    },
    include: { roles: { select: { role: true } } },
    orderBy: { createdAt: "asc" },
  });

  return users.map((u) => ({
    id: u.id,
    username: u.username!,
    name: u.name,
    accountType: u.accountType,
    status: u.status,
    roles: u.roles.map((r) => r.role),
    parentUserId: u.parentUserId!,
  }));
}

// Generic unlink. Called by the two public wrappers below.
// Does NOT delete — sets parentUserId null + SUSPENDED so data is kept.
async function unlinkManagedAccount(input: {
  callerId: string;       // must be the parentUserId OR an admin
  callerIsAdmin: boolean;
  targetId: string;
  expectedRole: UserRole;
  auditAdminId: string;
}): Promise<void> {
  const target = await prisma.user.findUnique({
    where: { id: input.targetId },
    include: { roles: { select: { role: true } } },
  });
  if (!target) throw new NotFoundError("Managed account not found");
  if (!target.roles.some((r) => r.role === input.expectedRole)) {
    throw new NotFoundError("Managed account not found");
  }
  // Caller must be the account's parent OR an admin.
  if (!input.callerIsAdmin && target.parentUserId !== input.callerId) {
    throw new ForbiddenError("You are not the parent of this account");
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: input.targetId },
      data: { parentUserId: null, status: "SUSPENDED" },
    }),
    prisma.auditLog.create({
      data: {
        adminUserId: input.auditAdminId,
        action: "USER_SUSPENDED",
        targetUserId: input.targetId,
        reason: "Unlinked by parent",
      },
    }),
  ]);
}

// DELETE /linking/workers/:id
export async function unlinkWorker(input: {
  callerId: string;
  callerIsAdmin: boolean;
  workerId: string;
}): Promise<void> {
  return unlinkManagedAccount({
    callerId: input.callerId,
    callerIsAdmin: input.callerIsAdmin,
    targetId: input.workerId,
    expectedRole: "SUPPORT_WORKER",
    auditAdminId: input.callerId,
  });
}

// DELETE /linking/participants/:id
export async function unlinkParticipant(input: {
  callerId: string;
  callerIsAdmin: boolean;
  participantId: string;
}): Promise<void> {
  return unlinkManagedAccount({
    callerId: input.callerId,
    callerIsAdmin: input.callerIsAdmin,
    targetId: input.participantId,
    expectedRole: "PARTICIPANT",
    auditAdminId: input.callerId,
  });
}

// GET /linking/participants — list MANAGED PARTICIPANTs created by this Coordinator.
export async function listParticipants(parentUserId: string): Promise<ManagedAccountResult[]> {
  const users = await prisma.user.findMany({
    where: {
      parentUserId,
      accountType: "MANAGED",
      roles: { some: { role: "PARTICIPANT" } },
    },
    include: { roles: { select: { role: true } } },
    orderBy: { createdAt: "asc" },
  });

  return users.map((u) => ({
    id: u.id,
    username: u.username!,
    name: u.name,
    accountType: u.accountType,
    status: u.status,
    roles: u.roles.map((r) => r.role),
    parentUserId: u.parentUserId!,
  }));
}
