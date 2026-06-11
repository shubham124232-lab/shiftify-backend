// Linking service — Provider/Coordinator create MANAGED sub-accounts.
//
// A MANAGED account:
//   • Has username + password only (no email, no phone, no OTP).
//   • accountType = MANAGED; parentUserId = creator's user id.
//   • Starts as PENDING (Admin can bulk-approve; avoids bypassing review).
//   • Holds exactly one role (SUPPORT_WORKER or PARTICIPANT).

import { prisma } from "../../lib/prisma";
import { hashPassword } from "../../lib/hash";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors";
import * as profileService from "../profiles/profile.service";
import * as documentService from "../documents/document.service";
import type { WorkerProfileInput } from "../../validators/profile-worker.schema";
import type { ParticipantProfileInput } from "../../validators/profile-participant.schema";
import type { UploadDocumentInput } from "../../validators/document.schema";
import type { UserRole, UserStatus } from "@prisma/client";

// Mandatory pieces of a managed worker's onboarding — mirrors the self-registration
// requirements. A DRAFT worker can only be activated once all of these are present.
const REQUIRED_WORKER_DOCS = ["POLICE_CHECK", "NDIS_SCREENING", "WWCC", "FIRST_AID"] as const;

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
  status?: UserStatus;
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
      status: input.status ?? "ACTIVE",
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

// POST /linking/workers — Provider creates a MANAGED SUPPORT_WORKER as a DRAFT.
// The provider completes the profile, availability, service area and compliance
// documents afterwards against this draft (each step persists independently —
// no partial-creation rollback needed). The worker only becomes visible for job
// matching once explicitly activated via activateWorker.
export async function createWorker(input: {
  parentUserId: string;
  username: string;
  password: string;
  name: string;
}): Promise<ManagedAccountResult> {
  return createManagedAccount({ ...input, role: "SUPPORT_WORKER", status: "DRAFT" });
}

export interface WorkerOnboardingStatus {
  isComplete: boolean;
  missing: string[];
}

// Server-side completeness check — the authoritative gate for activation.
// Mirrors the client-side checklist but must never trust client state.
async function checkWorkerOnboarding(workerId: string): Promise<WorkerOnboardingStatus> {
  const worker = await prisma.user.findUnique({
    where: { id: workerId },
    include: {
      workerProfile: { include: { availability: true } },
      documents:     { select: { docType: true } },
    },
  });
  if (!worker) throw new NotFoundError("Worker not found");

  const wp = worker.workerProfile;
  const missing: string[] = [];

  if (!wp || !Array.isArray(wp.servicesOffered) || wp.servicesOffered.length === 0) {
    missing.push("Services offered");
  }
  if (!wp?.experienceLevel) missing.push("Experience level");
  // Required by the marketplace gate — activation must not pass while browsing would still be blocked.
  if (!wp?.rightToWork) missing.push("Right to work");
  if (!wp || wp.availability.length === 0) missing.push("Availability");
  if (!wp || !Array.isArray(wp.serviceAreas) || wp.serviceAreas.length === 0) {
    missing.push("Service areas");
  }
  if (wp?.travelRadiusKm == null) missing.push("Travel radius");

  const uploadedTypes = new Set(worker.documents.map((d) => d.docType));
  for (const docType of REQUIRED_WORKER_DOCS) {
    if (!uploadedTypes.has(docType)) missing.push(`${docType.replace(/_/g, " ")} document`);
  }

  return { isComplete: missing.length === 0, missing };
}

// GET /linking/workers/:id/onboarding-status — completeness check for a draft worker.
export async function getWorkerOnboardingStatus(input: {
  parentUserId: string;
  workerId: string;
}): Promise<WorkerOnboardingStatus> {
  const target = await prisma.user.findUnique({ where: { id: input.workerId } });
  if (!target || target.parentUserId !== input.parentUserId) {
    throw new NotFoundError("Worker not found");
  }
  return checkWorkerOnboarding(input.workerId);
}

// POST /linking/workers/:id/activate — flips a DRAFT worker to ACTIVE.
// Re-validates completeness server-side regardless of what the client believes —
// defense in depth against stale or tampered client state.
export async function activateWorker(input: {
  parentUserId: string;
  workerId: string;
}): Promise<ManagedAccountResult> {
  const target = await prisma.user.findUnique({
    where: { id: input.workerId },
    include: { roles: { select: { role: true } } },
  });
  if (!target || target.parentUserId !== input.parentUserId || !target.roles.some((r) => r.role === "SUPPORT_WORKER")) {
    throw new NotFoundError("Worker not found");
  }
  if (target.status !== "DRAFT") {
    throw new ConflictError("This worker has already been activated.");
  }

  const onboarding = await checkWorkerOnboarding(input.workerId);
  if (!onboarding.isComplete) {
    throw new ValidationError("Worker setup is incomplete", onboarding.missing.map((m) => ({ path: m, message: `${m} is required` })));
  }

  const user = await prisma.user.update({
    where: { id: input.workerId },
    data: { status: "ACTIVE" },
    include: { roles: { select: { role: true } } },
  });

  return {
    id: user.id,
    username: user.username!,
    name: user.name,
    accountType: user.accountType,
    status: user.status,
    roles: user.roles.map((r) => r.role),
    parentUserId: user.parentUserId!,
  };
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

// ── Parent-managed onboarding ──────────────────────────────────────────────
// The creating Provider/Coordinator fills the profile and uploads documents on
// behalf of their MANAGED sub-accounts — the sub-account itself is blocked from
// the self-service routes (see blockManagedSelfService middleware).

// Ownership guard shared by all parent-managed operations.
async function assertManagedChild(
  parentUserId: string,
  targetId: string,
  expectedRole: UserRole,
): Promise<void> {
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    include: { roles: { select: { role: true } } },
  });
  if (
    !target ||
    target.parentUserId !== parentUserId ||
    target.accountType !== "MANAGED" ||
    !target.roles.some((r) => r.role === expectedRole)
  ) {
    throw new NotFoundError("Managed account not found");
  }
}

// POST /linking/workers/:id/profile — Provider upserts the managed worker's profile.
export async function upsertManagedWorkerProfile(input: {
  parentUserId: string;
  workerId: string;
  data: WorkerProfileInput;
}) {
  await assertManagedChild(input.parentUserId, input.workerId, "SUPPORT_WORKER");
  return profileService.upsertWorkerProfile(input.workerId, input.data);
}

// POST /linking/workers/:id/documents — Provider uploads a compliance document
// for the managed worker. The document row belongs to the worker.
export async function uploadManagedWorkerDocument(input: {
  parentUserId: string;
  workerId: string;
  file: Express.Multer.File;
  data: UploadDocumentInput;
}) {
  await assertManagedChild(input.parentUserId, input.workerId, "SUPPORT_WORKER");
  return documentService.uploadDocument(input.workerId, input.file, input.data);
}

// GET /linking/workers/:id/documents
export async function listManagedWorkerDocuments(input: {
  parentUserId: string;
  workerId: string;
}) {
  await assertManagedChild(input.parentUserId, input.workerId, "SUPPORT_WORKER");
  return documentService.listDocuments(input.workerId);
}

// DELETE /linking/workers/:id/documents/:docId
export async function deleteManagedWorkerDocument(input: {
  parentUserId: string;
  workerId: string;
  documentId: string;
}): Promise<void> {
  await assertManagedChild(input.parentUserId, input.workerId, "SUPPORT_WORKER");
  await documentService.deleteDocument(input.workerId, input.documentId);
}

// POST /linking/participants/:id/profile — Coordinator upserts the managed
// participant's profile.
export async function upsertManagedParticipantProfile(input: {
  parentUserId: string;
  participantId: string;
  data: ParticipantProfileInput;
}) {
  await assertManagedChild(input.parentUserId, input.participantId, "PARTICIPANT");
  return profileService.upsertParticipantProfile(input.participantId, input.data);
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
