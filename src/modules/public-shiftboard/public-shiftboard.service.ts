// The ONLY unauthenticated job-listing path in the app — see
// public-shiftboard.routes.ts (mounted outside requireAuth in app.ts).
//
// Deliberately separate from listLiveDashboardJobs (job.service.ts), which
// hard-requires a logged-in userId/activeRole for isOwnRequest + role-based
// visibility gating. An anonymous caller has neither, so this hard-restricts
// to the genuinely public-eligible set (visibilityTarget ALL/null) instead.
import { prisma } from "../../lib/prisma";
import { JOB_SUMMARY_SELECT } from "../jobs/job.service";
import { haversineKm, blurCoordinate } from "../../lib/geo";
import { bucketForShift, type TimeOfDay } from "../../lib/shift-time";
import type { PublicShiftboardFiltersInput } from "../../validators/public-shiftboard.schema";
import type { JobUrgency } from "@prisma/client";

// Candidate cap — this feature has no spatial DB index, so radius/time-of-day
// filtering happens in application code over a bounded recent-jobs window
// rather than a real bounding-box query. Revisit if OPEN-job volume outgrows
// this (fine for the marketplace's current expected scale).
const PUBLIC_SHIFTBOARD_CANDIDATE_CAP = 2000;

const URGENCY_ORDER: JobUrgency[] = ["RAPID", "URGENT", "LAST_MINUTE", "ROUTINE"];

// Public-safe select: JOB_SUMMARY_SELECT already excludes address/contact
// fields; add raw lat/lng (blurred before the response leaves this module)
// for the map, and explicitly drop participant-identifying/internal fields
// that JOB_SUMMARY_SELECT includes for authenticated dashboard use.
const PUBLIC_JOB_SELECT = {
  ...JOB_SUMMARY_SELECT,
  lat: true,
  lng: true,
  visibilityTarget:     false,
  hideParticipantName:  false,
  forParticipantUserId: false,
} as const;

type PublicJobRow = {
  id: string;
  title: string;
  category: string;
  subcategory: string | null;
  workerPreferences: unknown;
  urgency: JobUrgency;
  shiftType: string | null;
  durationType: string | null;
  isRecurring: boolean;
  suburb: string;
  state: string;
  serviceDeliveryMode: string | null;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  totalHours: unknown;
  budgetPerHour: unknown;
  totalBudget: unknown;
  budgetType: string | null;
  fundingType: string | null;
  createdAt: Date;
  status: string;
  featuredUntil: Date | null;
  applicationDeadlineAt: Date | null;
  lat: unknown;
  lng: unknown;
};

// Reads a workerPreferences requirement flag across BOTH shapes that exist in
// the data: flat `workerPreferences.<key>: true` (rapid/urgent/last-minute)
// and `workerPreferences.matchPreferences.<key>.selected` (routine's separate
// buildRoutinePreferencesPayload path). See Web/lib/types/posting.ts.
function readRequirementFlag(workerPreferences: unknown, key: string): boolean {
  if (!workerPreferences || typeof workerPreferences !== "object") return false;
  const wp = workerPreferences as Record<string, unknown>;
  if (wp[key] === true) return true;
  const match = wp.matchPreferences as Record<string, { selected?: boolean }> | undefined;
  return Boolean(match?.[key]?.selected);
}

const REQUIREMENT_KEYS = ["driversLicence", "vehicle", "certIIIOrAbove", "restrictivePractices", "firstAid", "alliedHealth"] as const;

function matchesRequirementFilters(job: PublicJobRow, filters: PublicShiftboardFiltersInput): boolean {
  for (const key of REQUIREMENT_KEYS) {
    if (filters[key] === true && !readRequirementFlag(job.workerPreferences, key)) return false;
  }
  return true;
}

export interface PublicShiftboardResult {
  jobs: Array<Record<string, unknown> & { distanceKm: number | null }>;
  total: number;
  page: number;
  limit: number;
  pages: number;
  counts: Record<"ALL" | JobUrgency, number>;
}

export async function listPublicShiftboardJobs(
  filters: PublicShiftboardFiltersInput,
): Promise<PublicShiftboardResult> {
  const {
    suburb, state, category, shiftType, urgency,
    nearLat, nearLng, radiusKm, startFrom, startTo, timeOfDay,
    page, limit, sortBy,
  } = filters;

  const hasRadius = nearLat != null && nearLng != null;

  const where: Record<string, unknown> = {
    status: "OPEN",
    OR: [{ visibilityTarget: "ALL" }, { visibilityTarget: null }],
  };
  if (suburb) where.suburb = { contains: suburb, mode: "insensitive" };
  if (state)  where.state  = { contains: state,  mode: "insensitive" };
  if (category)  where.category  = category;
  if (shiftType) where.shiftType = shiftType;
  if (startFrom || startTo) {
    where.scheduledStartAt = {
      ...(startFrom ? { gte: new Date(startFrom) } : {}),
      ...(startTo   ? { lte: new Date(startTo) }   : {}),
    };
  }

  const candidates = await prisma.supportRequest.findMany({
    where:   where as any,
    take:    PUBLIC_SHIFTBOARD_CANDIDATE_CAP,
    orderBy: { createdAt: "desc" },
    select:  PUBLIC_JOB_SELECT as any,
  }) as unknown as PublicJobRow[];

  // Everything below is application-code filtering/sorting — see the
  // PUBLIC_SHIFTBOARD_CANDIDATE_CAP note above for why (no spatial index,
  // and counts must stay consistent with whatever radius circle is applied).
  const withDistance = candidates.map((job) => {
    const jobLat = job.lat != null ? Number(job.lat) : null;
    const jobLng = job.lng != null ? Number(job.lng) : null;
    const distanceKm = hasRadius && jobLat != null && jobLng != null
      ? haversineKm(nearLat!, nearLng!, jobLat, jobLng)
      : null;
    return { job, jobLat, jobLng, distanceKm };
  });

  const filtered = withDistance.filter(({ job, distanceKm }) => {
    if (hasRadius && (distanceKm == null || distanceKm > radiusKm)) return false;
    if (timeOfDay && timeOfDay.length > 0) {
      const bucket: TimeOfDay = bucketForShift(job.scheduledStartAt, job.state);
      if (!timeOfDay.includes(bucket)) return false;
    }
    if (!matchesRequirementFilters(job, filters)) return false;
    return true;
  });

  const counts: Record<"ALL" | JobUrgency, number> = { ALL: filtered.length, RAPID: 0, URGENT: 0, LAST_MINUTE: 0, ROUTINE: 0 };
  for (const { job } of filtered) counts[job.urgency]++;

  const tabFiltered = urgency ? filtered.filter(({ job }) => job.urgency === urgency) : filtered;

  const sorted = [...tabFiltered].sort((a, b) => {
    if (sortBy === "newest")    return b.job.createdAt.getTime() - a.job.createdAt.getTime();
    if (sortBy === "startDate") return a.job.scheduledStartAt.getTime() - b.job.scheduledStartAt.getTime();
    if (sortBy === "nearest" && hasRadius) return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
    // "urgency" (default), and "nearest" without a location to sort by.
    const rank = (u: JobUrgency) => URGENCY_ORDER.indexOf(u);
    return rank(a.job.urgency) - rank(b.job.urgency) || a.job.scheduledStartAt.getTime() - b.job.scheduledStartAt.getTime();
  });

  const total = sorted.length;
  const start = (page - 1) * limit;
  const pageRows = sorted.slice(start, start + limit);

  const jobs = pageRows.map(({ job, distanceKm }) => {
    const { lat: rawLat, lng: rawLng, workerPreferences, ...rest } = job;
    return {
      ...rest,
      totalHours:    rest.totalHours    != null ? Number(rest.totalHours)    : null,
      budgetPerHour: rest.budgetPerHour != null ? Number(rest.budgetPerHour) : null,
      totalBudget:   rest.totalBudget   != null ? Number(rest.totalBudget)   : null,
      lat: rawLat != null ? blurCoordinate(Number(rawLat)) : null,
      lng: rawLng != null ? blurCoordinate(Number(rawLng)) : null,
      distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
      requirements: Object.fromEntries(
        REQUIREMENT_KEYS.map((key) => [key, readRequirementFlag(workerPreferences, key)]),
      ),
    };
  });

  return { jobs, total, page, limit, pages: Math.ceil(total / limit), counts };
}
