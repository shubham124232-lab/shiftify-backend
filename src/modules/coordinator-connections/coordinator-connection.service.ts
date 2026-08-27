import { Prisma } from "@prisma/client";
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
  RespondPostingApprovalInput,
  RequestPermissionsInput,
  RespondPermissionRequestInput,
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

// ─── SC-C04 — sender manages a still-PENDING request they sent ────────────────

export async function resendConnection(connectionId: string, userId: string) {
  const conn = await prisma.coordinatorParticipantConnection.findUnique({
    where: { id: connectionId },
    include: INCLUDE,
  });
  if (!conn) throw new NotFoundError("Connection request not found");
  const senderId = conn.initiatedBy === "COORDINATOR" ? conn.coordinatorUserId : conn.participantUserId;
  if (senderId !== userId) throw new ForbiddenError("You didn't send this request");
  if (conn.status !== "PENDING") throw new BadRequestError("This request isn't pending anymore");

  notifyNewRequest(conn, conn.initiatedBy);
  return conn;
}

export async function cancelConnection(connectionId: string, userId: string) {
  const conn = await prisma.coordinatorParticipantConnection.findUnique({ where: { id: connectionId } });
  if (!conn) throw new NotFoundError("Connection request not found");
  const senderId = conn.initiatedBy === "COORDINATOR" ? conn.coordinatorUserId : conn.participantUserId;
  if (senderId !== userId) throw new ForbiddenError("You didn't send this request");
  if (conn.status !== "PENDING") throw new BadRequestError("This request isn't pending anymore");

  return prisma.coordinatorParticipantConnection.update({
    where: { id: connectionId },
    data:  { status: "CANCELLED" },
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

// ─── SC-P01 — coordinator asks the participant to approve this specific ───────
// posting instead of self-certifying. Does not touch canPostRequests.

export async function requestPostingApproval(coordinatorUserId: string, participantUserId: string) {
  const conn = await prisma.coordinatorParticipantConnection.findUnique({
    where: { coordinatorUserId_participantUserId: { coordinatorUserId, participantUserId } },
    include: INCLUDE,
  });
  if (!conn || conn.status !== "ACCEPTED") {
    throw new ForbiddenError("You're not connected to this participant");
  }

  const updated = await prisma.coordinatorParticipantConnection.update({
    where: { id: conn.id },
    data: {
      postingApprovalStatus:      "PENDING",
      postingApprovalRequestedAt: new Date(),
      postingApprovalRespondedAt: null,
    },
    include: INCLUDE,
  });

  void notify.sendPushNotification(
    participantUserId,
    "Approval needed",
    `${updated.coordinator.name} wants to post a support request on your behalf and is asking for your approval.`,
    { connectionId: updated.id },
    "COORDINATOR_POSTING_APPROVAL_REQUEST",
  );

  return updated;
}

export async function respondToPostingApproval(
  connectionId: string,
  participantUserId: string,
  input: RespondPostingApprovalInput,
) {
  const conn = await prisma.coordinatorParticipantConnection.findUnique({ where: { id: connectionId } });
  if (!conn) throw new NotFoundError("Connection not found");
  if (conn.participantUserId !== participantUserId) {
    throw new ForbiddenError("Only the participant can respond to this approval request");
  }
  if (conn.postingApprovalStatus !== "PENDING") {
    throw new BadRequestError("There's no pending approval request on this connection");
  }

  const updated = await prisma.coordinatorParticipantConnection.update({
    where: { id: connectionId },
    data: {
      postingApprovalStatus:      input.action === "APPROVE" ? "APPROVED" : "DECLINED",
      postingApprovalRespondedAt: new Date(),
    },
    include: INCLUDE,
  });

  void notify.sendPushNotification(
    conn.coordinatorUserId,
    "Approval update",
    input.action === "APPROVE"
      ? `${updated.participant.name} approved your request to post on their behalf.`
      : `${updated.participant.name} declined your request to post on their behalf.`,
    { connectionId: updated.id },
    "COORDINATOR_POSTING_APPROVAL_RESPONDED",
  );

  return updated;
}

// ─── SC-PT04 — coordinator requests permissions they don't already have ───────

export async function requestPermissions(
  coordinatorUserId: string,
  input: RequestPermissionsInput,
) {
  const conn = await prisma.coordinatorParticipantConnection.findUnique({
    where: { coordinatorUserId_participantUserId: { coordinatorUserId, participantUserId: input.participantUserId } },
    include: INCLUDE,
  });
  if (!conn || conn.status !== "ACCEPTED") {
    throw new ForbiddenError("You're not connected to this participant");
  }

  const updated = await prisma.coordinatorParticipantConnection.update({
    where: { id: conn.id },
    data: {
      permissionRequestPending: true,
      requestedPermissions:     input.requested,
      permissionRequestedAt:    new Date(),
    },
    include: INCLUDE,
  });

  void notify.sendPushNotification(
    input.participantUserId,
    "Permission request",
    `${updated.coordinator.name} is requesting additional access to manage your support requests.`,
    { connectionId: updated.id },
    "COORDINATOR_POSTING_APPROVAL_REQUEST",
  );

  return updated;
}

export async function respondToPermissionRequest(
  connectionId: string,
  participantUserId: string,
  input: RespondPermissionRequestInput,
) {
  const conn = await prisma.coordinatorParticipantConnection.findUnique({ where: { id: connectionId } });
  if (!conn) throw new NotFoundError("Connection not found");
  if (conn.participantUserId !== participantUserId) {
    throw new ForbiddenError("Only the participant can respond to this request");
  }
  if (!conn.permissionRequestPending) {
    throw new BadRequestError("There's no pending permission request on this connection");
  }

  const grant = input.action === "APPROVE" ? (conn.requestedPermissions as Record<string, boolean> | null ?? {}) : {};

  const updated = await prisma.coordinatorParticipantConnection.update({
    where: { id: connectionId },
    data: {
      ...grant,
      permissionRequestPending: false,
      requestedPermissions:     Prisma.JsonNull,
    },
    include: INCLUDE,
  });

  void notify.sendPushNotification(
    conn.coordinatorUserId,
    "Permission request update",
    input.action === "APPROVE"
      ? `${updated.participant.name} approved your permission request.`
      : `${updated.participant.name} declined your permission request.`,
    { connectionId: updated.id },
    "COORDINATOR_POSTING_APPROVAL_RESPONDED",
  );

  return updated;
}

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
