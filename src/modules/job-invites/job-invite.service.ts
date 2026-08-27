import { randomUUID } from "crypto";
import { prisma } from "../../lib/prisma";
import { NotFoundError, ForbiddenError, ConflictError, BadRequestError } from "../../lib/errors";
import { notify } from "../../lib/notify";
import { computeApplicationScore } from "../jobs/job-scoring";
import type { UserRole } from "@prisma/client";
import type { CreateJobInviteInput, RespondJobInviteInput } from "../../validators/job-invite.schema";

const INCLUDE = {
  invitedUser: { select: { id: true, name: true, avatarUrl: true } },
  invitedBy:   { select: { id: true, name: true } },
  job:         { select: { id: true, title: true, status: true, postedByUserId: true } },
} as const;

// Pricing V2 §9.4 — a Provider's Direct Connect invite is a paid $9.99 charge,
// only taken if the worker accepts. A Coordinator's SC-F01-06 invite is free.
const PROVIDER_DIRECT_CONNECT_PRICE_AUD = 9.99;

// ─── Poster invites one specific worker/provider to their job (free for a ─────
// Coordinator's SC-F01-06 invite, paid for a Provider's Direct Connect, §9).

export async function createInvite(
  jobId: string,
  invitedByUserId: string,
  activeRole: UserRole,
  input: CreateJobInviteInput,
) {
  // SW doc Window 19 — participants can send direct invitations too, not just
  // Coordinators/Providers; a participant's invite is free, same as a Coordinator's.
  if (!["PARTICIPANT", "COORDINATOR", "PROVIDER"].includes(activeRole)) {
    throw new ForbiddenError("Only participants, coordinators and providers can invite someone to a job");
  }

  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  if (!job) throw new NotFoundError("We couldn't find that job. It may have been removed.");
  if (job.postedByUserId !== invitedByUserId) {
    throw new ForbiddenError("Only the poster can invite someone to this job");
  }
  if (job.status !== "OPEN") throw new BadRequestError("This request is no longer open for invitations");

  const invited = await prisma.user.findUnique({
    where: { id: input.invitedUserId },
    include: { roles: true },
  });
  if (!invited || !invited.roles.some((r) => ["SUPPORT_WORKER", "PROVIDER"].includes(r.role))) {
    throw new NotFoundError("That user isn't a support worker or provider");
  }

  const amountAud = activeRole === "PROVIDER" ? PROVIDER_DIRECT_CONNECT_PRICE_AUD : null;

  const existing = await prisma.jobInvite.findUnique({
    where: { jobId_invitedUserId: { jobId, invitedUserId: input.invitedUserId } },
  });
  if (existing) {
    if (existing.status === "PENDING") throw new ConflictError("An invitation is already pending for this person");
    if (existing.status === "ACCEPTED") throw new ConflictError("This person has already accepted an invitation to this job");
    // Previously declined/withdrawn — allow a fresh invite.
    const reopened = await prisma.jobInvite.update({
      where: { id: existing.id },
      data:  { status: "PENDING", message: input.message ?? null, amountAud, mockReceiptRef: null, respondedAt: null },
      include: INCLUDE,
    });
    notifyInvited(reopened);
    return reopened;
  }

  // §9.3 — a Provider may send up to 3 concurrent paid invites for one job.
  if (activeRole === "PROVIDER") {
    const pendingCount = await prisma.jobInvite.count({
      where: { jobId, status: "PENDING", amountAud: { not: null } },
    });
    if (pendingCount >= 3) {
      throw new ConflictError("You can have at most 3 pending Direct Connect invitations open for one job");
    }
  }

  const created = await prisma.jobInvite.create({
    data: { jobId, invitedByUserId, invitedUserId: input.invitedUserId, message: input.message ?? null, amountAud },
    include: INCLUDE,
  });
  notifyInvited(created);
  return created;
}

function notifyInvited(invite: { id: string; invitedUserId: string; job: { title: string } }) {
  void notify.sendPushNotification(
    invite.invitedUserId,
    "You've been invited to a job",
    `You've been invited to "${invite.job.title}".`,
    { jobInviteId: invite.id },
    "JOB_INVITE_RECEIVED",
  );
}

// ─── List invites for a job (poster view) ──────────────────────────────────────

export async function listInvitesForJob(jobId: string, userId: string) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  if (!job) throw new NotFoundError("We couldn't find that job. It may have been removed.");
  if (job.postedByUserId !== userId) throw new ForbiddenError("Only the poster can view this job's invitations");

  return prisma.jobInvite.findMany({
    where:   { jobId },
    orderBy: { createdAt: "desc" },
    include: INCLUDE,
  });
}

// ─── List invites received by the current user ─────────────────────────────────

export async function listMyInvites(userId: string) {
  return prisma.jobInvite.findMany({
    where:   { invitedUserId: userId },
    orderBy: { createdAt: "desc" },
    include: INCLUDE,
  });
}

// ─── Invited worker/provider accepts or declines ───────────────────────────────

export async function respondToInvite(
  inviteId: string,
  userId: string,
  activeRole: UserRole,
  input: RespondJobInviteInput,
) {
  const invite = await prisma.jobInvite.findUnique({ where: { id: inviteId }, include: INCLUDE });
  if (!invite) throw new NotFoundError("Invitation not found");
  if (invite.invitedUserId !== userId) throw new ForbiddenError("This invitation isn't addressed to you");
  if (invite.status !== "PENDING") throw new BadRequestError("This invitation is already " + invite.status.toLowerCase());

  if (input.action === "DECLINE") {
    const updated = await prisma.jobInvite.update({
      where: { id: inviteId },
      data:  { status: "DECLINED", respondedAt: new Date() },
      include: INCLUDE,
    });
    return updated;
  }

  if (invite.job.status !== "OPEN") {
    throw new BadRequestError("This request is no longer open");
  }

  const mockReceiptRef = invite.amountAud != null ? `DEV-${randomUUID().toUpperCase()}` : null;

  const [updated] = await prisma.$transaction([
    prisma.jobInvite.update({
      where: { id: inviteId },
      data:  { status: "ACCEPTED", respondedAt: new Date(), mockReceiptRef },
      include: INCLUDE,
    }),
    // §9.3 — accepting one invite auto-withdraws the job's other pending paid invites.
    prisma.jobInvite.updateMany({
      where: { jobId: invite.jobId, status: "PENDING", id: { not: inviteId } },
      data:  { status: "WITHDRAWN", respondedAt: new Date() },
    }),
  ]);

  // Reuse the existing shortlist/select/assign pipeline unchanged — upsert an
  // ordinary JobApplication row so selectApplicant() needs no special-casing.
  const score = await computeApplicationScore(userId, activeRole, null, null);
  const existingApp = await prisma.jobApplication.findUnique({
    where: { jobId_applicantUserId: { jobId: invite.jobId, applicantUserId: userId } },
  });
  if (existingApp) {
    await prisma.jobApplication.update({
      where: { id: existingApp.id },
      data:  { status: "INTERESTED", applicationData: { invited: true, jobInviteId: inviteId } as any, score },
    });
  } else {
    await prisma.jobApplication.create({
      data: {
        jobId: invite.jobId,
        applicantUserId: userId,
        applicantRole: activeRole,
        status: "INTERESTED",
        applicationData: { invited: true, jobInviteId: inviteId } as any,
        score,
      },
    });
  }

  void notify.sendPushNotification(
    invite.invitedByUserId,
    "Invitation accepted",
    `${invite.invitedUser.name} accepted your invitation to "${invite.job.title}".`,
    { jobInviteId: inviteId },
    "JOB_INVITE_ACCEPTED",
  );

  return updated;
}
