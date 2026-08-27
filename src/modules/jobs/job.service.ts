import { randomUUID } from "crypto";
import { prisma } from "../../lib/prisma";
import {
  ApiError,
  NotFoundError,
  ForbiddenError,
  BadRequestError,
  ConflictError,
} from "../../lib/errors";
import { notify } from "../../lib/notify";
import { canAccessMarketplace, missingRequiredDocs } from "../../middleware/marketplace.middleware";
import { subscriptionGated, getActiveBasePlanKey, hasUnconsumedShiftPass, consumeShiftPass } from "../subscriptions/subscription.service";
import { computeApplicationScore, EXPERIENCE_LEVEL_RANK } from "./job-scoring";
import { notifyMatchingSavedSearches } from "../saved-searches/saved-search.service";
import { assertCoordinatorPermission } from "../coordinator-connections/coordinator-connection.service";
import { isBlockedFromMessaging } from "../users/block.service";
import type { UserRole, JobCategory, JobUrgency, JobStatus } from "@prisma/client";
import { ShiftType, FundingType } from "@prisma/client";
import type {
  CreateJobInput,
  JobFiltersInput,
  LiveDashboardFiltersInput,
  ApplyJobInput,
  CancelJobInput,
  AssignWorkerInput,
  SendMessageInput,
  CreateInvoiceInput,
  CreateReplacementInput,
  ProposeMeetAndGreetInput,
  RespondMeetAndGreetInput,
  CreateChangeRequestInput,
  RespondChangeRequestInput,
  CloseConnectionInput,
  NotifyRunningLateInput,
  SaveWorkerNoteInput,
  BookmarkJobInput,
  UpdateDraftJobInput,
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
    include: {
      applicant: {
        select: {
          id: true, name: true, avatarUrl: true,
          workerProfile: {
            select: { rating: true, totalReviews: true, hourlyRate: true, servicesOffered: true, experienceLevel: true, suburb: true, state: true, travelRadiusKm: true },
          },
          providerProfile: {
            select: { averageRating: true, totalRatings: true, coreServices: true },
          },
        },
      },
    },
    orderBy: { score: "desc" as const },
    take: 10,
  },
  _count: { select: { messages: true, applications: true } },
  meetAndGreets: {
    include: { proposedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" as const },
  },
  changeRequests: {
    include: { requestedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" as const },
  },
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
  workerConfirmedAt:       true,
  updatedAt:               true,
  closedOutcome:           true,
  closedReasonCategory:    true,
  closedFeedback:          true,
  closedAt:                true,
  runningLateNotifiedAt:   true,
  runningLateMinutes:      true,
} as const;

// workerPrivateNote is deliberately excluded from JOB_WRITE_SELECT (shared by
// poster-facing writes like assignWorker/cancelJob) — it must never be returned
// to anyone but the worker who wrote it. saveWorkerNote selects it explicitly.
const JOB_WRITE_SELECT_WITH_NOTE = { ...JOB_WRITE_SELECT, workerPrivateNote: true } as const;

// Summary select — used for list views.
const JOB_SUMMARY_SELECT = {
  id:                  true,
  title:               true,
  category:            true,
  subcategory:         true,
  workerPreferences:   true,
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
  forParticipantUserId: true,
  createdAt:           true,
  status:              true,
  featuredUntil:       true,
  applicationDeadlineAt: true,
} as const;

const CONTACT_VISIBLE_STATUSES: JobStatus[] = ["ASSIGNED", "IN_PROGRESS", "COMPLETED", "CONFIRMED"];

function withContactDetails<T extends {
  status: JobStatus;
  assignedWorkerUserId: string | null;
  selectedApplicantUserId: string | null;
  workerConfirmedAt: Date | null;
  postedByUserId: string;
  addressLine: string | null;
  hideParticipantName: boolean;
  forParticipant: { id: string; name: string; avatarUrl: string | null } | null;
  workerPrivateNote?: string | null;
}>(job: T, userId: string, participantContact: { phone: string | null; email: string | null } | null) {
  // The worker/provider "party" on a job is whichever of the two identity fields
  // is set — assignedWorkerUserId only gets set when a Provider hands the job to
  // one of their own team members; a directly-selected Support Worker only ever
  // has selectedApplicantUserId. Checking just one of the two silently locked a
  // directly-hired worker out of contact/address info forever.
  const workerPartyId = job.assignedWorkerUserId ?? job.selectedApplicantUserId;
  // Window 33 private note — only the worker who wrote it may ever read it back.
  const canSeeWorkerNote = workerPartyId === userId;

  // Address/contact release requires BOTH: the job reached an active status AND
  // the worker/provider explicitly accepted the assignment (mutual confirmation,
  // SC-M05/M06/M07) — a one-sided "selected" state is never enough.
  const mutuallyConfirmed =
    CONTACT_VISIBLE_STATUSES.includes(job.status) && job.workerConfirmedAt !== null;

  const canSeeContact =
    job.postedByUserId === userId || (mutuallyConfirmed && workerPartyId === userId);

  // The poster always sees the address they entered; a worker/provider only
  // sees it once both sides have confirmed (suburb/state are shown separately
  // and are never redacted).
  const canSeeAddress = canSeeContact;

  // SW doc §4-5 — a poster can opt to keep the participant's name hidden until
  // the same mutual-confirmation point that already gates address/contact.
  // `hideParticipantName` was previously stored and surfaced in list views but
  // never enforced anywhere — it had no effect on what a worker actually saw.
  const shouldMaskName = job.hideParticipantName && !canSeeContact;

  return {
    ...job,
    addressLine: canSeeAddress ? job.addressLine : null,
    workerPrivateNote: canSeeWorkerNote ? (job.workerPrivateNote ?? null) : null,
    forParticipant: job.forParticipant
      ? {
          ...job.forParticipant,
          ...(shouldMaskName ? { name: "NDIS Participant" } : {}),
          ...(canSeeContact && participantContact
            ? { phone: participantContact.phone, email: participantContact.email }
            : {}),
        }
      : null,
  };
}

function requireJob(job: { status: JobStatus } | null, jobId: string) {
  if (!job) throw new NotFoundError("We couldn't find that job. It may have been removed.");
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

  // Subscription gate (#51/#52) — coordinators need an active plan; participants are free.
  // Pricing V2 §2/§6 — once a Coordinator's first 10 introductory chargeable
  // actions (lifetime, no expiry) are used up, a free-tier plan needs either a
  // paid subscription or an unconsumed Single Shift Pass to post again.
  let shiftPassToConsume = false;
  if (activeRole === "COORDINATOR") {
    if (!(await subscriptionGated(posterId, activeRole))) {
      throw new ApiError(
        403,
        "SUBSCRIPTION_REQUIRED",
        "An active subscription is required to post jobs. Choose a plan on the Subscription page to continue.",
      );
    }
    const planKey = await getActiveBasePlanKey(posterId, activeRole);
    if (planKey?.endsWith("_FREE")) {
      const coordProfile = await prisma.coordinatorProfile.findUnique({
        where: { userId: posterId },
        select: { introductoryActionsUsed: true },
      });
      const introUsed = coordProfile?.introductoryActionsUsed ?? 0;
      if (introUsed >= 10) {
        if (!(await hasUnconsumedShiftPass(posterId, activeRole))) {
          throw new ApiError(
            403,
            "SUBSCRIPTION_LIMIT",
            "You've used your 10 introductory job posts. Subscribe to a plan or purchase a Single Shift Pass to post more.",
          );
        }
        shiftPassToConsume = true;
      }
    }
  }

  let forParticipantUserId: string;

  if (activeRole === "PARTICIPANT" && !input.forParticipantUserId && !input.inlineParticipant) {
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
      if (participant.parentUserId !== posterId) {
        // Not a MANAGED account under this coordinator — fall back to checking
        // whether this is an INDEPENDENT participant who's connected and granted
        // posting permission (CoordinatorParticipantConnection.canPostRequests).
        if (activeRole === "COORDINATOR") {
          await assertCoordinatorPermission(posterId, input.forParticipantUserId, "canPostRequests");
        } else {
          throw new ForbiddenError("You can only post for a participant you manage");
        }
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
      throw new BadRequestError(
        "Please select which participant this job is for.",
      );
    }
  }

  const status: JobStatus = input.asDraft ? "DRAFT" : "OPEN";

  const created = await prisma.supportRequest.create({
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
      selectedTasks:
  input.selectedTasks
    ? (input.selectedTasks as Prisma.InputJsonValue)
    : undefined,
      internalNote:         input.internalNote ?? null,
      caseReference:        input.caseReference ?? null,
      requestPurposeCategory: input.requestPurposeCategory ?? null,
      // Step 4 (safety-critical)
      riskSafetyNotes:      input.riskSafetyNotes ?? null,
      medicalNotes:         input.medicalNotes ?? null,
      behaviourNotes:       input.behaviourNotes ?? null,
      safetyFlags:
  input.safetyFlags
    ? (input.safetyFlags as Prisma.InputJsonValue)
    : undefined,
      emergencyContactName:         input.emergencyContactName ?? null,
      emergencyContactPhone:        input.emergencyContactPhone ?? null,
      emergencyContactRelationship: input.emergencyContactRelationship ?? null,
      planManagerName:      input.planManagerName ?? null,
      contactPreferences:
  input.contactPreferences
    ? (input.contactPreferences as Prisma.InputJsonValue)
    : undefined,
      responsePreferences:
  input.responsePreferences
    ? (input.responsePreferences as Prisma.InputJsonValue)
    : undefined,
      status,
    },
    select: JOB_WRITE_SELECT,
  });

  if (activeRole === "COORDINATOR") {
    if (shiftPassToConsume) {
      await consumeShiftPass(posterId, activeRole, created.id);
    } else {
      await prisma.coordinatorProfile.updateMany({
        where: { userId: posterId, introductoryActionsUsed: { lt: 10 } },
        data:  { introductoryActionsUsed: { increment: 1 } },
      });
    }
  }

  return created;
}

// ─── Publish a draft ─────────────────────────────────────────────────────────

export async function publishJob(jobId: string, posterId: string) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);
  if (job!.postedByUserId !== posterId) throw new ForbiddenError("Only the poster can publish this job");
  if (job!.status !== "DRAFT") throw new BadRequestError("Only a draft job can be published.");
  const published = await prisma.supportRequest.update({
    where: { id: jobId },
    data:  { status: "OPEN" },
    select: JOB_WRITE_SELECT,
  });

  // Best-effort — a notify bug should never block the publish itself.
  notifyMatchingSavedSearches(job!).catch((err) =>
    console.error("[saved-search] notify failed:", err),
  );

  return published;
}

// ─── List jobs (role-based, with spec filters) ────────────────────────────────

// SW doc §4-5 profile-match indicator. Only the two fields with a real,
// typed value-space shared between SupportRequest and WorkerProfile are
// compared — job.category (JobCategory enum, identical strings to
// WorkerProfile.servicesOffered) and workerPreferences.experienceLevel (the
// same BEGINNER..EXPERT enum as WorkerProfile.experienceLevel, per the
// existing client-side filter in Web/app/(dashboard)/jobs/page.tsx).
// workerPreferences/selectedTasks/safetyFlags are otherwise untyped JSON
// blobs with no fixed key contract, so they're deliberately not used here —
// guessing at their shape would produce a "match" indicator that's just noise.
function computeMatchSummary(
  job: { category: JobCategory; workerPreferences: unknown },
  worker: { servicesOffered: unknown; experienceLevel: string | null },
): { met: string[]; missing: string[] } {
  const met: string[] = [];
  const missing: string[] = [];

  const servicesOffered = Array.isArray(worker.servicesOffered) ? worker.servicesOffered : [];
  if (servicesOffered.includes(job.category)) {
    met.push("Service category");
  } else {
    missing.push("Service category");
  }

  const requiredLevel = (job.workerPreferences as { experienceLevel?: string } | null)?.experienceLevel;
  if (requiredLevel && requiredLevel in EXPERIENCE_LEVEL_RANK) {
    const workerRank = EXPERIENCE_LEVEL_RANK[worker.experienceLevel ?? ""] ?? -1;
    if (workerRank >= EXPERIENCE_LEVEL_RANK[requiredLevel]) {
      met.push("Experience level");
    } else {
      missing.push("Experience level");
    }
  }

  return { met, missing };
}

export async function listJobs(
  userId: string,
  activeRole: UserRole,
  filters: JobFiltersInput,
) {
  const {
    suburb, state, category, urgency, status, shiftType, fundingType,
    isRecurring, visibilityTarget, startFrom, startTo, postedWithinHours,
    postedByRole, page, limit, sortBy, savedOnly, includeHidden,
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
      // SW doc Windows 16-17 — Saved tab / hidden-jobs handling
      if (savedOnly) {
        where.bookmarks = { some: { workerUserId: userId, saved: true } };
      } else if (!includeHidden) {
        where.bookmarks = { none: { workerUserId: userId, hidden: true } };
      }
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
  // Featured Shift (Pricing V2 §8) only pins within its own urgency tier — a
  // paid promotion must never outrank a genuinely more urgent, unpaid post.
  const orderBy: Record<string, string>[] =
    sortBy === "newest"    ? [{ featuredUntil: "desc" }, { createdAt: "desc" }]
    : sortBy === "startDate" ? [{ scheduledStartAt: "asc" }]
    : sortBy === "bestMatch" ? [{ urgency: "asc" }, { featuredUntil: "desc" }, { scheduledStartAt: "asc" }]
    : /* urgency (default) */ [{ urgency: "asc" }, { featuredUntil: "desc" }, { scheduledStartAt: "asc" }];

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
        bookmarks: {
          where:  { workerUserId: userId },
          select: { saved: true, hidden: true },
          take:   1,
        },
        _count: { select: { applications: true } },
      },
    }),
    prisma.supportRequest.count({ where: where as any }),
  ]);

  // SW doc §4-5 — only meaningful for the browsing worker's own profile.
  const workerSelf = activeRole === "SUPPORT_WORKER"
    ? await prisma.workerProfile.findUnique({
        where:  { userId },
        select: { servicesOffered: true, experienceLevel: true },
      })
    : null;

  const jobs = rawJobs.map(({ applications, bookmarks, createdAt, totalHours, ...rest }) => ({
    ...rest,
    postedAt:       createdAt,
    estimatedHours: totalHours,
    ownApplication: applications[0] ?? null,
    saved:          bookmarks?.[0]?.saved ?? false,
    hidden:         bookmarks?.[0]?.hidden ?? false,
    matchSummary:   workerSelf ? computeMatchSummary(rest, workerSelf) : undefined,
  }));

  return { jobs, total, page, limit, pages: Math.ceil(total / limit) };
}

// ─── Live Dashboard (universal cross-role board) ──────────────────────────────
// Deliberately NOT built on top of listJobs()/its `where` construction above —
// that function's role-based scoping is a `switch` that also backs Coordinator's
// "Urgent Requests" (own-posted-only) and other ownership-scoped call sites.
// The Live Dashboard's whole point is to drop that ownership scoping (every
// role sees every open job, not just their own), so it needs its own `where`
// logic to avoid ever leaking the universal behavior into those existing paths.
// It DOES still apply the same visibilityTarget gate listJobs() uses for
// Worker/Provider viewers — the Live Dashboard removes ownership scoping, not
// the Workers-only/Providers-only restriction (confirmed decision, see plan).
export async function listLiveDashboardJobs(
  userId: string,
  activeRole: UserRole,
  filters: LiveDashboardFiltersInput,
) {
  const {
    suburb, state, category, urgency, shiftType, fundingType,
    isRecurring, startFrom, startTo, postedWithinHours,
    postedByRole, page, limit, sortBy,
  } = filters;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { status: "OPEN" };

  if (suburb) where.suburb = { contains: suburb, mode: "insensitive" };
  if (state)  where.state  = { contains: state,  mode: "insensitive" };

  if (category)    where.category    = category;
  if (urgency)     where.urgency     = urgency;
  if (shiftType)   where.shiftType   = shiftType;
  if (fundingType) where.fundingType = fundingType;
  if (typeof isRecurring === "boolean") where.isRecurring = isRecurring;

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

  if (postedByRole) {
    where.postedBy = { roles: { some: { role: postedByRole } } };
  }

  if (activeRole === "SUPPORT_WORKER") {
    where.OR = [
      { visibilityTarget: "ALL" },
      { visibilityTarget: "VERIFIED" },
      { visibilityTarget: "WORKERS_ONLY" },
      { visibilityTarget: null },
    ];
  } else if (activeRole === "PROVIDER") {
    where.OR = [
      { visibilityTarget: "ALL" },
      { visibilityTarget: "VERIFIED" },
      { visibilityTarget: "PROVIDERS_ONLY" },
      { visibilityTarget: null },
    ];
  }
  // Participant/Coordinator/Plan Manager/Admin viewers: no visibilityTarget
  // filter — that flag was never meant to restrict those roles.

  const orderBy: Record<string, string>[] =
    sortBy === "newest"    ? [{ featuredUntil: "desc" }, { createdAt: "desc" }]
    : sortBy === "startDate" ? [{ scheduledStartAt: "asc" }]
    : /* urgency/bestMatch (default) */ [{ urgency: "asc" }, { featuredUntil: "desc" }, { scheduledStartAt: "asc" }];

  const [rawJobs, total] = await Promise.all([
    prisma.supportRequest.findMany({
      where:   where as any,
      skip,
      take:    limit,
      orderBy: orderBy as any,
      select:  {
        ...JOB_SUMMARY_SELECT,
        postedByUserId: true,
        _count: { select: { applications: true } },
      },
    }),
    prisma.supportRequest.count({ where: where as any }),
  ]);

  const jobs = rawJobs.map(({ createdAt, totalHours, ...rest }) => ({
    ...rest,
    postedAt:       createdAt,
    estimatedHours: totalHours,
    isOwnRequest:   rest.postedByUserId === userId,
  }));

  return { jobs, total, page, limit, pages: Math.ceil(total / limit) };
}

// ─── My jobs ─────────────────────────────────────────────────────────────────

// Shared role-scoping for "jobs I'm involved in" — used by both listMyJobs
// and listMessageThreads (a message thread only ever exists on a job the
// caller is already a party to, so the same scoping applies).
async function buildMyJobsWhere(userId: string, activeRole: UserRole, status?: string) {
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

  return where;
}

export async function listMyJobs(userId: string, activeRole: UserRole, status?: string) {
  const where = await buildMyJobsWhere(userId, activeRole, status);

  const jobs = await prisma.supportRequest.findMany({
    where:   where as any,
    select:  { ...JOB_SUMMARY_SELECT, _count: { select: { applications: true } } },
    orderBy: [{ scheduledStartAt: "desc" }],
    take:    100,
  });

  return {
    jobs: jobs.map(({ createdAt, totalHours, _count, ...rest }) => ({
      ...rest,
      postedAt:      createdAt,
      totalHours,
      _count,
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
    throw new NotFoundError("We couldn't find that job. It may have been removed.");
  }

  if (activeRole === "SUPPORT_WORKER" || activeRole === "PROVIDER") {
    const hasApp = job!.applications.some((a) => a.applicantUserId === userId);
    if (
      job!.status !== "OPEN" &&
      !hasApp &&
      job!.selectedApplicantUserId !== userId &&
      job!.assignedWorkerUserId !== userId
    ) {
      throw new ForbiddenError("You don't have access to view this job.");
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

// #65 — attribute a cancellation to the right reliability counter. Only runs
// when the job already had a selected/assigned counterparty (ASSIGNED or
// IN_PROGRESS). Client-side cancels count against the assigned worker/provider
// profile as totalCancelledByClient; worker/provider-initiated cancels count
// on the canceller's own profile as totalCancelledByWorker.
async function attributeCancellation(
  job: { status: JobStatus; selectedApplicantUserId: string | null; assignedWorkerUserId: string | null },
  cancellerUserId: string,
  cancellerRole: UserRole,
): Promise<void> {
  if (!["ASSIGNED", "IN_PROGRESS"].includes(job.status)) return;
  const workerSide = cancellerRole === "SUPPORT_WORKER" || cancellerRole === "PROVIDER";
  const field = workerSide ? "totalCancelledByWorker" : "totalCancelledByClient";
  const targetUserId = workerSide
    ? cancellerUserId
    : (job.assignedWorkerUserId ?? job.selectedApplicantUserId);
  if (!targetUserId) return;
  await Promise.all([
    (prisma as any).workerProfile.updateMany({ where: { userId: targetUserId }, data: { [field]: { increment: 1 } } }),
    (prisma as any).providerProfile.updateMany({ where: { userId: targetUserId }, data: { [field]: { increment: 1 } } }),
  ]);
}

export async function cancelJob(
  jobId: string,
  userId: string,
  activeRole: UserRole,
  input: CancelJobInput,
) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);
  if (job!.postedByUserId !== userId) throw new ForbiddenError("Only the poster can cancel");
  if (["COMPLETED","CONFIRMED","CANCELLED"].includes(job!.status)) {
    throw new BadRequestError("This job can no longer be cancelled — it's already finished or was cancelled before.");
  }

  // #65 — reliability attribution (before status flips)
  await attributeCancellation(job!, userId, activeRole);

  const hoursToStart =
    (new Date(job!.scheduledStartAt).getTime() - Date.now()) / (1000 * 60 * 60);
  const shouldPromote =
    job!.status === "ASSIGNED" && hoursToStart > 0 && hoursToStart <= 4;

  if (shouldPromote) {
    await prisma.$transaction([
      prisma.supportRequest.update({
        where: { id: jobId },
        data: {
          status:               "CANCELLED",
          cancelledAt:          new Date(),
          cancelledByUserId:    userId,
          cancelledByRole:      activeRole,
          cancelReason:         input.reason ?? null,
          cancelReasonCategory: input.reasonCategory ?? null,
          notifyReplacements:   input.notifyReplacements ?? false,
        },
      }),
      prisma.jobApplication.updateMany({
        where: { jobId },
        data:  { status: "DECLINED" },
      }),
    ]);

    const promoted = await prisma.supportRequest.create({
      data: cloneJobForReplacement(job!, { titlePrefix: "[EMERGENCY] ", urgency: "EMERGENCY", promotedFromCancellation: true }),
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
        status:               "CANCELLED",
        cancelledAt:          new Date(),
        cancelledByUserId:    userId,
        cancelledByRole:      activeRole,
        cancelReason:         input.reason ?? null,
        cancelReasonCategory: input.reasonCategory ?? null,
        notifyReplacements:   input.notifyReplacements ?? false,
      },
    }),
    prisma.jobApplication.updateMany({
      where: { jobId },
      data:  { status: "DECLINED" },
    }),
  ]);

  // SW doc Window 35 "Notify suitable replacement workers: Yes" — the
  // job wasn't already auto-promoted (that only happens inside 4 hours of
  // start), so open a fresh replacement request at the original urgency and
  // alert any saved search that matches it, reusing the same clone shape the
  // near-start auto-promotion path above already relies on.
  let replacement = null;
  if (input.notifyReplacements) {
    replacement = await prisma.supportRequest.create({
      data: cloneJobForReplacement(job!, { titlePrefix: "[REPLACEMENT] ", urgency: job!.urgency, promotedFromCancellation: true }),
    });
    void notifyMatchingSavedSearches({
      id:          replacement.id,
      title:       replacement.title,
      suburb:      replacement.suburb,
      state:       replacement.state,
      category:    replacement.category,
      urgency:     replacement.urgency,
      shiftType:   replacement.shiftType,
      fundingType: replacement.fundingType,
      isRecurring: replacement.isRecurring,
    });
    void reinvitePreviousApplicants(jobId, replacement.id, userId).catch((err) =>
      console.error("[replacement] re-invite previous applicants failed:", err),
    );
  }

  return { cancelled: await prisma.supportRequest.findUnique({ where: { id: jobId } }), promoted: replacement };
}

// ─── Decline a confirmed selection (SW doc Window 30 "Decline") ───────────────
// The worker was selected but hasn't accepted yet — unlike withdrawApplication
// (blocked once SELECTED), this exists specifically to let the selected worker
// back out at the confirmation step, reopening the job for the poster.

export async function declineAssignment(jobId: string, userId: string) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);
  if (job!.selectedApplicantUserId !== userId) {
    throw new ForbiddenError("Only the selected worker/provider can decline this assignment");
  }
  if (job!.status !== "ASSIGNED" || job!.workerConfirmedAt) {
    throw new BadRequestError("This assignment can no longer be declined.");
  }

  const app = await prisma.jobApplication.findUnique({
    where: { jobId_applicantUserId: { jobId, applicantUserId: userId } },
  });

  const updated = await prisma.$transaction([
    prisma.supportRequest.update({
      where: { id: jobId },
      data:  { status: "OPEN", selectedApplicantUserId: null, selectedAt: null },
      select: JOB_WRITE_SELECT,
    }),
    ...(app ? [prisma.jobApplication.update({ where: { id: app.id }, data: { status: "DECLINED" as const } })] : []),
  ]);

  void notify.sendPushNotification(
    job!.postedByUserId,
    "Worker declined the confirmed support",
    `The selected worker/provider declined "${job!.title}" — it's open again.`,
    { jobId },
    "JOB_ASSIGNMENT_DECLINED",
  );

  return updated[0];
}

// Shared clone shape — used by cancelJob's automatic emergency promotion above
// and by createReplacementRequest's manual "Find Replacement" flow below, so
// the two paths can't diverge on which fields carry over from the original job.
function cloneJobForReplacement(
  job: {
    postedByUserId: string; forParticipantUserId: string; title: string; description: string;
    category: JobCategory; subcategory: string | null; suburb: string; state: string; postcode: string | null;
    serviceDeliveryMode: string | null; scheduledStartAt: Date; scheduledEndAt: Date; totalHours: unknown;
    fundingType: FundingType | null; budgetType: string | null; budgetPerHour: unknown; totalBudget: unknown;
    visibilityTarget: string | null; workerPreferences: unknown;
  },
  overrides: {
    titlePrefix?: string; urgency: JobUrgency; promotedFromCancellation?: boolean;
    scheduledStartAt?: Date; scheduledEndAt?: Date; totalHours?: number; status?: JobStatus;
  },
) {
  return {
    postedByUserId:           job.postedByUserId,
    forParticipantUserId:     job.forParticipantUserId,
    title:                    `${overrides.titlePrefix ?? ""}${job.title}`,
    description:              job.description,
    category:                 job.category,
    subcategory:              job.subcategory,
    urgency:                  overrides.urgency,
    status:                   overrides.status ?? ("OPEN" as const),
    suburb:                   job.suburb,
    state:                    job.state,
    postcode:                 job.postcode,
    serviceDeliveryMode:      job.serviceDeliveryMode,
    scheduledStartAt:         overrides.scheduledStartAt ?? job.scheduledStartAt,
    scheduledEndAt:           overrides.scheduledEndAt ?? job.scheduledEndAt,
    totalHours:               overrides.totalHours ?? (job.totalHours as number | undefined) ?? undefined,
    isRecurring:              false,
    fundingType:              job.fundingType ?? undefined,
    budgetType:               job.budgetType ?? undefined,
    budgetPerHour:            (job.budgetPerHour as number | undefined) ?? undefined,
    totalBudget:              (job.totalBudget as number | undefined) ?? undefined,
    visibilityTarget:         job.visibilityTarget ?? undefined,
    workerPreferences:        job.workerPreferences ?? undefined,
    promotedFromCancellation: overrides.promotedFromCancellation ?? false,
  };
}

// SW doc §11/X04 — a replacement request should also reach people who already
// showed interest in the original job, not just fresh saved-search matches.
// Free re-invite (amountAud: null) regardless of poster role — this is a
// system-generated follow-up on an existing application, not a new deliberate
// paid Direct Connect action.
async function reinvitePreviousApplicants(originalJobId: string, newJobId: string, posterId: string) {
  const priorApplicants = await prisma.jobApplication.findMany({
    where:    { jobId: originalJobId },
    select:   { applicantUserId: true },
    distinct: ["applicantUserId"],
  });

  for (const { applicantUserId } of priorApplicants) {
    try {
      const invite = await prisma.jobInvite.create({
        data: {
          jobId:           newJobId,
          invitedByUserId: posterId,
          invitedUserId:   applicantUserId,
          message:         "You previously applied to a request that needed a replacement — you're invited to this one.",
          amountAud:       null,
        },
      });
      void notify.sendPushNotification(
        applicantUserId,
        "Invited to a replacement request",
        "A request you previously applied to needs a replacement — you've been invited.",
        { jobInviteId: invite.id },
        "JOB_INVITE_RECEIVED",
      );
    } catch {
      // Already invited to this replacement (unique constraint) — not fatal, skip.
    }
  }
}

// ─── Manual replacement (outside the automatic 4-hour promotion window) ───────
// SC-04-05 — poster of a cancelled job can manually create a replacement
// request, reusing the original details or changing time/requirements/rate.

export async function createReplacementRequest(
  jobId: string,
  userId: string,
  activeRole: UserRole,
  input: CreateReplacementInput,
) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);
  if (job!.postedByUserId !== userId) throw new ForbiddenError("Only the poster can create a replacement request");
  if (job!.status !== "CANCELLED") throw new BadRequestError("Only a cancelled job can be replaced");

  const data = cloneJobForReplacement(job!, {
    urgency: input.urgency ?? job!.urgency,
    scheduledStartAt: input.scheduledStartAt ? new Date(input.scheduledStartAt) : undefined,
    scheduledEndAt: input.scheduledEndAt ? new Date(input.scheduledEndAt) : undefined,
    totalHours: input.totalHours,
  });
  if (input.budgetPerHour !== undefined) data.budgetPerHour = input.budgetPerHour;

  const created = await prisma.supportRequest.create({ data });

  void notifyMatchingSavedSearches({
    id:          created.id,
    title:       created.title,
    suburb:      created.suburb,
    state:       created.state,
    category:    created.category,
    urgency:     created.urgency,
    shiftType:   created.shiftType,
    fundingType: created.fundingType,
    isRecurring: created.isRecurring,
  });
  void reinvitePreviousApplicants(jobId, created.id, userId).catch((err) =>
    console.error("[replacement] re-invite previous applicants failed:", err),
  );

  return created;
}

// ─── Repeat previous request (participant portfolio "repeat" action) ──────────
// Any past job the caller posted can be duplicated into a new DRAFT, ready for
// them to review/adjust and publish — unlike createReplacementRequest above,
// this isn't limited to cancelled jobs.

export async function duplicateJob(jobId: string, userId: string) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);
  if (job!.postedByUserId !== userId) throw new ForbiddenError("Only the original poster can repeat this request");

  const data = cloneJobForReplacement(job!, { urgency: job!.urgency, status: "DRAFT" });
  return prisma.supportRequest.create({ data });
}

// SC-PT05 "Repeat support" — change date/time, service/tasks, requirements,
// funding/rate or convert-to-recurring on a still-DRAFT (not yet published)
// duplicated job, before the poster publishes it.

export async function updateDraftJob(
  jobId: string,
  posterId: string,
  input: UpdateDraftJobInput,
) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);
  if (job!.postedByUserId !== posterId) throw new ForbiddenError("Only the original poster can edit this request");
  if (job!.status !== "DRAFT") throw new BadRequestError("Only a draft request can be edited this way");

  const { scheduledStartAt, scheduledEndAt, recurrencePattern, ...rest } = input;
  return prisma.supportRequest.update({
    where: { id: jobId },
    data: {
      ...rest,
      ...(scheduledStartAt ? { scheduledStartAt: new Date(scheduledStartAt) } : {}),
      ...(scheduledEndAt ? { scheduledEndAt: new Date(scheduledEndAt) } : {}),
      ...(recurrencePattern ? { recurrencePattern: recurrencePattern as Prisma.InputJsonValue } : {}),
    },
  });
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

  // Subscription gate (#51/#52) — workers/providers need an active plan for their role.
  if (!(await subscriptionGated(applicantId, activeRole))) {
    throw new ApiError(
      403,
      "SUBSCRIPTION_REQUIRED",
      "An active subscription is required to apply for jobs. Choose a plan on the Subscription page to continue.",
    );
  }

  // SW journey doc §19 / Pricing V2 §2 — Support Worker Connect is framed as free
  // and unlimited, with no visible pending-application counter. Pricing V2's
  // commercial numbers are authoritative over the journey doc's wording (locked
  // decision, pricing-spec-v2-source-of-truth): 10 lifetime introductory Connect
  // actions, then a Shiftify Basic subscription or a $9.99 Single Shift Pass —
  // same mechanism as the Coordinator gate above, not a "pending applications" cap.
  let shiftPassToConsume = false;
  const applicantPlanKey = await getActiveBasePlanKey(applicantId, activeRole);
  if (activeRole === "SUPPORT_WORKER" && applicantPlanKey?.endsWith("_FREE")) {
    const wp = await prisma.workerProfile.findUnique({
      where: { userId: applicantId },
      select: { introductoryActionsUsed: true },
    });
    const introUsed = wp?.introductoryActionsUsed ?? 0;
    if (introUsed >= 10) {
      if (!(await hasUnconsumedShiftPass(applicantId, activeRole))) {
        throw new ApiError(
          403,
          "SUBSCRIPTION_LIMIT",
          "You've used your 10 introductory Connects. Subscribe to a plan or purchase a Single Shift Pass to Connect to more shifts.",
        );
      }
      shiftPassToConsume = true;
    }
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
          "Finish setting up your worker profile (your rights-to-work check and the services you offer) before applying to more than one job.",
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

  const score = await computeApplicationScore(
    applicantId,
    activeRole,
    input.proposedRate ?? null,
    job!.budgetPerHour != null ? Number(job!.budgetPerHour) : null,
  );

  const applicationPayload = {
    status:           "INTERESTED" as const,
    note:             input.note ?? null,
    availabilityType: input.availabilityType ?? null,
    rateResponse:     input.rateResponse ?? null,
    proposedRate:     input.proposedRate ?? null,
    introduction:     input.introduction ?? null,
    applicationData:  (input.applicationData ?? undefined) as any,
    score,
  };

  const isNewConnect = !existing || existing.status === "WITHDRAWN";

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

  if (isNewConnect && activeRole === "SUPPORT_WORKER") {
    if (shiftPassToConsume) {
      await consumeShiftPass(applicantId, activeRole, jobId);
    } else {
      await prisma.workerProfile.updateMany({
        where: { userId: applicantId, introductoryActionsUsed: { lt: 10 } },
        data:  { introductoryActionsUsed: { increment: 1 } },
      });
    }
  }

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
    // SW doc Window 27 "Request filled" — other applicants weren't personally
    // rejected, the job was simply filled by someone else. Kept distinct from
    // DECLINED ("Not proceeding"), which is reserved for declineApplicant's
    // explicit per-candidate rejection.
    prisma.jobApplication.updateMany({
      where: { jobId, id: { not: appId } },
      data:  { status: "REQUEST_FILLED" },
    }),
    prisma.jobApplication.update({ where: { id: appId }, data: { status: "SELECTED" } }),
    prisma.supportRequest.update({
      where: { id: jobId },
      data: {
        status:                  "ASSIGNED",
        selectedApplicantUserId: app.applicantUserId,
        selectedAt:              new Date(),
        // Featured Shift (Pricing V2 §8) pins until its tier duration OR job
        // fill, whichever is first — clear it now that the job is filled.
        featuredUntil:           null,
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

// ─── Featured Shift (Pricing V2 §8) ────────────────────────────────────────────
// Paid pin/label on one open job post, priced and duration-capped by the job's
// own urgency tier. RAPID/SAME_DAY/LAST_MINUTE/SCHEDULED map to the pricing
// doc's Rapid/Urgent/Last-Minute/Routine tiers (see jobs/my/page.tsx's own
// urgency-label mapping) — EMERGENCY/REPLACEMENT aren't sold as Featured Shift.

const FEATURED_SHIFT_CONFIG: Partial<Record<JobUrgency, { priceAud: number; durationMs: number }>> = {
  RAPID:       { priceAud: 19.99, durationMs: 60 * 60 * 1000 },
  SAME_DAY:    { priceAud: 14.99, durationMs: 24 * 60 * 60 * 1000 },
  LAST_MINUTE: { priceAud: 9.99,  durationMs: 48 * 60 * 60 * 1000 },
  SCHEDULED:   { priceAud: 21.99, durationMs: 7 * 24 * 60 * 60 * 1000 },
};

export async function purchaseFeaturedShift(jobId: string, purchasedByUserId: string) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);
  if (job!.postedByUserId !== purchasedByUserId) throw new ForbiddenError("Only the poster can feature this request");
  if (job!.status !== "OPEN") throw new BadRequestError("Only an open request can be featured");

  const config = FEATURED_SHIFT_CONFIG[job!.urgency];
  if (!config) throw new BadRequestError(`Featured Shift is not available for ${job!.urgency} requests`);

  const expiresAt = new Date(Date.now() + config.durationMs);
  const mockReceiptRef = `DEV-${randomUUID().toUpperCase()}`;

  const [purchase] = await prisma.$transaction([
    prisma.featuredShiftPurchase.create({
      data: {
        jobId, purchasedByUserId, tier: job!.urgency,
        priceAud: config.priceAud, expiresAt, mockReceiptRef,
      },
    }),
    prisma.supportRequest.update({ where: { id: jobId }, data: { featuredUntil: expiresAt } }),
  ]);

  return purchase;
}

// ─── Shortlist applicant ──────────────────────────────────────────────────────

export async function shortlistApplicant(jobId: string, appId: string, posterId: string) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);
  if (job!.postedByUserId !== posterId) throw new ForbiddenError("Only the poster can shortlist");

  const app = await prisma.jobApplication.findUnique({ where: { id: appId } });
  if (!app || app.jobId !== jobId) throw new NotFoundError("Application not found");
  if (app.status !== "INTERESTED") throw new BadRequestError("This application can no longer be shortlisted.");

  return prisma.jobApplication.update({ where: { id: appId }, data: { status: "SHORTLISTED" } });
}

// ─── Decline applicant ────────────────────────────────────────────────────────

export async function declineApplicant(jobId: string, appId: string, posterId: string) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);
  if (job!.postedByUserId !== posterId) throw new ForbiddenError("Only the poster can decline applicants");

  const app = await prisma.jobApplication.findUnique({ where: { id: appId } });
  if (!app || app.jobId !== jobId) throw new NotFoundError("Application not found");
  if (["SELECTED", "WITHDRAWN"].includes(app.status)) throw new BadRequestError("Cannot decline this application");

  return prisma.jobApplication.update({ where: { id: appId }, data: { status: "DECLINED" } });
}

// ─── Worker withdraw ──────────────────────────────────────────────────────────

export async function withdrawApplication(jobId: string, applicantId: string) {
  const app = await prisma.jobApplication.findUnique({
    where: { jobId_applicantUserId: { jobId, applicantUserId: applicantId } },
  });
  if (!app) throw new NotFoundError("Application not found");
  if (app.status === "SELECTED") throw new BadRequestError("Cannot withdraw after being selected");
  if (app.status === "WITHDRAWN") throw new BadRequestError("Already withdrawn");

  return prisma.jobApplication.update({ where: { id: app.id }, data: { status: "WITHDRAWN" } });
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
    throw new BadRequestError("You can only assign a worker after you've been selected for this job.");
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

  const missingDocs = await missingRequiredDocs(worker.id, "SUPPORT_WORKER");
  if (missingDocs.length > 0) {
    throw new ForbiddenError(
      `This worker can't be assigned until their documents are submitted: ${missingDocs.join("; ")}`,
    );
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

// ─── Confirm assignment (worker/provider accepts — SC-M05/M06/M07) ───────────
//
// Mutual confirmation, second half: the poster selecting a candidate
// (selectApplicant) is only the poster's side. The worker/provider must
// separately, explicitly accept before the job's exact address or the
// participant's contact details are released to them — see withContactDetails.

export async function confirmAssignment(jobId: string, userId: string) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);
  const workerPartyId = job!.assignedWorkerUserId ?? job!.selectedApplicantUserId;
  if (workerPartyId !== userId) {
    throw new ForbiddenError("Only the selected worker/provider can confirm this assignment");
  }
  if (job!.status !== "ASSIGNED") {
    throw new BadRequestError("This job isn't awaiting confirmation.");
  }
  if (job!.workerConfirmedAt) {
    throw new ConflictError("You've already confirmed this assignment.");
  }

  const updated = await prisma.supportRequest.update({
    where: { id: jobId },
    data:  { workerConfirmedAt: new Date() },
    select: JOB_WRITE_SELECT,
  });

  void notify.sendPushNotification(
    job!.postedByUserId,
    "Support confirmed",
    `Your selected worker/provider has confirmed "${job!.title}" — full details are now available.`,
    { jobId },
    "JOB_ASSIGNMENT_CONFIRMED",
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
    throw new BadRequestError("This job can't be started yet — it needs to be assigned first.");
  }
  if (!job!.workerConfirmedAt) {
    throw new BadRequestError("Confirm the assignment before starting this job.");
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
    throw new BadRequestError("This job can't be marked complete yet — it hasn't been started.");
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
    throw new BadRequestError("This job can't be confirmed yet — it hasn't been marked complete.");
  }
  const updated = await prisma.supportRequest.update({
    where: { id: jobId },
    data:  { status: "CONFIRMED", confirmedAt: new Date() },
    select: JOB_WRITE_SELECT,
  });
  const recipientId = job!.assignedWorkerUserId ?? job!.selectedApplicantUserId;
  if (recipientId) {
    // #66 — reliability counter: completed job credited to the assigned party
    await Promise.all([
      (prisma as any).workerProfile.updateMany({ where: { userId: recipientId }, data: { totalCompleted: { increment: 1 } } }),
      (prisma as any).providerProfile.updateMany({ where: { userId: recipientId }, data: { totalCompleted: { increment: 1 } } }),
    ]);
    void notify.sendPushNotification(
      recipientId, "Job confirmed",
      `"${job!.title}" has been confirmed by the poster`, { jobId }, "JOB_CONFIRMED",
    );
  }
  return updated;
}

// ─── Meet-and-greet (SW doc Window 29) ────────────────────────────────────────

export async function proposeMeetAndGreet(jobId: string, userId: string, input: ProposeMeetAndGreetInput) {
  const job = await prisma.supportRequest.findUnique({
    where:   { id: jobId },
    include: { applications: { select: { applicantUserId: true } } },
  });
  requireJob(job, jobId);
  const isParty =
    job!.postedByUserId          === userId ||
    job!.selectedApplicantUserId === userId ||
    job!.assignedWorkerUserId    === userId ||
    job!.applications.some((a) => a.applicantUserId === userId);
  if (!isParty) throw new ForbiddenError("You don't have access to this job's meet-and-greet.");

  const meetAndGreet = await prisma.meetAndGreet.create({
    data: {
      jobId,
      proposedByUserId: userId,
      type:             input.type,
      proposedTimes:    input.proposedTimes as Prisma.InputJsonValue,
      location:         input.location ?? null,
      cost:             input.cost,
      topics:           input.topics as Prisma.InputJsonValue | undefined,
    },
  });

  const recipientId = job!.postedByUserId === userId
    ? (job!.selectedApplicantUserId ?? job!.assignedWorkerUserId)
    : job!.postedByUserId;
  if (recipientId) {
    void notify.sendPushNotification(
      recipientId, "Meet-and-greet proposed",
      `A meet-and-greet was proposed for "${job!.title}"`, { jobId }, "MEET_AND_GREET_PROPOSED",
    );
  }

  return meetAndGreet;
}

export async function respondToMeetAndGreet(meetAndGreetId: string, userId: string, input: RespondMeetAndGreetInput) {
  const mag = await prisma.meetAndGreet.findUnique({
    where:   { id: meetAndGreetId },
    include: { job: { select: { id: true, title: true, postedByUserId: true, selectedApplicantUserId: true, assignedWorkerUserId: true } } },
  });
  if (!mag) throw new NotFoundError("We couldn't find that meet-and-greet proposal.");
  if (mag.proposedByUserId === userId) throw new ForbiddenError("You can't respond to your own proposal.");
  if (mag.status !== "PROPOSED") throw new BadRequestError("This meet-and-greet has already been responded to.");

  const isParty =
    mag.job.postedByUserId          === userId ||
    mag.job.selectedApplicantUserId === userId ||
    mag.job.assignedWorkerUserId    === userId;
  if (!isParty) throw new ForbiddenError("You don't have access to this meet-and-greet.");

  if (input.action === "CONFIRM" && !input.confirmedTime) {
    throw new BadRequestError("Choose one of the proposed times to confirm.");
  }

  const updated = await prisma.meetAndGreet.update({
    where: { id: meetAndGreetId },
    data: {
      status:        input.action === "CONFIRM" ? "CONFIRMED" : "DECLINED",
      confirmedTime: input.action === "CONFIRM" ? new Date(input.confirmedTime!) : null,
    },
  });

  void notify.sendPushNotification(
    mag.proposedByUserId,
    input.action === "CONFIRM" ? "Meet-and-greet confirmed" : "Meet-and-greet declined",
    `Your meet-and-greet proposal for "${mag.job.title}" was ${input.action === "CONFIRM" ? "confirmed" : "declined"}.`,
    { jobId: mag.job.id },
    "MEET_AND_GREET_RESPONDED",
  );

  return updated;
}

// ─── Worker requests a change (SW doc Window 34) ──────────────────────────────

export async function requestJobChange(jobId: string, userId: string, input: CreateChangeRequestInput) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);
  if (job!.selectedApplicantUserId !== userId && job!.assignedWorkerUserId !== userId) {
    throw new ForbiddenError("Only the selected worker/provider can request a change.");
  }

  const changeRequest = await prisma.jobChangeRequest.create({
    data: {
      jobId,
      requestedByUserId: userId,
      changeType:        input.changeType,
      reason:            input.reason ?? null,
      alternative:       input.alternative as Prisma.InputJsonValue,
    },
  });

  void notify.sendPushNotification(
    job!.postedByUserId, "Change requested",
    `A change was requested for "${job!.title}"`, { jobId }, "JOB_CHANGE_REQUESTED",
  );

  return changeRequest;
}

export async function respondToJobChange(changeRequestId: string, posterId: string, input: RespondChangeRequestInput) {
  const cr = await prisma.jobChangeRequest.findUnique({
    where:   { id: changeRequestId },
    include: { job: { select: { id: true, title: true, postedByUserId: true } } },
  });
  if (!cr) throw new NotFoundError("We couldn't find that change request.");
  if (cr.job.postedByUserId !== posterId) throw new ForbiddenError("Only the poster can respond to this change request.");
  if (cr.status !== "PENDING") throw new BadRequestError("This change request has already been responded to.");

  const updated = await prisma.jobChangeRequest.update({
    where: { id: changeRequestId },
    data:  { status: input.action === "ACCEPT" ? "ACCEPTED" : "REJECTED", respondedAt: new Date() },
  });

  void notify.sendPushNotification(
    cr.requestedByUserId,
    input.action === "ACCEPT" ? "Change request accepted" : "Change request declined",
    `Your requested change for "${cr.job.title}" was ${input.action === "ACCEPT" ? "accepted" : "declined"}.`,
    { jobId: cr.job.id },
    "JOB_CHANGE_RESPONDED",
  );

  return updated;
}

// ─── My Connections (SW doc Window 27) ────────────────────────────────────────
// Tabs: New / Connected / Discussing / Awaiting initiator decision / Confirmed /
// Not proceeding / Withdrawn / Request filled. "New" is a pending JobInvite —
// the worker hasn't Connected yet. The rest map onto ApplicationStatus, with
// Connected vs Discussing derived from whether the job has any messages yet —
// there's no separate stored state for "conversation started".

export async function listMyConnections(userId: string) {
  const [invites, applications] = await Promise.all([
    prisma.jobInvite.findMany({
      where:   { invitedUserId: userId, status: "PENDING" },
      include: { job: { select: { ...JOB_SUMMARY_SELECT, postedBy: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.jobApplication.findMany({
      where:   { applicantUserId: userId },
      include: {
        job: {
          select: {
            ...JOB_SUMMARY_SELECT,
            postedBy: { select: { name: true } },
            _count:   { select: { messages: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const tabs = {
    new:              invites as unknown[],
    connected:        [] as unknown[],
    discussing:       [] as unknown[],
    awaitingDecision: [] as unknown[],
    confirmed:        [] as unknown[],
    notProceeding:    [] as unknown[],
    withdrawn:        [] as unknown[],
    requestFilled:    [] as unknown[],
  };

  for (const app of applications) {
    const hasMessages = app.job._count.messages > 0;
    if (app.status === "INTERESTED") {
      (hasMessages ? tabs.discussing : tabs.connected).push(app);
    } else if (app.status === "SHORTLISTED") {
      tabs.awaitingDecision.push(app);
    } else if (app.status === "SELECTED") {
      tabs.confirmed.push(app);
    } else if (app.status === "DECLINED") {
      tabs.notProceeding.push(app);
    } else if (app.status === "WITHDRAWN") {
      tabs.withdrawn.push(app);
    } else if (app.status === "REQUEST_FILLED") {
      tabs.requestFilled.push(app);
    }
  }

  return tabs;
}

// ─── Close connection (SW doc Window 38) ───────────────────────────────────────
// A lightweight marketplace-outcome tag, independent of job.status — explicitly
// NOT proof of delivery or payment approval (§17). Poster-only.

export async function closeConnection(jobId: string, posterId: string, input: CloseConnectionInput) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);
  if (job!.postedByUserId !== posterId) throw new ForbiddenError("Only the poster can close this connection");

  return prisma.supportRequest.update({
    where: { id: jobId },
    data: {
      closedOutcome:        input.outcome,
      closedReasonCategory: input.reasonCategory ?? null,
      closedFeedback:       input.feedback ?? null,
      closedAt:             new Date(),
    },
    select: JOB_WRITE_SELECT,
  });
}

// ─── Save / hide (SW doc Windows 16-17) ─────────────────────────────────────────

export async function bookmarkJob(jobId: string, workerId: string, input: BookmarkJobInput) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);
  return prisma.jobBookmark.upsert({
    where:  { workerUserId_jobId: { workerUserId: workerId, jobId } },
    create: { workerUserId: workerId, jobId, saved: input.saved ?? true, hidden: input.hidden ?? false },
    update: {
      ...(input.saved  !== undefined ? { saved: input.saved }   : {}),
      ...(input.hidden !== undefined ? { hidden: input.hidden } : {}),
    },
  });
}

export async function removeBookmark(jobId: string, workerId: string) {
  await prisma.jobBookmark.deleteMany({ where: { workerUserId: workerId, jobId } });
  return { ok: true };
}

// ─── Running late / private note (SW doc Window 33) ────────────────────────────
// "Running late" is a one-tap notice to the poster — not a GPS check-in.

export async function notifyRunningLate(jobId: string, workerId: string, input: NotifyRunningLateInput) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);
  if (job!.selectedApplicantUserId !== workerId && job!.assignedWorkerUserId !== workerId) {
    throw new ForbiddenError("Only the assigned worker/provider can send a running-late notice");
  }
  const updated = await prisma.supportRequest.update({
    where: { id: jobId },
    data:  { runningLateNotifiedAt: new Date(), runningLateMinutes: input.minutesLate },
    select: JOB_WRITE_SELECT,
  });
  void notify.sendPushNotification(
    job!.postedByUserId, "Worker running late",
    `Your worker for "${job!.title}" is running about ${input.minutesLate} minutes late.`,
    { jobId }, "JOB_RUNNING_LATE",
  );
  return updated;
}

export async function saveWorkerNote(jobId: string, workerId: string, input: SaveWorkerNoteInput) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);
  if (job!.selectedApplicantUserId !== workerId && job!.assignedWorkerUserId !== workerId) {
    throw new ForbiddenError("Only the assigned worker/provider can save a note for this job");
  }
  return prisma.supportRequest.update({
    where: { id: jobId },
    data:  { workerPrivateNote: input.note },
    select: JOB_WRITE_SELECT_WITH_NOTE,
  });
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
  if (!isParty) throw new ForbiddenError("You don't have access to this job's messages.");

  // SW doc Window 44 — a party who blocked messages from this sender stops
  // the message before it's created, not just hidden from their own view.
  const partyIds = [
    job!.postedByUserId, job!.forParticipantUserId, job!.selectedApplicantUserId, job!.assignedWorkerUserId,
    ...job!.applications.map((a) => a.applicantUserId),
  ].filter((id): id is string => !!id);
  if (await isBlockedFromMessaging(senderId, partyIds)) {
    throw new ForbiddenError("You can't message this conversation — a participant has blocked you.");
  }

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
  if (!isParty) throw new ForbiddenError("You don't have access to this job's messages.");
  return prisma.jobMessage.findMany({
    where:   { jobId },
    orderBy: { createdAt: "asc" },
    include: { sender: { select: { id: true, name: true, avatarUrl: true } } },
  });
}

// ─── Message thread state (unread / archive) ───────────────────────────────────
// Additive to JobMessage — a thread IS a job's messages, this just tracks
// per-user read/archive state on top. Never gates send/receive.

export async function markThreadRead(jobId: string, userId: string) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);
  return prisma.jobMessageThreadState.upsert({
    where:  { userId_jobId: { userId, jobId } },
    create: { userId, jobId, lastReadAt: new Date() },
    update: { lastReadAt: new Date() },
  });
}

export async function archiveThread(jobId: string, userId: string, archived: boolean) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);
  return prisma.jobMessageThreadState.upsert({
    where:  { userId_jobId: { userId, jobId } },
    create: { userId, jobId, archived },
    update: { archived },
  });
}

// GET /jobs/messages/threads — the messages inbox. Reuses the same
// role-scoping as listMyJobs (a thread only exists on a job you're already a
// party to) and enriches each job with its last message, unread count, and
// archive state, so the Web inbox no longer needs an N+1 fetch per job.
export async function listMessageThreads(
  userId: string,
  activeRole: UserRole,
  includeArchived: boolean,
) {
  const where = await buildMyJobsWhere(userId, activeRole);

  const rawJobs = await prisma.supportRequest.findMany({
    where:   where as any,
    select:  {
      ...JOB_SUMMARY_SELECT,
      messages: {
        orderBy: { createdAt: "desc" },
        take:    1,
        include: { sender: { select: { id: true, name: true } } },
      },
      messageThreadStates: {
        where:  { userId },
        select: { lastReadAt: true, archived: true },
        take:   1,
      },
    },
    orderBy: [{ scheduledStartAt: "desc" }],
    take:    100,
  });

  // Only jobs that actually have at least one message are real "threads".
  const withMessages = rawJobs.filter((j) => j.messages.length > 0);

  const threads = await Promise.all(
    withMessages.map(async ({ messages, messageThreadStates, createdAt, totalHours, ...rest }) => {
      const state = messageThreadStates[0] ?? null;
      const [lastMessage] = messages;
      const unreadCount = await prisma.jobMessage.count({
        where: {
          jobId:        rest.id,
          senderUserId: { not: userId },
          ...(state?.lastReadAt ? { createdAt: { gt: state.lastReadAt } } : {}),
        },
      });
      return {
        ...rest,
        postedAt:    createdAt,
        lastMessage: lastMessage
          ? {
              id:         lastMessage.id,
              senderId:   lastMessage.sender.id,
              senderName: lastMessage.sender.name,
              body:       lastMessage.body,
              createdAt:  lastMessage.createdAt,
            }
          : null,
        unreadCount,
        archived: state?.archived ?? false,
      };
    }),
  );

  return {
    threads: threads.filter((t) => includeArchived || !t.archived),
  };
}

// ─── Invoice ──────────────────────────────────────────────────────────────────

// GET /jobs/:id/invoice-recipients — candidate plan managers for the invoice
// picker: whichever are actually connected (ACCEPTED) to this job's
// participant, so the sender picks from a real list instead of typing a raw
// user ID. UX only — does not change what createInvoice accepts.
export async function getInvoiceRecipients(jobId: string, senderId: string, activeRole: UserRole) {
  const allowed: UserRole[] = ["COORDINATOR", "PROVIDER", "SUPPORT_WORKER"];
  if (!allowed.includes(activeRole)) {
    throw new ForbiddenError("Only coordinators, providers, and workers can create invoices");
  }

  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  requireJob(job, jobId);

  const app = await prisma.jobApplication.findFirst({
    where: { jobId, applicantUserId: senderId, status: { in: ["SELECTED", "INTERESTED"] } },
  });
  const isCoordinator = job!.postedByUserId === senderId && activeRole === "COORDINATOR";
  if (!app && !isCoordinator) throw new ForbiddenError("You are not involved in this job");

  if (!job!.forParticipantUserId) return { participant: null, planManagers: [] };

  const [participant, connections] = await Promise.all([
    prisma.user.findUnique({ where: { id: job!.forParticipantUserId }, select: { id: true, name: true } }),
    prisma.planManagerConnection.findMany({
      where: { clientUserId: job!.forParticipantUserId, status: "ACCEPTED" },
      include: {
        planManager: {
          select: { id: true, name: true, email: true, planManagerProfile: { select: { businessName: true } } },
        },
      },
    }),
  ]);

  return {
    participant,
    planManagers: connections.map((c) => ({
      id:           c.planManager.id,
      name:         c.planManager.name,
      email:        c.planManager.email,
      businessName: c.planManager.planManagerProfile?.businessName ?? null,
    })),
  };
}

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
    where: { jobId, applicantUserId: senderId, status: { in: ["SELECTED","INTERESTED"] } },
  });
  const isCoordinator = job!.postedByUserId === senderId && activeRole === "COORDINATOR";
  if (!app && !isCoordinator) throw new ForbiddenError("You are not involved in this job");

  const pm = await prisma.user.findUnique({
    where: { id: input.planManagerUserId },
    include: { roles: true },
  });
  if (!pm || !pm.roles.some((r) => r.role === "PLAN_MANAGER")) {
    throw new NotFoundError("Plan manager not found");
  }

  return prisma.invoice.create({
    data: {
      jobId,
      senderUserId:      senderId,
      planManagerUserId: input.planManagerUserId,
      participantUserId: input.participantUserId,
      hours:             input.hours ?? null,
      note:              input.note ?? null,
    },
    include: {
      sender:      { select: { id: true, name: true } },
      planManager: { select: { id: true, name: true, email: true } },
      participant: { select: { id: true, name: true } },
      job:         { select: { id: true, title: true, status: true, suburb: true, scheduledStartAt: true } },
    },
  });
}

export async function listInvoices(userId: string, activeRole: UserRole) {
  const where =
    activeRole === "PLAN_MANAGER"  ? { planManagerUserId: userId } :
    activeRole === "PARTICIPANT"   ? { participantUserId: userId }  :
                                     { senderUserId: userId };

  return prisma.invoice.findMany({
    where,
    orderBy: { sentAt: "desc" },
    include: {
      sender:      { select: { id: true, name: true } },
      planManager: { select: { id: true, name: true } },
      participant: { select: { id: true, name: true } },
      job:         { select: { id: true, title: true, status: true, suburb: true, scheduledStartAt: true } },
    },
  });
}
