import { prisma } from "../../lib/prisma";
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
  ConflictError,
} from "../../lib/errors";
import { notify } from "../../lib/notify";
import { canAccessMarketplace } from "../../middleware/marketplace.middleware";
import type { UserRole, JobCategory, JobUrgency, JobStatus } from "@prisma/client";
import type {
  CreateJobInput,
  JobFiltersInput,
  ApplyJobInput,
  CancelJobInput,
  AssignWorkerInput,
  SendMessageInput,
  CreateInvoiceInput,
} from "../../validators/job.schema";

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Base include — participant contact details always masked at this level
const JOB_DETAIL_INCLUDE = {
  postedBy:          { select: { id: true, name: true, avatarUrl: true } },
  forParticipant:    { select: { id: true, name: true, avatarUrl: true } },
  selectedApplicant: { select: { id: true, name: true, avatarUrl: true } },
  assignedWorker:    { select: { id: true, name: true, avatarUrl: true } },
  applications: {
    include: { applicant: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { score: "desc" as const },
    take: 10,
  },
  _count: { select: { messages: true, applications: true } },
} as const;

// Statuses where the assigned worker may see participant contact details
const CONTACT_VISIBLE_STATUSES: JobStatus[] = ["ASSIGNED", "IN_PROGRESS", "COMPLETED", "CONFIRMED"];

/**
 * Attach participant contact details (phone, email) only when:
 * - Job is ASSIGNED or beyond, AND
 * - The caller is the assigned worker or the poster
 * Everyone else sees name + avatar only.
 */
function withContactDetails<T extends {
  status: JobStatus;
  assignedWorkerUserId: string | null;
  postedByUserId: string;
  forParticipant: { id: string; name: string; avatarUrl: string | null } | null;
}>(job: T, userId: string, participantContact: { phone: string | null; email: string | null } | null) {
  const canSeeContact =
    CONTACT_VISIBLE_STATUSES.includes(job.status) &&
    (job.assignedWorkerUserId === userId || job.postedByUserId === userId);

  return {
    ...job,
    forParticipant: job.forParticipant
      ? {
          ...job.forParticipant,
          ...(canSeeContact && participantContact
            ? { phone: participantContact.phone, email: participantContact.email }
            : {}),
        }
      : null,
  };
}

function requireJob(job: { status: JobStatus } | null, jobId: string) {
  if (!job) throw new NotFoundError(`Job ${jobId} not found`);
  return job;
}

// ─── Create job (participant or coordinator) ──────────────────────────────────

export async function createJob(
  posterId: string,
  activeRole: UserRole,
  input: CreateJobInput,
) {
  // Gate check
  const access = await canAccessMarketplace(posterId, activeRole);
  if (!access.canPost) {
    throw new ForbiddenError(
      `Complete your profile before posting: ${access.missing.join("; ")}`,
    );
  }

  if (activeRole !== "PARTICIPANT" && activeRole !== "COORDINATOR") {
    throw new ForbiddenError("Only participants and coordinators can post jobs");
  }

  let forParticipantUserId: string;

  if (activeRole === "PARTICIPANT") {
    forParticipantUserId = posterId;
  } else {
    // COORDINATOR — three modes
    if (input.forParticipantUserId) {
      // Mode 1: existing participant — must be this coordinator's managed participant
      const participant = await prisma.user.findUnique({
        where: { id: input.forParticipantUserId },
        include: { roles: true },
      });
      if (!participant) throw new NotFoundError("Participant not found");
      if (!participant.roles.some((r) => r.role === "PARTICIPANT")) {
        throw new BadRequestError("That user is not a participant");
      }
      // Ownership guard: participant must be managed by this coordinator
      // (parentUserId === posterId) OR coordinator posted the original job themselves
      if (participant.parentUserId && participant.parentUserId !== posterId) {
        throw new ForbiddenError("That participant is managed by a different coordinator");
      }
      forParticipantUserId = input.forParticipantUserId;

    } else if (input.inlineParticipant) {
      // Mode 2: inline — create a new MANAGED participant under this coordinator
      const { name, phone, suburb } = input.inlineParticipant;
      const newParticipant = await prisma.user.create({
        data: {
          name,
          phone:       phone ?? null,
          accountType: "MANAGED",
          status:      "ACTIVE",
          parentUserId: posterId,
          defaultSuburb: suburb ?? null,
          roles: { create: { role: "PARTICIPANT", isActiveDefault: true } },
        },
      });
      await prisma.participantProfile.create({
        data: { userId: newParticipant.id },
      });
      forParticipantUserId = newParticipant.id;

    } else {
      // Mode 3: no participant — coordinator posts as themselves
      forParticipantUserId = posterId;
    }
  }

  const status: JobStatus = input.asDraft ? "DRAFT" : "OPEN";

  return prisma.supportRequest.create({
    data: {
      postedByUserId:      posterId,
      forParticipantUserId,
      title:               input.title,
      description:         input.description,
      category:            input.category as JobCategory,
      subcategory:         input.subcategory ?? null,
      urgency:             (input.urgency ?? "SCHEDULED") as JobUrgency,
      status,
      suburb:              input.suburb,
      state:               input.state,
      postcode:            input.postcode ?? null,
      serviceDeliveryMode: input.serviceDeliveryMode ?? null,
      scheduledStartAt:    new Date(input.scheduledStartAt),
      scheduledEndAt:      new Date(input.scheduledEndAt),
      totalHours:          input.totalHours ?? null,
      isRecurring:         input.isRecurring ?? false,
      recurrencePattern:   (input.recurrencePattern ?? undefined) as any,
      workerPreferences:   (input.workerPreferences ?? undefined) as any,
    },
    include: JOB_DETAIL_INCLUDE,
  });
}

// ─── Publish a draft ─────────────────────────────────────────────────────────

export async function publishJob(jobId: string, posterId: string) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);
  if (job!.postedByUserId !== posterId) throw new ForbiddenError("Only the poster can publish this job");
  if (job!.status !== "DRAFT") throw new BadRequestError("Job is not in DRAFT status");
  return prisma.supportRequest.update({
    where: { id: jobId },
    data:  { status: "OPEN" },
    include: JOB_DETAIL_INCLUDE,
  });
}

// ─── List jobs (role-based) ───────────────────────────────────────────────────

export async function listJobs(
  userId: string,
  activeRole: UserRole,
  filters: JobFiltersInput,
) {
  const { suburb, category, urgency, status, page, limit } = filters;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (suburb)   where.suburb   = { contains: suburb,   mode: "insensitive" };
  if (category) where.category = category;
  if (urgency)  where.urgency  = urgency;

  switch (activeRole) {
    case "PARTICIPANT":
      where.OR = [{ forParticipantUserId: userId }, { postedByUserId: userId }];
      if (status) where.status = status;
      break;
    case "COORDINATOR":
      where.postedByUserId = userId;
      if (status) where.status = status;
      break;
    case "SUPPORT_WORKER":
    case "PROVIDER":
      where.status = status ?? "OPEN";
      break;
    case "PLAN_MANAGER": {
      const conns = await prisma.planManagerConnection.findMany({
        where: { planManagerUserId: userId, status: "ACCEPTED" },
        select: { clientUserId: true },
      });
      where.forParticipantUserId = { in: conns.map((c) => c.clientUserId) };
      if (status) where.status = status;
      break;
    }
    case "ADMIN":
      if (status) where.status = status;
      break;
    default:
      where.status = "OPEN";
  }

  // JobSummary shape — lean for list views (per DECISIONS.md §13).
  const JOB_SUMMARY_SELECT = {
    id:              true,
    title:           true,
    category:        true,
    urgency:         true,
    suburb:          true,
    state:           true,
    scheduledStartAt: true,
    totalHours:      true,  // estimatedHours
    createdAt:       true,  // postedAt
    status:          true,
    // Include own application status for workers/providers (ownApplication field).
    applications: {
      where:  { applicantUserId: userId },
      select: { id: true, status: true },
      take:   1,
    },
    _count: { select: { applications: true } },
  } as const;

  const [rawJobs, total] = await Promise.all([
    prisma.supportRequest.findMany({
      where:   where as any,
      skip,
      take:    limit,
      orderBy: [{ urgency: "asc" }, { scheduledStartAt: "asc" }],
      select:  JOB_SUMMARY_SELECT,
    }),
    prisma.supportRequest.count({ where: where as never }),
  ]);

  // Rename fields to match JobSummary shape, surface ownApplication for workers.
  const jobs = rawJobs.map(({ applications, createdAt, totalHours, ...rest }) => ({
    ...rest,
    postedAt:        createdAt,
    estimatedHours:  totalHours,
    ownApplication:  applications[0] ?? null,
  }));

  return { jobs, total, page, limit, pages: Math.ceil(total / limit) };
}

// ─── My jobs (scoped to calling user) ────────────────────────────────────────

export async function listMyJobs(userId: string, activeRole: UserRole, status?: string) {
  const JOB_SUMMARY_SELECT = {
    id: true, title: true, category: true, urgency: true,
    suburb: true, state: true, scheduledStartAt: true,
    totalHours: true, createdAt: true, status: true,
  } as const;

  let where: Record<string, unknown> = {};
  if (status) where.status = status;

  switch (activeRole) {
    case "SUPPORT_WORKER":
      where.OR = [
        { assignedWorkerUserId: userId },
        { selectedApplicantUserId: userId },
        { applications: { some: { applicantUserId: userId } } },
      ];
      break;
    case "PROVIDER":
      where.OR = [
        { postedByUserId: userId },
        { selectedApplicantUserId: userId },
        { assignedWorkerUserId: userId },
      ];
      break;
    case "PARTICIPANT":
      where.OR = [{ forParticipantUserId: userId }, { postedByUserId: userId }];
      break;
    case "COORDINATOR":
      where.postedByUserId = userId;
      break;
    default:
      where.postedByUserId = userId;
  }

  const jobs = await prisma.supportRequest.findMany({
    where: where as any,
    select: JOB_SUMMARY_SELECT,
    orderBy: [{ scheduledStartAt: "desc" }],
    take: 100,
  });

  return { jobs: jobs.map(({ createdAt, totalHours, ...rest }) => ({ ...rest, postedAt: createdAt, totalHours })) };
}

// ─── Get single job ───────────────────────────────────────────────────────────

export async function getJob(jobId: string, userId: string, activeRole: UserRole) {
  const job = await prisma.supportRequest.findUnique({
    where:   { id: jobId },
    include: JOB_DETAIL_INCLUDE,
  });
  requireJob(job, jobId);

  // DRAFT jobs are only visible to the poster
  if (job!.status === "DRAFT" && job!.postedByUserId !== userId) {
    throw new NotFoundError(`Job ${jobId} not found`);
  }

  if (activeRole === "SUPPORT_WORKER" || activeRole === "PROVIDER") {
    const hasApp = job!.applications.some((a) => a.applicantUserId === userId);
    if (
      job!.status !== "OPEN" &&
      !hasApp &&
      job!.selectedApplicantUserId !== userId &&
      job!.assignedWorkerUserId !== userId
    ) {
      throw new ForbiddenError("Job not visible");
    }
  }

  // Fetch participant contact details separately — only injected if caller is eligible
  const participantContact = job!.forParticipantUserId
    ? await prisma.user.findUnique({
        where:  { id: job!.forParticipantUserId },
        select: { phone: true, email: true },
      })
    : null;

  return withContactDetails(job!, userId, participantContact);
}

// ─── Cancel job (+ emergency promotion if near start) ────────────────────────

export async function cancelJob(
  jobId: string,
  userId: string,
  input: CancelJobInput,
) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);
  if (job!.postedByUserId !== userId) throw new ForbiddenError("Only the poster can cancel");
  if (["COMPLETED","CONFIRMED","CANCELLED"].includes(job!.status)) {
    throw new BadRequestError(`Cannot cancel a ${job!.status} job`);
  }

  // Emergency promotion: if the job was ASSIGNED and < 4 hours to start, repost as EMERGENCY
  const hoursToStart =
    (new Date(job!.scheduledStartAt).getTime() - Date.now()) / (1000 * 60 * 60);
  const shouldPromote =
    job!.status === "ASSIGNED" && hoursToStart > 0 && hoursToStart <= 4;

  if (shouldPromote) {
    // Cancel + create a promoted emergency repost in a transaction
    await prisma.$transaction([
      prisma.supportRequest.update({
        where: { id: jobId },
        data: {
          status:            "CANCELLED",
          cancelledAt:       new Date(),
          cancelledByUserId: userId,
          cancelReason:      input.reason ?? null,
        },
      }),
      prisma.jobApplication.updateMany({
        where: { jobId },
        data:  { status: "DECLINED" },
      }),
    ]);

    const promoted = await prisma.supportRequest.create({
      data: {
        postedByUserId:          job!.postedByUserId,
        forParticipantUserId:    job!.forParticipantUserId,
        title:                   `[EMERGENCY] ${job!.title}`,
        description:             job!.description,
        category:                job!.category,
        subcategory:             job!.subcategory,
        urgency:                 "EMERGENCY",
        status:                  "OPEN",
        suburb:                  job!.suburb,
        state:                   job!.state,
        postcode:                job!.postcode,
        serviceDeliveryMode:     job!.serviceDeliveryMode,
        scheduledStartAt:        job!.scheduledStartAt,
        scheduledEndAt:          job!.scheduledEndAt,
        totalHours:              job!.totalHours ?? undefined,
        isRecurring:             false,
        workerPreferences:       job!.workerPreferences ?? undefined,
        promotedFromCancellation: true,
      },
    });

    // Notify poster
    void notify.sendPushNotification(
      userId,
      "Job rescheduled as EMERGENCY",
      `Your job "${job!.title}" was reposted as an emergency shift.`,
      { promotedJobId: promoted.id },
      "JOB_PROMOTED_EMERGENCY",
    );

    return { cancelled: job, promoted };
  }

  // Normal cancel
  await prisma.$transaction([
    prisma.supportRequest.update({
      where: { id: jobId },
      data: {
        status:            "CANCELLED",
        cancelledAt:       new Date(),
        cancelledByUserId: userId,
        cancelReason:      input.reason ?? null,
      },
    }),
    prisma.jobApplication.updateMany({
      where: { jobId },
      data:  { status: "DECLINED" },
    }),
  ]);

  return { cancelled: await prisma.supportRequest.findUnique({ where: { id: jobId } }), promoted: null };
}

// ─── Apply (express interest) ─────────────────────────────────────────────────

export async function applyToJob(
  jobId: string,
  applicantId: string,
  activeRole: UserRole,
  input: ApplyJobInput,
) {
  if (activeRole !== "SUPPORT_WORKER" && activeRole !== "PROVIDER") {
    throw new ForbiddenError("Only workers and providers can apply to jobs");
  }

  const access = await canAccessMarketplace(applicantId, activeRole);
  if (!access.canApply) {
    throw new ForbiddenError(
      `Complete your profile before applying: ${access.missing.join("; ")}`,
    );
  }

  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);
  if (job!.status !== "OPEN") throw new BadRequestError("Job is no longer accepting applications");

  // Incomplete worker cap: max 1 active application until Step 1 + Step 4 complete
  if (activeRole === "SUPPORT_WORKER") {
    const wp = await prisma.workerProfile.findUnique({ where: { userId: applicantId } });
    const profileComplete =
      !!wp?.rightToWork &&
      Array.isArray(wp?.servicesOffered) && (wp.servicesOffered as string[]).length > 0 &&
      !!wp?.experienceLevel;

    if (!profileComplete) {
      const existingApps = await prisma.jobApplication.count({
        where: { applicantUserId: applicantId, status: { not: "WITHDRAWN" } },
      });
      if (existingApps >= 1) {
        throw new ForbiddenError(
          "Complete your worker profile (Steps 1 & 4) to apply to more than one job",
        );
      }
    }
  }

  const existing = await prisma.jobApplication.findUnique({
    where: { jobId_applicantUserId: { jobId, applicantUserId: applicantId } },
  });
  if (existing && existing.status !== "WITHDRAWN") {
    throw new ConflictError("You have already applied to this job");
  }

  const app = existing
    ? await prisma.jobApplication.update({
        where: { id: existing.id },
        data:  { status: "INTERESTED", note: input.note ?? null },
      })
    : await prisma.jobApplication.create({
        data: {
          jobId,
          applicantUserId: applicantId,
          applicantRole:   activeRole,
          note:            input.note ?? null,
          status:          "INTERESTED",
        },
      });

  // Notify poster
  void notify.sendPushNotification(
    job!.postedByUserId,
    "New application received",
    `Someone expressed interest in "${job!.title}"`,
    { jobId, applicationId: app.id },
    "JOB_APPLICATION_RECEIVED",
  );

  return app;
}

// ─── List applications (poster only, top 5 by score) ─────────────────────────

export async function listApplications(jobId: string, userId: string) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);
  if (job!.postedByUserId !== userId) throw new ForbiddenError("Only the poster can view applications");

  return prisma.jobApplication.findMany({
    where:   { jobId },
    orderBy: { score: "desc" },
    take:    5,
    include: {
      applicant: {
        select: {
          id: true, name: true, avatarUrl: true,
          workerProfile: {
            select: { experienceLevel: true, servicesOffered: true, rating: true, hourlyRate: true },
          },
          providerProfile: {
            select: { businessName: true, coreServices: true },
          },
        },
      },
    },
  });
}

// ─── Select applicant (OPEN → ASSIGNED) ──────────────────────────────────────

export async function selectApplicant(jobId: string, appId: string, posterId: string) {
  const job = await prisma.supportRequest.findUnique({
    where: { id: jobId }, include: { applications: true },
  });
  requireJob(job, jobId);
  if (job!.postedByUserId !== posterId) throw new ForbiddenError("Only the poster can select");
  if (job!.status !== "OPEN") throw new BadRequestError("Job is no longer open");

  const app = await prisma.jobApplication.findUnique({ where: { id: appId } });
  if (!app || app.jobId !== jobId) throw new NotFoundError("Application not found");

  await prisma.$transaction([
    prisma.jobApplication.updateMany({
      where: { jobId, id: { not: appId } },
      data:  { status: "DECLINED" },
    }),
    prisma.jobApplication.update({ where: { id: appId }, data: { status: "SELECTED" } }),
    prisma.supportRequest.update({
      where: { id: jobId },
      data: {
        status:                  "ASSIGNED",
        selectedApplicantUserId: app.applicantUserId,
        selectedAt:              new Date(),
      },
    }),
  ]);

  // Notify selected applicant
  void notify.sendPushNotification(
    app.applicantUserId,
    "You've been selected!",
    `You were selected for "${job!.title}"`,
    { jobId },
    "JOB_SELECTED",
  );

  return prisma.supportRequest.findUnique({ where: { id: jobId }, include: JOB_DETAIL_INCLUDE });
}

// ─── Provider assigns a specific worker (after provider is selected) ──────────

export async function assignWorker(
  jobId: string,
  providerId: string,
  input: AssignWorkerInput,
) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);
  if (job!.selectedApplicantUserId !== providerId) {
    throw new ForbiddenError("Only the selected provider can assign a worker");
  }
  if (!["ASSIGNED"].includes(job!.status)) {
    throw new BadRequestError("Can only assign a worker to an ASSIGNED job");
  }

  // Verify the worker belongs to this provider
  const worker = await prisma.user.findUnique({
    where: { id: input.workerUserId },
    include: { roles: true },
  });
  if (!worker) throw new NotFoundError("Worker not found");
  if (worker.parentUserId !== providerId) {
    throw new ForbiddenError("That worker does not belong to your provider account");
  }
  if (!worker.roles.some((r) => r.role === "SUPPORT_WORKER")) {
    throw new BadRequestError("That user is not a support worker");
  }

  const updated = await prisma.supportRequest.update({
    where: { id: jobId },
    data:  { assignedWorkerUserId: input.workerUserId },
    include: JOB_DETAIL_INCLUDE,
  });

  void notify.sendPushNotification(
    input.workerUserId,
    "You have been assigned to a job",
    `You've been assigned to "${job!.title}"`,
    { jobId },
    "JOB_ASSIGNED",
  );

  return updated;
}

// ─── Start job (ASSIGNED → IN_PROGRESS) ──────────────────────────────────────

export async function startJob(jobId: string, userId: string) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);

  const isSelected = job!.selectedApplicantUserId === userId;
  const isAssigned = job!.assignedWorkerUserId    === userId;
  if (!isSelected && !isAssigned) {
    throw new ForbiddenError("Only the selected worker/provider can start this job");
  }
  if (job!.status !== "ASSIGNED") {
    throw new BadRequestError(`Job must be ASSIGNED to start (current: ${job!.status})`);
  }

  const updated = await prisma.supportRequest.update({
    where: { id: jobId },
    data:  { status: "IN_PROGRESS", startedAt: new Date() },
    include: JOB_DETAIL_INCLUDE,
  });

  void notify.sendPushNotification(
    job!.postedByUserId,
    "Job started",
    `"${job!.title}" is now in progress`,
    { jobId },
    "JOB_STARTED",
  );

  return updated;
}

// ─── Complete job (IN_PROGRESS → COMPLETED) — worker/provider side ───────────

export async function completeJob(jobId: string, userId: string) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);

  const isSelected = job!.selectedApplicantUserId === userId;
  const isAssigned = job!.assignedWorkerUserId    === userId;
  if (!isSelected && !isAssigned) {
    throw new ForbiddenError("Only the assigned worker/provider can mark this job complete");
  }
  if (job!.status !== "IN_PROGRESS") {
    throw new BadRequestError(`Job must be IN_PROGRESS to complete (current: ${job!.status})`);
  }

  const updated = await prisma.supportRequest.update({
    where: { id: jobId },
    data:  { status: "COMPLETED", completedAt: new Date() },
    include: JOB_DETAIL_INCLUDE,
  });

  void notify.sendPushNotification(
    job!.postedByUserId,
    "Job marked complete",
    `"${job!.title}" has been marked complete — please confirm`,
    { jobId },
    "JOB_COMPLETED",
  );

  return updated;
}

// ─── Confirm job (COMPLETED → CONFIRMED) — poster side ───────────────────────

export async function confirmJob(jobId: string, posterId: string) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);
  if (job!.postedByUserId !== posterId) {
    throw new ForbiddenError("Only the poster can confirm job completion");
  }
  if (job!.status !== "COMPLETED") {
    throw new BadRequestError(`Job must be COMPLETED to confirm (current: ${job!.status})`);
  }

  const updated = await prisma.supportRequest.update({
    where: { id: jobId },
    data:  { status: "CONFIRMED", confirmedAt: new Date() },
    include: JOB_DETAIL_INCLUDE,
  });

  const recipientId = job!.assignedWorkerUserId ?? job!.selectedApplicantUserId;
  if (recipientId) {
    void notify.sendPushNotification(
      recipientId,
      "Job confirmed",
      `"${job!.title}" has been confirmed by the poster`,
      { jobId },
      "JOB_CONFIRMED",
    );
  }

  return updated;
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function sendMessage(jobId: string, senderId: string, input: SendMessageInput) {
  const job = await prisma.supportRequest.findUnique({
    where:   { id: jobId },
    include: { applications: { select: { applicantUserId: true } } },
  });
  requireJob(job, jobId);

  const isParty =
    job!.postedByUserId          === senderId ||
    job!.forParticipantUserId    === senderId ||
    job!.selectedApplicantUserId === senderId ||
    job!.assignedWorkerUserId    === senderId ||
    job!.applications.some((a) => a.applicantUserId === senderId);

  if (!isParty) throw new ForbiddenError("You are not a participant in this job");

  return prisma.jobMessage.create({
    data: { jobId, senderUserId: senderId, body: input.body },
    include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
  });
}

export async function getMessages(jobId: string, userId: string) {
  const job = await prisma.supportRequest.findUnique({
    where:   { id: jobId },
    include: { applications: { select: { applicantUserId: true } } },
  });
  requireJob(job, jobId);

  const isParty =
    job!.postedByUserId          === userId ||
    job!.forParticipantUserId    === userId ||
    job!.selectedApplicantUserId === userId ||
    job!.assignedWorkerUserId    === userId ||
    job!.applications.some((a) => a.applicantUserId === userId);

  if (!isParty) throw new ForbiddenError("You are not a participant in this job");

  return prisma.jobMessage.findMany({
    where:   { jobId },
    orderBy: { createdAt: "asc" },
    include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
  });
}

// ─── Invoice ──────────────────────────────────────────────────────────────────

export async function createInvoice(
  jobId: string,
  senderId: string,
  activeRole: UserRole,
  input: CreateInvoiceInput,
) {
  const allowed: UserRole[] = ["COORDINATOR","PROVIDER","SUPPORT_WORKER"];
  if (!allowed.includes(activeRole)) {
    throw new ForbiddenError("Only coordinators, providers, and workers can create invoices");
  }

  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);
  if (!["COMPLETED","CONFIRMED","ASSIGNED","IN_PROGRESS"].includes(job!.status)) {
    throw new BadRequestError("Can only invoice a completed or in-progress job");
  }

  const app = await prisma.jobApplication.findFirst({
    where: { jobId, applicantUserId: senderId, status: { in: ["SELECTED", "SHORTLISTED"] } },
  });
  if (!app && job!.postedByUserId !== senderId) {
    throw new ForbiddenError("Only the poster or the assigned worker/provider can create an invoice");
  }

  const invoice = await prisma.invoice.create({
    data: {
      jobId,
      senderUserId:      senderId,
      planManagerUserId: input.planManagerUserId,
      participantUserId: input.participantUserId,
      hours:             input.hours ?? null,
      note:              input.note  ?? null,
    },
    include: {
      sender:      { select: { id: true, name: true } },
      planManager: { select: { id: true, name: true } },
      participant: { select: { id: true, name: true } },
      job:         { select: { id: true, title: true } },
    },
  });

  await notify.sendPushNotification(
    input.planManagerUserId,
    "New invoice received",
    `An invoice has been sent for job: ${job!.title}`,
    { jobId, invoiceId: invoice.id },
    "INVOICE_RECEIVED",
  );

  return invoice;
}

// ─── List invoices ────────────────────────────────────────────────────────────

export async function listInvoices(userId: string, activeRole: UserRole) {
  const where: Record<string, unknown> = {};

  switch (activeRole) {
    case "PLAN_MANAGER":
      where.planManagerUserId = userId;
      break;
    case "COORDINATOR":
    case "PROVIDER":
    case "SUPPORT_WORKER":
      where.senderUserId = userId;
      break;
    case "PARTICIPANT":
      where.participantUserId = userId;
      break;
    default:
      where.senderUserId = userId;
  }

  const invoices = await prisma.invoice.findMany({
    where,
    include: {
      sender:      { select: { id: true, name: true } },
      planManager: { select: { id: true, name: true } },
      participant: { select: { id: true, name: true } },
      job:         { select: { id: true, title: true, status: true } },
    },
    orderBy: { sentAt: "desc" },
  });

  return invoices;
}
