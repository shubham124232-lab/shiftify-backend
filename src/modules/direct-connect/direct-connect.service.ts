import { randomUUID } from "crypto";
import { prisma } from "../../lib/prisma";
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
} from "../../lib/errors";
import { notify } from "../../lib/notify";
import type { UserRole } from "@prisma/client";
import type {
  CreateDirectConnectInput,
  RespondDirectConnectInput,
} from "../../validators/direct-connect.schema";

const DIRECT_CONNECT_FEE_AUD = 9.99;

// ─── Provider sends a Direct Connect invite to a worker ───────────────────────
// No charge on send — Pricing Spec V2: $9.99 is only taken if the worker accepts.

export async function createDirectConnect(
  providerUserId: string,
  activeRole: UserRole,
  input: CreateDirectConnectInput,
) {
  if (activeRole !== "PROVIDER") {
    throw new ForbiddenError("Only providers can send Direct Connect invites");
  }

  const worker = await prisma.user.findUnique({
    where:   { id: input.workerUserId },
    include: { roles: true },
  });
  if (!worker || !worker.roles.some((r) => r.role === "SUPPORT_WORKER")) {
    throw new NotFoundError("Support worker not found");
  }

  const existing = await prisma.directConnectRequest.findFirst({
    where: { providerUserId, workerUserId: input.workerUserId, status: "PENDING" },
  });
  if (existing) {
    throw new ConflictError("A Direct Connect invite to this worker is already pending");
  }

  const request = await prisma.directConnectRequest.create({
    data: {
      providerUserId,
      workerUserId: input.workerUserId,
      message:      input.message,
      status:       "PENDING",
    },
    include: {
      provider: { select: { id: true, name: true } },
      worker:   { select: { id: true, name: true } },
    },
  });

  void notify.sendPushNotification(
    input.workerUserId,
    "Direct Connect invite",
    `${request.provider.name} wants to connect with you directly.`,
    { directConnectRequestId: request.id },
    "DIRECT_CONNECT_REQUEST",
  );

  return request;
}

// ─── List Direct Connect requests for the current user ────────────────────────

export async function listDirectConnects(userId: string, activeRole: UserRole) {
  const where = activeRole === "PROVIDER"
    ? { providerUserId: userId }
    : { workerUserId: userId };

  return prisma.directConnectRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      provider: { select: { id: true, name: true } },
      worker:   { select: { id: true, name: true } },
    },
  });
}

// ─── Worker accepts or declines ────────────────────────────────────────────────

export async function respondToDirectConnect(
  requestId: string,
  workerUserId: string,
  input: RespondDirectConnectInput,
) {
  const request = await prisma.directConnectRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new NotFoundError("Direct Connect invite not found");
  if (request.workerUserId !== workerUserId) {
    throw new ForbiddenError("You are not the recipient of this invite");
  }
  if (request.status !== "PENDING") {
    throw new BadRequestError("Invite is already " + request.status.toLowerCase());
  }

  const newStatus = input.action === "ACCEPT" ? "ACCEPTED" : "DECLINED";
  const mockReceiptRef = input.action === "ACCEPT" ? `DEV-${randomUUID().toUpperCase()}` : null;

  const updated = await prisma.directConnectRequest.update({
    where: { id: requestId },
    data:  { status: newStatus, mockReceiptRef },
    include: {
      provider: { select: { id: true, name: true } },
      worker:   { select: { id: true, name: true } },
    },
  });

  const providerBody = input.action === "ACCEPT"
    ? `${updated.worker.name} accepted your Direct Connect invite. $${DIRECT_CONNECT_FEE_AUD.toFixed(2)} charged.`
    : `${updated.worker.name} declined your Direct Connect invite.`;

  void notify.sendPushNotification(
    request.providerUserId,
    "Direct Connect update",
    providerBody,
    { directConnectRequestId: updated.id },
    "DIRECT_CONNECT_RESPONDED",
  );

  return updated;
}
