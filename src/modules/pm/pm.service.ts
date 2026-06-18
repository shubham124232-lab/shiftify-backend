import { prisma } from "../../lib/prisma";
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
} from "../../lib/errors";
import type { UserRole, JobCategory, JobUrgency, FundingType } from "@prisma/client";
import type {
  CreatePmConnectionInput,
  RespondPmConnectionInput,
} from "../../validators/pm.schema";

// ─── Request a PM connection ──────────────────────────────────────────────────

export async function createConnection(
  initiatorId: string,
  activeRole: UserRole,
  input: CreatePmConnectionInput,
) {
  let planManagerUserId: string;
  let clientUserId: string;
  let initiatedBy: "CLIENT" | "PLAN_MANAGER";

  if (activeRole === "PLAN_MANAGER") {
    planManagerUserId = initiatorId;
    clientUserId      = input.planManagerUserId;
    initiatedBy       = "PLAN_MANAGER";
    const client = await prisma.user.findUnique({ where: { id: clientUserId } });
    if (!client) throw new NotFoundError("Client not found");
  } else {
    planManagerUserId = input.planManagerUserId;
    clientUserId      = initiatorId;
    initiatedBy       = "CLIENT";
    const pm = await prisma.user.findUnique({
      where: { id: planManagerUserId },
      include: { roles: true },
    });
    if (!pm || !pm.roles.some((r) => r.role === "PLAN_MANAGER")) {
      throw new NotFoundError("Plan manager not found");
    }
  }

  const existing = await prisma.planManagerConnection.findUnique({
    where: { planManagerUserId_clientUserId: { planManagerUserId, clientUserId } },
  });
  if (existing) {
    if (existing.status === "ACCEPTED") throw new ConflictError("Connection already accepted");
    if (existing.status === "PENDING")  throw new ConflictError("Connection request already pending");
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

// ─── List linked participants (PLAN_MANAGER only) ─────────────────────────────

export async function listLinkedParticipants(planManagerUserId: string, activeRole: UserRole) {
  if (activeRole !== "PLAN_MANAGER") {
    throw new ForbiddenError("Only plan managers can list linked participants");
  }

  const connections = await prisma.planManagerConnection.findMany({
    where:   { planManagerUserId, status: "ACCEPTED" },
    orderBy: { updatedAt: "desc" },
    include: {
      client: {
        select: {
          id:   true,
          name: true,
          email: true,
          phone: true,
          avatarUrl: true,
          participantProfile: {
            select: {
              ndisNumber:            true,
              fundingManagementType: true,
              primaryDisability:     true,
              ndisStartDate:         true,
              ndisEndDate:           true,
              seekingPlanManager:    true,
            },
          },
        },
      },
    },
  });

  const clientIds = connections.map((c) => c.clientUserId);
  const [openJobCounts, invoiceCounts] = clientIds.length > 0
    ? await Promise.all([
        prisma.supportRequest.groupBy({
          by:    ["forParticipantUserId"],
          where: { forParticipantUserId: { in: clientIds }, status: "OPEN" },
          _count: { _all: true },
        }),
        prisma.invoice.groupBy({
          by:    ["participantUserId"],
          where: { planManagerUserId, participantUserId: { in: clientIds } },
          _count: { _all: true },
        }),
      ])
    : [[], []];

  const openJobMap: Record<string, number> = {};
  for (const r of openJobCounts) {
    openJobMap[r.forParticipantUserId] = r._count._all;
  }
  const invoiceMap: Record<string, number> = {};
  for (const r of invoiceCounts) {
    invoiceMap[r.participantUserId] = r._count._all;
  }

  return connections.map((c) => ({
    connectionId: c.id,
    linkedSince:  c.updatedAt,
    participant:  c.client,
    openJobs:     openJobMap[c.clientUserId] ?? 0,
    invoiceCount: invoiceMap[c.clientUserId]  ?? 0,
  }));
}

// ─── Post a referral (support request) on behalf of a linked participant ───────

export interface PostReferralInput {
  participantUserId: string;
  title:             string;
  description:       string;
  category:          string;
  suburb:            string;
  state:             string;
  scheduledStartAt:  string;
  scheduledEndAt:    string;
  urgency?:          string;
  fundingType?:      string;
  totalHours?:       number;
}

export async function postReferral(
  planManagerUserId: string,
  activeRole: UserRole,
  input: PostReferralInput,
) {
  if (activeRole !== "PLAN_MANAGER") {
    throw new ForbiddenError("Only plan managers can post referrals");
  }

  const conn = await prisma.planManagerConnection.findUnique({
    where: {
      planManagerUserId_clientUserId: {
        planManagerUserId,
        clientUserId: input.participantUserId,
      },
    },
  });
  if (!conn || conn.status !== "ACCEPTED") {
    throw new BadRequestError("Participant is not linked to this plan manager");
  }

  return prisma.supportRequest.create({
    data: {
      postedByUserId:       planManagerUserId,
      forParticipantUserId: input.participantUserId,
      title:                input.title,
      description:          input.description,
      category:             input.category as JobCategory,
      urgency:              (input.urgency ?? "SCHEDULED") as JobUrgency,
      status:               "OPEN",
      suburb:               input.suburb,
      state:                input.state,
      scheduledStartAt:     new Date(input.scheduledStartAt),
      scheduledEndAt:       new Date(input.scheduledEndAt),
      totalHours:           input.totalHours ?? null,
      fundingType:          input.fundingType ? (input.fundingType as FundingType) : null,
      visibilityTarget:     "ALL",
    },
    select: {
      id:               true,
      status:           true,
      title:            true,
      category:         true,
      urgency:          true,
      suburb:           true,
      state:            true,
      scheduledStartAt: true,
      scheduledEndAt:   true,
      createdAt:        true,
    },
  });
// ─── Get budget statement for a linked participant ─────────────────────────────

export async function getParticipantBudgetStatement(
  planManagerUserId: string,
  participantUserId: string,
  activeRole: UserRole,
) {
  if (activeRole !== "PLAN_MANAGER") {
    throw new ForbiddenError("Only plan managers can view budget statements");
  }

  const conn = await prisma.planManagerConnection.findUnique({
    where: {
      planManagerUserId_clientUserId: {
        planManagerUserId,
        clientUserId: participantUserId,
      },
    },
  });
  if (!conn || conn.status !== "ACCEPTED") {
    throw new NotFoundError("Participant not linked to this plan manager");
  }

  const [invoices, openJobs, completedJobs, participant] = await Promise.all([
    prisma.invoice.findMany({
      where:   { planManagerUserId, participantUserId },
      orderBy: { sentAt: "desc" },
      include: {
        sender: { select: { id: true, name: true } },
        job:    { select: { id: true, title: true, category: true, scheduledStartAt: true } },
      },
    }),
    prisma.supportRequest.count({
      where: { forParticipantUserId: participantUserId, status: "OPEN" },
    }),
    prisma.supportRequest.count({
      where: { forParticipantUserId: participantUserId, status: { in: ["COMPLETED", "CONFIRMED"] } },
    }),
    prisma.user.findUnique({
      where: { id: participantUserId },
      select: {
        id:   true,
        name: true,
        email: true,
        participantProfile: {
          select: {
            ndisNumber:            true,
            fundingManagementType: true,
            ndisStartDate:         true,
            ndisEndDate:           true,
          },
        },
      },
    }),
  ]);

  const totalHoursInvoiced = invoices.reduce(
    (sum, inv) => sum + (inv.hours ? Number(inv.hours) : 0),
    0,
  );

  return {
    participant,
    linkedSince:       conn.updatedAt,
    invoices,
    invoiceCount:      invoices.length,
    totalHoursInvoiced,
    openJobCount:      openJobs,
    completedJobCount: completedJobs,
  };
}

// ─── List referrals posted by this PM ────────────────────────────────────────

export async function listReferrals(
  planManagerUserId: string,
  activeRole: UserRole,
  params: { status?: string; page: number; limit: number },
) {
  if (activeRole !== "PLAN_MANAGER") {
    throw new ForbiddenError("Only plan managers can list referrals");
  }

  const { page, limit } = params;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { postedByUserId: planManagerUserId };
  if (params.status) where.status = params.status;

  const [referrals, total] = await Promise.all([
    prisma.supportRequest.findMany({
      where,
      select: {
        id:               true,
        title:            true,
        category:         true,
        urgency:          true,
        status:           true,
        suburb:           true,
        state:            true,
        scheduledStartAt: true,
        scheduledEndAt:   true,
        totalHours:       true,
        createdAt:        true,
        forParticipant:   { select: { id: true, name: true } },
        _count:           { select: { applications: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.supportRequest.count({ where }),
  ]);

  return { referrals, total, page, limit };
}

// ─── Browse load board ────────────────────────────────────────────────────────

export async function browseLoadBoard(
  planManagerUserId: string,
  activeRole: UserRole,
  params: { category?: string; urgency?: string; suburb?: string; page: number; limit: number },
) {
  if (activeRole !== "PLAN_MANAGER") {
    throw new ForbiddenError("Only plan managers can browse the load board");
  }

  const acceptedConns = await prisma.planManagerConnection.findMany({
    where: { planManagerUserId, status: "ACCEPTED" },
    select: { clientUserId: true },
  });
  const clientIds = acceptedConns.map((c) => c.clientUserId);

  const { page, limit } = params;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { status: "OPEN" };
  if (params.category) where.category = params.category;
  if (params.urgency)  where.urgency  = params.urgency;
  if (params.suburb) {
    where.suburb = { contains: params.suburb, mode: "insensitive" };
  }

  const [requests, total] = await Promise.all([
    prisma.supportRequest.findMany({
      where,
      select: {
        id:               true,
        title:            true,
        description:      true,
        category:         true,
        urgency:          true,
        status:           true,
        suburb:           true,
        state:            true,
        scheduledStartAt: true,
        scheduledEndAt:   true,
        totalHours:       true,
        createdAt:        true,
        forParticipant:   { select: { id: true, name: true } },
        postedBy:         { select: { id: true, name: true } },
        _count:           { select: { applications: true } },
      },
      orderBy: [{ urgency: "asc" }, { createdAt: "desc" }],
      skip,
      take: limit,
    }),
    prisma.supportRequest.count({ where }),
  ]);

  const clientIdSet = new Set(clientIds);
  const tagged = requests.map((r) => ({
    ...r,
    isLinkedParticipant: r.forParticipant ? clientIdSet.has(r.forParticipant.id) : false,
  }));

  return { requests: tagged, total, page, limit };
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
      planManager: {
        select: {
          id:   true,
          name: true,
          email: true,
          planManagerProfile: {
            select: { businessName: true, serviceAreas: true, acceptingClients: true },
          },
        },
      },
      client: { select: { id: true, name: true, email: true } },
    },
  });
}

// ─── Respond to connection ────────────────────────────────────────────────────

export async function respondToConnection(
  connectionId: string,
  userId: string,
  activeRole: UserRole,
  input: RespondPmConnectionInput,
) {
  const conn = await prisma.planManagerConnection.findUnique({ where: { id: connectionId } });
  if (!conn) throw new NotFoundError("Connection not found");

  const isPm     = activeRole === "PLAN_MANAGER" && conn.planManagerUserId === userId;
  const isClient = activeRole !== "PLAN_MANAGER" && conn.clientUserId === userId;

  if (!isPm && !isClient) {
    throw new ForbiddenError("You are not a party to this connection");
  }
  if (conn.status !== "PENDING") {
    throw new BadRequestError("Connection is already " + conn.status.toLowerCase());
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
