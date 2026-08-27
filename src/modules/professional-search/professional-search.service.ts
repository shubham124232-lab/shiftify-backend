// SC-F01-06 "Find directly" (Journey 9) — a Coordinator searches workers
// and/or providers directly and invites/shortlists/saves them, as an
// alternative to posting a request and waiting for responses.
//
// Deliberately a NEW module rather than widening worker.service.ts's
// browseAvailableWorkers: that function backs GET /workers/available, a
// public "Post My Availability" feed several roles (Participant, Provider,
// Plan Manager) already depend on, and widening its filters/shape here would
// risk regressing those unrelated consumers.
import { prisma } from "../../lib/prisma";
import { ApiError, ForbiddenError, NotFoundError, BadRequestError, ConflictError } from "../../lib/errors";
import { cancellationRate } from "../jobs/job-scoring";
import { hasActiveAddOn } from "../subscriptions/subscription.service";
import { missingRequiredDocs } from "../../middleware/marketplace.middleware";
import { assertCoordinatorPermission } from "../coordinator-connections/coordinator-connection.service";
import type { UserRole } from "@prisma/client";
import type { ProfessionalSearchFiltersInput, InviteFromSearchInput } from "../../validators/professional-search.schema";

// Coordinator needs the Growth add-on to search directly — same gate
// browseAvailableWorkers applies for "Access to support worker list"
// (pricing_plans.md). This journey is Coordinator-only per the SC doc, so
// there's just the one role to check.
const GROWTH_ADD_ON_KEY = "COORDINATOR_GROWTH";

// A JSON column holds an untyped array in this schema (servicesOffered,
// languagesSpoken, highIntensitySkills, coreServices) — Prisma can't filter
// array-contains on those portably, so these are matched in application code
// against a bounded candidate set fetched with the typed filters applied at
// the DB level. CANDIDATE_CAP keeps that bounded; if this journey needs true
// DB-level array filtering at scale later, that's a follow-up, not this pass.
const CANDIDATE_CAP = 300;

function includesCI(arr: unknown, needle: string): boolean {
  if (!Array.isArray(arr)) return false;
  const n = needle.trim().toLowerCase();
  return arr.some((v) => typeof v === "string" && v.toLowerCase().includes(n));
}

function overlapsCI(a: unknown, b: unknown): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  const bLower = new Set(b.filter((v) => typeof v === "string").map((v) => v.toLowerCase()));
  return a.some((v) => typeof v === "string" && bLower.has(v.toLowerCase()));
}

// ─── Participant fit summary ────────────────────────────────────────────────
// Same "met/missing" shape as job.service.ts's computeMatchSummary, but
// comparing a WORKER/PROVIDER against a PARTICIPANT's stated needs
// (ParticipantProfile), not a worker against a job. Only fields with a real,
// comparable value on both sides are used — free-text/JSON blobs with no
// fixed contract (riskSafetyNotes, supportPreferences, etc.) are skipped.
interface ParticipantForFit {
  primarySupportNeeds: unknown;
  preferredWorkerGender: string | null;
  languagePreference: unknown;
  suburb: string | null;
  state: string | null;
  personalCareSupportLevel: string | null;
  fundingManagementType: string | null;
  preferredTime: unknown;
}

function computeWorkerFitSummary(
  participant: ParticipantForFit,
  worker: {
    servicesOffered: unknown;
    gender: string | null;
    languagesSpoken: unknown;
    suburb: string | null;
    state: string | null;
    highIntensitySkills: unknown;
    acceptsSleepoverShifts: boolean;
    acceptsActiveOvernightShifts: boolean;
  },
): { met: string[]; missing: string[] } {
  const met: string[] = [];
  const missing: string[] = [];

  if (Array.isArray(participant.primarySupportNeeds) && participant.primarySupportNeeds.length > 0) {
    (overlapsCI(participant.primarySupportNeeds, worker.servicesOffered) ? met : missing).push("Support services needed");
  }

  if (participant.preferredWorkerGender) {
    (worker.gender && worker.gender.toLowerCase() === participant.preferredWorkerGender.toLowerCase() ? met : missing)
      .push("Gender preference");
  }

  if (Array.isArray(participant.languagePreference) && participant.languagePreference.length > 0) {
    (overlapsCI(participant.languagePreference, worker.languagesSpoken) ? met : missing).push("Language preference");
  }

  if (participant.suburb) {
    (worker.suburb && worker.suburb.toLowerCase() === participant.suburb.toLowerCase()
      ? met
      : worker.state && participant.state && worker.state.toLowerCase() === participant.state.toLowerCase()
      ? met
      : missing
    ).push("Service area");
  }

  if (Array.isArray(participant.preferredTime) && participant.preferredTime.some((t) => typeof t === "string" && t.toUpperCase() === "OVERNIGHT")) {
    (worker.acceptsSleepoverShifts || worker.acceptsActiveOvernightShifts ? met : missing).push("Overnight availability");
  }

  if (participant.personalCareSupportLevel && /high.?intensity/i.test(participant.personalCareSupportLevel)) {
    (Array.isArray(worker.highIntensitySkills) && worker.highIntensitySkills.length > 0 ? met : missing).push("High-intensity experience");
  }

  return { met, missing };
}

function computeProviderFitSummary(
  participant: ParticipantForFit,
  provider: {
    coreServices: unknown;
    stateCoverage: unknown;
    ndisRegistered: boolean;
  },
): { met: string[]; missing: string[] } {
  const met: string[] = [];
  const missing: string[] = [];

  if (Array.isArray(participant.primarySupportNeeds) && participant.primarySupportNeeds.length > 0) {
    (overlapsCI(participant.primarySupportNeeds, provider.coreServices) ? met : missing).push("Support services needed");
  }

  if (participant.state) {
    (overlapsCI([participant.state], provider.stateCoverage) ? met : missing).push("Service area");
  }

  if (participant.fundingManagementType === "NDIA_MANAGED") {
    (provider.ndisRegistered ? met : missing).push("NDIS registration (required for NDIA-managed funding)");
  }

  return { met, missing };
}

async function requireGrowthAddOn(userId: string) {
  if (!(await hasActiveAddOn(userId, "COORDINATOR", GROWTH_ADD_ON_KEY))) {
    throw new ApiError(
      403,
      "SUBSCRIPTION_REQUIRED",
      "The Growth add-on is required to search for workers and providers directly. Choose a plan on the Subscription page to continue.",
    );
  }
}

async function loadParticipantContext(coordinatorUserId: string, forParticipantUserId: string): Promise<ParticipantForFit> {
  await assertCoordinatorPermission(coordinatorUserId, forParticipantUserId, "canShortlist");
  const profile = await prisma.participantProfile.findUnique({
    where: { userId: forParticipantUserId },
    select: {
      primarySupportNeeds: true,
      preferredWorkerGender: true,
      languagePreference: true,
      suburb: true,
      state: true,
      personalCareSupportLevel: true,
      fundingManagementType: true,
      preferredTime: true,
    },
  });
  if (!profile) throw new NotFoundError("This participant hasn't completed their profile yet");
  return profile;
}

// ─── SC-F01-04 — search ──────────────────────────────────────────────────────

export async function searchProfessionals(userId: string, filters: ProfessionalSearchFiltersInput) {
  await requireGrowthAddOn(userId);

  const participant = filters.forParticipantUserId
    ? await loadParticipantContext(userId, filters.forParticipantUserId)
    : null;

  const wantWorkers   = filters.searchType === "SUPPORT_WORKER" || filters.searchType === "BOTH";
  const wantProviders = filters.searchType === "PROVIDER" || filters.searchType === "BOTH";

  const [workerResults, workerTotal] = wantWorkers
    ? await searchWorkers(userId, filters, participant)
    : [[], 0];
  const [providerResults, providerTotal] = wantProviders
    ? await searchProviders(userId, filters, participant)
    : [[], 0];

  // Combined pagination is approximate across two independently-filtered
  // models (there's no single table to ORDER BY/LIMIT/OFFSET across) — each
  // side is capped to CANDIDATE_CAP, merged, sorted by updatedAt, then sliced
  // to the requested page. Fine at this journey's scale; a true cross-model
  // paginated feed would need a materialized/union view, out of scope here.
  const merged = [...workerResults, ...providerResults].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  const skip = (filters.page - 1) * filters.limit;
  const page = merged.slice(skip, skip + filters.limit);

  return {
    results: page,
    total: workerTotal + providerTotal,
    page: filters.page,
    limit: filters.limit,
  };
}

async function searchWorkers(
  viewerUserId: string,
  filters: ProfessionalSearchFiltersInput,
  participant: ParticipantForFit | null,
): Promise<[any[], number]> {
  const where: Record<string, unknown> = {
    isPubliclyListed: true,
    user: { blocksMade: { none: { blockedUserId: viewerUserId, hideProfile: true } } },
  };
  if (filters.suburb) where.suburb = { contains: filters.suburb, mode: "insensitive" };
  if (filters.state)  where.state  = { contains: filters.state,  mode: "insensitive" };
  if (filters.genderRequirement) where.gender = { equals: filters.genderRequirement, mode: "insensitive" };
  if (filters.rapidAvailability) where.isAvailableNow = true;
  if (filters.transportRequired) where.OR = [{ canTransportParticipants: true }, { hasVehicle: true }];
  if (filters.overnightRequired) {
    where.AND = [
      ...(Array.isArray(where.AND) ? (where.AND as unknown[]) : []),
      { OR: [{ acceptsSleepoverShifts: true }, { acceptsActiveOvernightShifts: true }] },
    ];
  }
  if (filters.rateMin != null || filters.rateMax != null) {
    where.hourlyRate = {
      ...(filters.rateMin != null ? { gte: filters.rateMin } : {}),
      ...(filters.rateMax != null ? { lte: filters.rateMax } : {}),
    };
  }

  const candidates = await prisma.workerProfile.findMany({
    where,
    take: CANDIDATE_CAP,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, userId: true, suburb: true, state: true, listingHeadline: true, bio: true,
      rating: true, totalReviews: true, hourlyRate: true, hourlyRateType: true,
      experienceLevel: true, servicesOffered: true, subServices: true, gender: true,
      languagesSpoken: true, highIntensitySkills: true, availabilityType: true,
      acceptsSleepoverShifts: true, acceptsActiveOvernightShifts: true, isAvailableNow: true,
      totalCompleted: true, totalCancelledByWorker: true, updatedAt: true,
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  let filtered = candidates;
  if (filters.service) filtered = filtered.filter((w) => includesCI(w.servicesOffered, filters.service!));
  if (filters.language) filtered = filtered.filter((w) => includesCI(w.languagesSpoken, filters.language!));
  if (filters.highIntensityExperience) filtered = filtered.filter((w) => Array.isArray(w.highIntensitySkills) && w.highIntensitySkills.length > 0);

  if (filters.documentsComplete) {
    const flags = await Promise.all(filtered.map((w) => missingRequiredDocs(w.userId, "SUPPORT_WORKER")));
    filtered = filtered.filter((_, i) => flags[i].length === 0);
  }

  const results = await Promise.all(filtered.map(async (w) => {
    const { userId: wUserId, highIntensitySkills, gender, languagesSpoken, ...rest } = w;
    const missing = await missingRequiredDocs(wUserId, "SUPPORT_WORKER");
    return {
      kind: "SUPPORT_WORKER" as const,
      ...rest,
      userId: wUserId,
      cancellationRate: cancellationRate(w.totalCompleted, w.totalCancelledByWorker),
      documentStatus: missing.length === 0 ? "COMPLETE" : "INCOMPLETE",
      fitSummary: participant
        ? computeWorkerFitSummary(participant, { ...w, gender, languagesSpoken })
        : undefined,
    };
  }));

  return [results, results.length];
}

async function searchProviders(
  viewerUserId: string,
  filters: ProfessionalSearchFiltersInput,
  participant: ParticipantForFit | null,
): Promise<[any[], number]> {
  const where: Record<string, unknown> = {
    isPubliclyListed: true,
    user: { blocksMade: { none: { blockedUserId: viewerUserId, hideProfile: true } } },
  };
  if (filters.registeredProviderOnly) where.ndisRegistered = true;
  if (filters.rapidAvailability) where.abilityToFillUrgentShifts = true;

  const candidates = await prisma.providerProfile.findMany({
    where,
    take: CANDIDATE_CAP,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, userId: true, businessName: true, businessDescription: true, logoUrl: true,
      ndisRegistered: true, coreServices: true, serviceAreas: true, stateCoverage: true,
      currentCapacityStatus: true, abilityToFillUrgentShifts: true,
      averageRating: true, totalRatings: true, totalCompleted: true, totalCancelledByWorker: true,
      updatedAt: true,
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  let filtered = candidates;
  if (filters.state) filtered = filtered.filter((p) => includesCI(p.stateCoverage, filters.state!));
  if (filters.service) filtered = filtered.filter((p) => includesCI(p.coreServices, filters.service!));
  // ProviderProfile has no typed suburb field (org-level, not location-level) —
  // suburb filtering falls back to a loose match against serviceAreas JSON.
  if (filters.suburb) filtered = filtered.filter((p) => includesCI(p.serviceAreas, filters.suburb!));

  if (filters.documentsComplete) {
    const flags = await Promise.all(filtered.map((p) => missingRequiredDocs(p.userId, "PROVIDER")));
    filtered = filtered.filter((_, i) => flags[i].length === 0);
  }

  const results = await Promise.all(filtered.map(async (p) => {
    const { userId: pUserId, ...rest } = p;
    const missing = await missingRequiredDocs(pUserId, "PROVIDER");
    return {
      kind: "PROVIDER" as const,
      ...rest,
      userId: pUserId,
      cancellationRate: cancellationRate(p.totalCompleted, p.totalCancelledByWorker),
      documentStatus: missing.length === 0 ? "COMPLETE" : "INCOMPLETE",
      fitSummary: participant ? computeProviderFitSummary(participant, p) : undefined,
    };
  }));

  return [results, results.length];
}

// ─── SC-F05 — full profile view ─────────────────────────────────────────────

export async function getProfessionalProfile(viewerUserId: string, professionalUserId: string) {
  await requireGrowthAddOn(viewerUserId);

  const user = await prisma.user.findUnique({
    where: { id: professionalUserId },
    select: {
      id: true, name: true, avatarUrl: true,
      roles: { select: { role: true } },
      workerProfile: true,
      providerProfile: true,
    },
  });
  if (!user) throw new NotFoundError("Profile not found");

  if (user.workerProfile?.isPubliclyListed) {
    const missing = await missingRequiredDocs(user.id, "SUPPORT_WORKER");
    return {
      kind: "SUPPORT_WORKER" as const,
      user: { id: user.id, name: user.name, avatarUrl: user.avatarUrl },
      profile: user.workerProfile,
      documentStatus: missing.length === 0 ? "COMPLETE" : "INCOMPLETE",
    };
  }
  if (user.providerProfile?.isPubliclyListed) {
    const missing = await missingRequiredDocs(user.id, "PROVIDER");
    return {
      kind: "PROVIDER" as const,
      user: { id: user.id, name: user.name, avatarUrl: user.avatarUrl },
      profile: user.providerProfile,
      documentStatus: missing.length === 0 ? "COMPLETE" : "INCOMPLETE",
    };
  }
  throw new NotFoundError("This profile isn't publicly listed");
}

// ─── SC-F06 — connect actions ────────────────────────────────────────────────
// "Invite to an existing request" reuses job-invite.service.ts's createInvite
// directly (call that endpoint from the client — see job-invite.routes.ts).
// "Create a new request" is a two-step client flow: POST /jobs, then
// POST /job-invites/:jobId — both already exist, so no new endpoint for that
// shortcut either. "Message first" now goes through its own standalone
// module (POST /direct-inquiries — see direct-inquiry.service.ts) instead of
// this endpoint: it's a job-less/pre-connection message, so it doesn't fit
// the job-scoped JobMessage model at all, and doesn't need this endpoint's
// coordinator-only/participant-permission gating either.
// What this endpoint DOES add is the two actions with no existing home:
// shortlisting and preferred/backup saves, both via SavedProfessional.
export async function connectFromSearch(coordinatorUserId: string, input: InviteFromSearchInput) {
  if (input.forParticipantUserId) {
    await assertCoordinatorPermission(coordinatorUserId, input.forParticipantUserId, "canShortlist");
  }

  switch (input.action) {
    case "SAVE_TO_SHORTLIST": {
      const existing = await prisma.savedProfessional.findFirst({
        where: {
          ownerUserId: coordinatorUserId,
          professionalUserId: input.professionalUserId,
          listType: "GENERAL",
          forParticipantUserId: input.forParticipantUserId ?? null,
        },
      });
      if (existing) throw new ConflictError("Already on this participant's shortlist");
      return prisma.savedProfessional.create({
        data: {
          ownerUserId: coordinatorUserId,
          professionalUserId: input.professionalUserId,
          listType: "GENERAL",
          forParticipantUserId: input.forParticipantUserId,
          note: input.message,
        },
      });
    }
    case "SAVE_AS_PREFERRED_BACKUP": {
      const listType = input.listType ?? "PREFERRED_WORKER";
      const existing = await prisma.savedProfessional.findFirst({
        where: {
          ownerUserId: coordinatorUserId,
          professionalUserId: input.professionalUserId,
          listType,
          forParticipantUserId: input.forParticipantUserId ?? null,
        },
      });
      if (existing) throw new ConflictError("Already saved to this list");
      return prisma.savedProfessional.create({
        data: {
          ownerUserId: coordinatorUserId,
          professionalUserId: input.professionalUserId,
          listType,
          forParticipantUserId: input.forParticipantUserId,
          note: input.message,
        },
      });
    }
    case "INVITE_TO_EXISTING_REQUEST":
      // No new logic — the client calls POST /job-invites/:jobId directly
      // (job-invite.service.ts already validates ownership/status/roles).
      // This branch only exists so the shared action enum stays exhaustive;
      // hitting it via this endpoint is a client wiring mistake.
      throw new BadRequestError("Call POST /job-invites/:jobId to invite to an existing request");
    default:
      throw new BadRequestError("Unknown action");
  }
}
