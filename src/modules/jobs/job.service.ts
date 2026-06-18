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
import { ShiftType, FundingType } from "@prisma/client";
import type {
  CreateJobInput,
  JobFiltersInput,
  ApplyJobInput,
  CancelJobInput,
  AssignWorkerInput,
  SendMessageInput,
  CreateInvoiceInput,
} from "../../validators/job.schema";
import { Prisma } from "@prisma/client";

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Full include — used only for GET (read) operations.
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

// Lean select — used for write (mutation) responses.
const JOB_WRITE_SELECT = {
  id:                      true,
  status:                  true,
  title:                   true,
  postedByUserId:          true,
  forParticipantUserId:    true,
  selectedApplicantUserId: true,
  assignedWorkerUserId:    true,
  updatedAt:               true,
} as const;

// Summary select — used for list views.
const JOB_SUMMARY_SELECT = {
  id:                  true,
  title:               true,
  category:            true,
  subcategory:         true,
  urgency:             true,
  shiftType:           true,
  durationType:        true,
  isRecurring:         true,
  suburb:              true,
  state:               true,
  serviceDeliveryMode: true,
  scheduledStartAt:    true,
  scheduledEndAt:      true,
  totalHours:          true,
  budgetPerHour:       true,
  totalBudget:         true,
  budgetType:          true,
  fundingType:         true,
  visibilityTarget:    true,
  hideParticipantName: true,
  createdAt:           true,
  status:              true,
} as const;

const CONTACT_VISIBLE_STATUSES: JobStatus[] = ["ASSIGNED", "IN_PROGRESS", "COMPLETED", "CONFIRMED"];

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

// ─── Create job ───────────────────────────────────────────────────────────────

export async function createJob(
  posterId: string,
  activeRole: UserRole,
  input: CreateJobInput,
) {
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
    if (input.forParticipantUserId) {
      const participant = await prisma.user.findUnique({
        where: { id: input.forParticipantUserId },
        include: { roles: true },
      });
      if (!participant) throw new NotFoundError("Participant not found");
      if (!participant.roles.some((r) => r.role === "PARTICIPANT")) {
        throw new BadRequestError("That user is not a participant");
      }
      if (participant.parentUserId && participant.parentUserId !== posterId) {
        throw new ForbiddenError("That participant is managed by a different coordinator");
      }
      forParticipantUserId = input.forParticipantUserId;

    } else if (input.inlineParticipant) {
      const { name, phone, suburb } = input.inlineParticipant;
      const newParticipant = await prisma.user.create({
        data: {
          name,
          phone:        phone ?? null,
          accountType:  "MANAGED",
          status:       "ACTIVE",
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
      forParticipantUserId = posterId;
    }
  }

  const status: JobStatus = input.asDraft ? "DRAFT" : "OPEN";

  return prisma.supportRequest.create({
    data: {
      postedByUserId:       posterId,
      forParticipantUserId,
      // Step 1
      title:                input.title,
      description:          input.description ?? "",
      category:             input.category as JobCategory,
      subcategory:          input.subcategory ?? null,
      supportGoal:          input.supportGoal ?? null,
      durationType:         input.durationType ?? null,
      participantPostedAs:  input.participantPostedAs ?? null,
      // Step 2
      urgency:              (input.urgency ?? "SCHEDULED") as JobUrgency,
      shiftType:            input.shiftType ? (input.shiftType as ShiftType) : null,
      timeFlexibility:      input.timeFlexibility ?? null,
      scheduledStartAt:     new Date(input.scheduledStartAt),
      scheduledEndAt:       new Date(input.scheduledEndAt),
      totalHours:           input.totalHours ?? null,
      isRecurring:          input.isRecurring ?? false,
      recurrencePattern:    input.recurrencePattern ? (input.recurrencePattern as Prisma.InputJsonValue) : undefined,
      applicationDeadlineAt: input.applicationDeadlineAt ? new Date(input.applicationDeadlineAt) : null,
      // Step 3
      suburb:               input.suburb,
      state:                input.state,
      postcode:             input.postcode ?? null,
      addressLine:          input.addressLine ?? null,
      serviceDeliveryMode:  input.serviceDeliveryMode ?? null,
      locationNotes:        input.locationNotes ?? null,
      lat:                  input.lat ?? null,
      lng:                  input.lng ?? null,
      travelRequired:       input.travelRequired ?? null,
      // Step 6
      fundingType:          input.fundingType ? (input.fundingType as FundingType) : null,
      budgetType:           input.budgetType ?? null,
      budgetPerHour:        input.budgetPerHour ?? null,
      totalBudget:          input.totalBudget ?? null,
      travelReimbursement:  input.travelReimbursement ?? null,
      // Step 7
      visibilityTarget:     input.visibilityTarget ?? "ALL",
      maxApplicants:        input.maxApplicants ?? null,
      hideParticipantName:  input.hideParticipantName ?? false,
      allowQuotes:          input.allowQuotes ?? false,
      allowDirectMessages:  input.allowDirectMessages ?? true,
      // Coordinator extras
      workerPreferences:
  input.workerPreferences
    ? (input.workerPreferences as Prisma.InputJsonValue)
    : undefined,
      internalNote:         input.internalNote ?? null,
      caseReference:        input.caseReference ?? null,
      requestPurposeCategory: input.requestPurposeCategory ?? null,
      status,
    },
    select: JOB_WRITE_SELECT,
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
    select: JOB_WRITE_SELECT,
  });
}

// ─── List jobs (role-based, with spec filters) ────────────────────────────────

export async function listJobs(
  userId: string,
  activeRole: UserRole,
  filters: JobFiltersInput,
) {
  const {
    suburb, state, category, urgency, status, shiftType, fundingType,
    isRecurring, visibilityTarget, startFrom, startTo, postedWithinHours,
    postedByRole, page, limit, sortBy,
  } = filters;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};

  // ── Text / location ──────────────────────────────────────────────────────
  if (suburb) where.suburb = { contains: suburb, mode: "insensitive" };
  if (state)  where.state  = { contains: state,  mode: "insensitive" };

  // ── Category / type filters ──────────────────────────────────────────────
  if (category)    where.category    = category;
  if (urgency)     where.urgency     = urgency;
  if (shiftType)   where.shiftType   = shiftType;
  if (fundingType) where.fundingType = fundingType;
  if (typeof isRecurring === "boolean") where.isRecurring = isRecurring;

  // ── Date window ──────────────────────────────────────────────────────────
  if (startFrom || startTo) {
    where.scheduledStartAt = {
      ...(startFrom ? { gte: new Date(startFrom) } : {}),
      ...(startTo   ? { lte: new Date(startTo) }   : {}),
    };
  }
  if (postedWithinHours) {
    const cutoff = new Date(Date.now() - postedWithinHours * 60 * 60 * 1000);
    where.createdAt = { gte: cutoff };
  }

  // ── Poster role filter ───────────────────────────────────────────────────
  if (postedByRole) {
    where.postedBy = { roles: { some: { role: postedByRole } } };
  }

  // ── Role-based scoping ───────────────────────────────────────────────────
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
      where.status = status ?? "OPEN";
      // Only show posts the worker can see
      where.OR = [
        { visibilityTarget: "ALL" },
        { visibilityTarget: "VERIFIED" },
        { visibilityTarget: "WORKERS_ONLY" },
        { visibilityTarget: null },
      ];
      break;

    case "PROVIDER":
      where.status = status ?? "OPEN";
      where.OR = [
        { visibilityTarget: "ALL" },
        { visibilityTarget: "VERIFIED" },
        { visibilityTarget: "PROVIDERS_ONLY" },
        { visibilityTarget: null },
      ];
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

  // ── Visibility override if caller passed it explicitly ───────────────────
  if (visibilityTarget && (activeRole === "ADMIN" || activeRole === "COORDINATOR")) {
    where.visibilityTarget = visibilityTarget;
  }

  // ── Sort ─────────────────────────────────────────────────────────────────
  const orderBy: Record<string, string>[] =
    sortBy === "newest"    ? [{ createdAt: "desc" }]
    : sortBy === "startDate" ? [{ scheduledStartAt: "asc" }]
    : sortBy === "bestMatch" ? [{ urgency: "asc" }, { scheduledStartAt: "asc" }]
    : /* urgency (default) */ [{ urgency: "asc" }, { scheduledStartAt: "asc" }];

  const [rawJobs, total] = await Promise.all([
    prisma.supportRequest.findMany({
      where:   where as any,
      skip,
      take:    limit,
      orderBy: orderBy as any,
      select:  {
        ...JOB_SUMMARY_SELECT,
        // Include own application status for workers/providers
        applications: {
          where:  { applicantUserId: userId },
          select: { id: true, status: true },
          take:   1,
        },
        _count: { select: { applications: true } },
      },
    }),
    prisma.supportRequest.count({ where: where as any }),
  ]);

  const jobs = rawJobs.map(({ applications, createdAt, totalHours, ...rest }) => ({
    ...rest,
    postedAt:       createdAt,
    estimatedHours: totalHours,
    ownApplication: applications[0] ?? null,
  }));

  return { jobs, total, page, limit, pages: Math.ceil(total / limit) };
}

// ─── My jobs ─────────────────────────────────────────────────────────────────

export async function listMyJobs(userId: string, activeRole: UserRole, status?: string) {
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

    case "PROVIDER": {
      const teamWorkerIds = (
        await prisma.user.findMany({
          where: { parentUserId: userId },
          select: { id: true },
        })
      ).map((u) => u.id);

      where.OR = [
        { postedByUserId: userId },
        { selectedApplicantUserId: userId },
        { applications: { some: { applicantUserId: userId } } },
        ...(teamWorkerIds.length > 0
          ? [{ assignedWorkerUserId: { in: teamWorkerIds } }]
          : []),
      ];
      break;
    }

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
    where:   where as any,
    select:  JOB_SUMMARY_SELECT,
    orderBy: [{ scheduledStartAt: "desc" }],
    take:    100,
  });

  return {
    jobs: jobs.map(({ createdAt, totalHours, ...rest }) => ({
      ...rest,
      postedAt:      createdAt,
      totalHours,
    })),
  };
}

// ─── Get single job ───────────────────────────────────────────────────────────

export async function getJob(jobId: string, userId: string, activeRole: UserRole) {
  const job = await prisma.supportRequest.findUnique({
    where:   { id: jobId },
    include: JOB_DETAIL_INCLUDE,
  });
  requireJob(job, jobId);

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

  const participantContact = job!.forParticipantUserId
    ? await prisma.user.findUnique({
        where:  { id: job!.forParticipantUserId },
        select: { phone: true, email: true },
      })
    : null;

  return withContactDetails(job!, userId, participantContact);
}

// ─── Cancel ──────────────────────────────────────────────────────────────────

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

  const hoursToStart =
    (new Date(job!.scheduledStartAt).getTime() - Date.now()) / (1000 * 60 * 60);
  const shouldPromote =
    job!.status === "ASSIGNED" && hoursToStart > 0 && hoursToStart <= 4;

  if (shouldPromote) {
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
        fundingType:             job!.fundingType ?? undefined,
        budgetType:              job!.budgetType ?? undefined,
        budgetPerHour:           job!.budgetPerHour ?? undefined,
        totalBudget:             job!.totalBudget ?? undefined,
        visibilityTarget:        job!.visibilityTarget ?? undefined,
        workerPreferences:       job!.workerPreferences ?? undefined,
        promotedFromCancellation: true,
      },
    });

    void notify.sendPushNotification(
      userId,
      "Job rescheduled as EMERGENCY",
      `Your job "${job!.title}" was reposted as an emergency shift.`,
      { promotedJobId: promoted.id },
      "JOB_PROMOTED_EMERGENCY",
    );

    return { cancelled: job, promoted };
  }

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

// ─── Apply (structured proposal) ─────────────────────────────────────────────

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

  // Max applicants cap (spec: allow poster to limit)
  if (job!.maxApplicants) {
    const count = await prisma.jobApplication.count({
      where: { jobId, status: { not: "WITHDRAWN" } },
    });
    if (count >= job!.maxApplicants) {
      throw new BadRequestError("This request is no longer accepting applications");
    }
  }

  // Incomplete worker profile cap: max 1 active application
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

  const applicationPayload = {
    status:           "INTERESTED" as const,
    note:             input.note ?? null,
    availabilityType: input.availabilityType ?? null,
    rateResponse:     input.rateResponse ?? null,
    proposedRate:     input.proposedRate ?? null,
    introduction:     input.introduction ?? null,
    applicationData:  (input.applicationData ?? undefined) as any,
  };

  const app = existing
    ? await prisma.jobApplication.update({
        where: { id: existing.id },
        data:  applicationPayload,
      })
    : await prisma.jobApplication.create({
        data: {
          jobId,
          applicantUserId: applicantId,
          applicantRole:   activeRole,
          ...applicationPayload,
        },
      });

  void notify.sendPushNotification(
    job!.postedByUserId,
    "New application received",
    `Someone expressed interest in "${job!.title}"`,
    { jobId, applicationId: app.id },
    "JOB_APPLICATION_RECEIVED",
  );

  return app;
}

// ─── List applications ────────────────────────────────────────────────────────

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

// ─── Select applicant ─────────────────────────────────────────────────────────

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

  void notify.sendPushNotification(
    app.applicantUserId,
    "You've been selected!",
    `You were selected for "${job!.title}"`,
    { jobId },
    "JOB_SELECTED",
  );

  return prisma.supportRequest.findUnique({ where: { id: jobId }, select: JOB_WRITE_SELECT });
}

// ─── Assign worker (provider → their team member) ────────────────────────────

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
    select: JOB_WRITE_SELECT,
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

// ─── Start / Complete / Confirm ───────────────────────────────────────────────

export async function startJob(jobId: string, userId: string) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);
  if (job!.selectedApplicantUserId !== userId && job!.assignedWorkerUserId !== userId) {
    throw new ForbiddenError("Only the selected worker/provider can start this job");
  }
  if (job!.status !== "ASSIGNED") {
    throw new BadRequestError(`Job must be ASSIGNED to start (current: ${job!.status})`);
  }
  const updated = await prisma.supportRequest.update({
    where: { id: jobId },
    data:  { status: "IN_PROGRESS", startedAt: new Date() },
    select: JOB_WRITE_SELECT,
  });
  void notify.sendPushNotification(
    job!.postedByUserId, "Job started",
    `"${job!.title}" is now in progress`, { jobId }, "JOB_STARTED",
  );
  return updated;
}

export async function completeJob(jobId: string, userId: string) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);
  if (job!.selectedApplicantUserId !== userId && job!.assignedWorkerUserId !== userId) {
    throw new ForbiddenError("Only the assigned worker/provider can mark this job complete");
  }
  if (job!.status !== "IN_PROGRESS") {
    throw new BadRequestError(`Job must be IN_PROGRESS to complete (current: ${job!.status})`);
  }
  const updated = await prisma.supportRequest.update({
    where: { id: jobId },
    data:  { status: "COMPLETED", completedAt: new Date() },
    select: JOB_WRITE_SELECT,
  });
  void notify.sendPushNotification(
    job!.postedByUserId, "Job marked complete",
    `"${job!.title}" has been marked complete — please confirm`, { jobId }, "JOB_COMPLETED",
  );
  return updated;
}

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
    select: JOB_WRITE_SELECT,
  });
  const recipientId = job!.assignedWorkerUserId ?? job!.selectedApplicantUserId;
  if (recipientId) {
    void notify.sendPushNotification(
      recipientId, "Job confirmed",
      `"${job!.title}" has been confirmed by the poster`, { jobId }, "JOB_CONFIRMED",
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

export async function listInvoices(userId: string, activeRole: UserRole) {
  const where: Record<string, unknown> = {};
  switch (activeRole) {
    case "PLAN_MANAGER":  where.planManagerUserId = userId; break;
    case "COORDINATOR":
    case "PROVIDER":
    case "SUPPORT_WORKER": where.senderUserId = userId; break;
    case "PARTICIPANT":   where.participantUserId = userId; break;
    default:              where.senderUserId = userId;
  }
  return prisma.invoice.findMany({
    where,
    include: {
      sender:      { select: { id: true, name: true } },
      planManager: { select: { id: true, name: true } },
      participant: { select: { id: true, name: true } },
      job:         { select: { id: true, title: true, status: true } },
    },
    orderBy: { sentAt: "desc" },
  });
}
