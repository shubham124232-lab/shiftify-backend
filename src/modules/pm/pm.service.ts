import { prisma } from "../../lib/prisma";
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
} from "../../lib/errors";
import type { UserRole } from "@prisma/client";
import type {
  CreatePmConnectionInput,
  RespondPmConnectionInput,
} from "../../validators/pm.schema";

// ─── Request a PM connection ──────────────────────────────────────────────────
// Either side can initiate:
//   - Client (participant/worker/provider) → supplies planManagerUserId
//   - Plan Manager → supplies clientUserId via route or body

export async function createConnection(
  initiatorId: string,
  activeRole: UserRole,
  input: CreatePmConnectionInput,
) {
  // Determine who is the PM and who is the client
  let planManagerUserId: string;
  let clientUserId: string;
  let initiatedBy: "CLIENT" | "PLAN_MANAGER";

  if (activeRole === "PLAN_MANAGER") {
    planManagerUserId = initiatorId;
    clientUserId      = input.planManagerUserId; // reusing field as targetUserId when PM initiates
    initiatedBy       = "PLAN_MANAGER";

    // Verify the client exists
    const client = await prisma.user.findUnique({ where: { id: clientUserId } });
    if (!client) throw new NotFoundError("Client not found");
  } else {
    // Participant / worker / provider initiating
    planManagerUserId = input.planManagerUserId;
    clientUserId      = initiatorId;
    initiatedBy       = "CLIENT";

    // Verify the PM exists and has the PLAN_MANAGER role
    const pm = await prisma.user.findUnique({
      where: { id: planManagerUserId },
      include: { roles: true },
    });
    if (!pm || !pm.roles.some((r) => r.role === "PLAN_MANAGER")) {
      throw new NotFoundError("Plan manager not found");
    }
  }

  // Check for duplicate
  const existing = await prisma.planManagerConnection.findUnique({
    where: { planManagerUserId_clientUserId: { planManagerUserId, clientUserId } },
  });
  if (existing) {
    if (existing.status === "ACCEPTED") throw new ConflictError("Connection already accepted");
    if (existing.status === "PENDING")  throw new ConflictError("Connection request already pending");
    // DECLINED — allow re-request by upserting
  }

  return prisma.planManagerConnection.upsert({
    where: { planManagerUserId_clientUserId: { planManagerUserId, clientUserId } },
    create: { planManagerUserId, clientUserId, initiatedBy, status: "PENDING" },
    update: { initiatedBy, status: "PENDING", updatedAt: new Date() },
    include: {
      planManager: { select: { id: true, name: true, email: true } },
      client:      { select: { id: true, name: true, email: true } },
    },
  });
}

// ─── List connections ─────────────────────────────────────────────────────────

export async function listConnections(userId: string, activeRole: UserRole) {
  const where =
    activeRole === "PLAN_MANAGER"
      ? { planManagerUserId: userId }
      : { clientUserId: userId };

  return prisma.planManagerConnection.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      planManager: { select: { id: true, name: true, email: true, planManagerProfile: { select: { businessName: true, serviceAreas: true, acceptingClients: true } } } },
      client:      { select: { id: true, name: true, email: true } },
    },
  });
}

// ─── Respond to connection (PLAN_MANAGER side) ────────────────────────────────

export async function respondToConnection(
  connectionId: string,
  userId: string,
  activeRole: UserRole,
  input: RespondPmConnectionInput,
) {
  const conn = await prisma.planManagerConnection.findUnique({ where: { id: connectionId } });
  if (!conn) throw new NotFoundError("Connection not found");

  // Either the PM or the client can respond (e.g. client accepts PM-initiated request)
  const isPm     = activeRole === "PLAN_MANAGER" && conn.planManagerUserId === userId;
  const isClient = activeRole !== "PLAN_MANAGER" && conn.clientUserId === userId;

  if (!isPm && !isClient) {
    throw new ForbiddenError("You are not a party to this connection");
  }
  if (conn.status !== "PENDING") {
    throw new BadRequestError(`Connection is already ${conn.status.toLowerCase()}`);
  }

  const newStatus = input.action === "ACCEPT" ? "ACCEPTED" : "DECLINED";
  return prisma.planManagerConnection.update({
    where: { id: connectionId },
    data:  { status: newStatus },
    include: {
      planManager: { select: { id: true, name: true } },
      client:      { select: { id: true, name: true } },
    },
  });
}
