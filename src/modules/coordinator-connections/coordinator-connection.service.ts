import { prisma } from "../../lib/prisma";
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
} from "../../lib/errors";
import { notify } from "../../lib/notify";
import type { UserRole, CoordinatorInitiator } from "@prisma/client";
import type {
  CreateCoordinatorConnectionInput,
  RespondCoordinatorConnectionInput,
  UpdateCoordinatorConnectionPermissionsInput,
} from "../../validators/coordinator-connection.schema";

const INCLUDE = {
  coordinator: { select: { id: true, name: true } },
  participant: { select: { id: true, name: true } },
} as const;

// ─── Either side sends a connection request ───────────────────────────────────
// A Coordinator sending to a participant they know, or a Participant sending an
// enquiry from a coordinator's public profile — same table, same PENDING state.
// This IS the coordinator's "enquiries inbox" (list filtered to PENDING, below).

export async function createConnection(
  userId: string,
  activeRole: UserRole,
  input: CreateCoordinatorConnectionInput,
) {
  if (!["COORDINATOR", "PARTICIPANT"].includes(activeRole)) {
    throw new ForbiddenError("Only coordinators and participants can send connection requests");
  }
  if (userId === input.targetUserId) {
    throw new BadRequestError("You can't connect with yourself");
  }

  const target = await prisma.user.findUnique({
    where:   { id: input.targetUserId },
    include: { roles: true },
  });
  const expectedTargetRole = activeRole === "COORDINATOR" ? "PARTICIPANT" : "COORDINATOR";
  if (!target || !target.roles.some((r) => r.role === expectedTargetRole)) {
    throw new NotFoundError(`${expectedTargetRole === "PARTICIPANT" ? "Participant" : "Coordinator"} not found`);
  }

  const initiator: CoordinatorInitiator = activeRole as CoordinatorInitiator;
  const coordinatorUserId = activeRole === "COORDINATOR" ? userId : input.targetUserId;
  const participantUserId = activeRole === "COORDINATOR" ? input.targetUserId : userId;

  const existing = await prisma.coordinatorParticipantConnection.findUnique({
    where: { coordinatorUserId_participantUserId: { coordinatorUserId, participantUserId } },
  });
  if (existing) {
    if (existing.status === "PENDING") throw new ConflictError("A connection request is already pending");
    if (existing.status === "ACCEPTED") throw new ConflictError("You're already connected");
    // Previously declined — allow a fresh request by resetting to PENDING.
    const reopened = await prisma.coordinatorParticipantConnection.update({
      where: { id: existing.id },
      data:  { status: "PENDING", initiatedBy: initiator, message: input.message },
      include: INCLUDE,
    });
    notifyNewRequest(reopened, activeRole);
    return reopened;
  }

  const created = await prisma.coordinatorParticipantConnection.create({
    data: {
      coordinatorUserId,
      participantUserId,
      initiatedBy: initiator,
      message:     input.message,
      status:      "PENDING",
    },
    include: INCLUDE,
  });
  notifyNewRequest(created, activeRole);
  return created;
}

function notifyNewRequest(
  conn: { id: string; coordinatorUserId: string; participantUserId: string; coordinator: { name: string }; participant: { name: string } },
  initiatedBy: UserRole,
) {
  const recipientId = initiatedBy === "COORDINATOR" ? conn.participantUserId : conn.coordinatorUserId;
  const senderName = initiatedBy === "COORDINATOR" ? conn.coordinator.name : conn.participant.name;
  void notify.sendPushNotification(
    recipientId,
    "New connection request",
    `${senderName} wants to connect with you.`,
    { connectionId: conn.id },
    initiatedBy === "COORDINATOR" ? "COORDINATOR_CONNECTION_REQUEST" : "COORDINATOR_ENQUIRY_RECEIVED",
  );
}

// ─── List connections for the current user ────────────────────────────────────

export async function listConnections(userId: string, activeRole: UserRole) {
  const where = activeRole === "COORDINATOR"
    ? { coordinatorUserId: userId }
    : { participantUserId: userId };

  return prisma.coordinatorParticipantConnection.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: INCLUDE,
  });
}

// ─── Recipient accepts or declines ─────────────────────────────────────────────

export async function respondToConnection(
  connectionId: string,
  userId: string,
  activeRole: UserRole,
  input: RespondCoordinatorConnectionInput,
) {
  const conn = await prisma.coordinatorParticipantConnection.findUnique({ where: { id: connectionId } });
  if (!conn) throw new NotFoundError("Connection request not found");

  // The recipient is whichever side did NOT initiate.
  const recipientId = conn.initiatedBy === "COORDINATOR" ? conn.participantUserId : conn.coordinatorUserId;
  if (recipientId !== userId) throw new ForbiddenError("You are not the recipient of this request");
  if (conn.status !== "PENDING") throw new BadRequestError("Request is already " + conn.status.toLowerCase());

  const newStatus = input.action === "ACCEPT" ? "ACCEPTED" : "DECLINED";
  const updated = await prisma.coordinatorParticipantConnection.update({
    where: { id: connectionId },
    data:  { status: newStatus },
    include: INCLUDE,
  });

  const senderId = conn.initiatedBy === "COORDINATOR" ? conn.coordinatorUserId : conn.participantUserId;
  const recipientName = conn.initiatedBy === "COORDINATOR" ? updated.participant.name : updated.coordinator.name;
  void notify.sendPushNotification(
    senderId,
    "Connection request update",
    input.action === "ACCEPT"
      ? `${recipientName} accepted your connection request.`
      : `${recipientName} declined your connection request.`,
    { connectionId: updated.id },
    conn.initiatedBy === "COORDINATOR" ? "COORDINATOR_ENQUIRY_RESPONDED" : "COORDINATOR_CONNECTION_ACCEPTED",
  );

  return updated;
}

// ─── Participant adjusts granular permissions on an accepted connection ───────

export async function updatePermissions(
  connectionId: string,
  participantUserId: string,
  input: UpdateCoordinatorConnectionPermissionsInput,
) {
  const conn = await prisma.coordinatorParticipantConnection.findUnique({ where: { id: connectionId } });
  if (!conn) throw new NotFoundError("Connection not found");
  if (conn.participantUserId !== participantUserId) {
    throw new ForbiddenError("Only the participant can manage permissions on this connection");
  }
  if (conn.status !== "ACCEPTED") throw new BadRequestError("Connection isn't active yet");

  return prisma.coordinatorParticipantConnection.update({
    where: { id: connectionId },
    data:  input,
    include: INCLUDE,
  });
}

// ─── Permission check helper — used elsewhere (job posting on a participant's
// behalf, etc.) to confirm a coordinator still has an accepted, permitted link
// to a given INDEPENDENT (non-MANAGED) participant. Managed participants
// (created via linking.service) are governed by parentUserId instead, not this.

export async function assertCoordinatorPermission(
  coordinatorUserId: string,
  participantUserId: string,
  permission: keyof Pick<
    UpdateCoordinatorConnectionPermissionsInput,
    "canViewInfo" | "canPostRequests" | "canShortlist" | "canMessage" | "canConfirmBookings" | "canManageReplacements"
  >,
): Promise<void> {
  const conn = await prisma.coordinatorParticipantConnection.findUnique({
    where: { coordinatorUserId_participantUserId: { coordinatorUserId, participantUserId } },
  });
  if (!conn || conn.status !== "ACCEPTED" || !conn[permission]) {
    throw new ForbiddenError("This participant hasn't granted you that permission");
  }
}
