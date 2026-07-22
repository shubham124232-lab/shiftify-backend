import { prisma } from "../../lib/prisma";
import type { UserRole } from "@prisma/client";

// Multi-factor score for JobApplication.score — powers the "top 5" applicant
// ranking already used by listApplications() and JOB_DETAIL_INCLUDE (both
// `orderBy: { score: "desc" }`). Weights sum to 100.
const WEIGHTS = { rating: 35, reliability: 30, experience: 15, priceFit: 20 } as const;

const EXPERIENCE_LEVEL_RANK: Record<string, number> = {
  BEGINNER:     0,
  INTERMEDIATE: 1,
  EXPERIENCED:  2,
  EXPERT:       3,
};
const MAX_EXPERIENCE_RANK = 3;

export function cancellationRate(totalCompleted: number, totalCancelledByWorker: number): number {
  const denom = totalCompleted + totalCancelledByWorker;
  return denom === 0 ? 0 : totalCancelledByWorker / denom;
}

function priceFitScore(hourlyRate: number | null, proposedRate: number | null, budgetPerHour: number | null): number {
  const rate = proposedRate ?? hourlyRate;
  if (rate == null || budgetPerHour == null || budgetPerHour === 0) return 0.5; // no basis to compare — neutral
  const diff = Math.abs(rate - budgetPerHour) / budgetPerHour;
  return Math.max(0, 1 - diff);
}

interface Signals {
  rating: number;
  totalCompleted: number;
  totalCancelledByWorker: number;
  experienceLevel: string | null;
  hourlyRate: number | null;
}

async function loadSignals(applicantUserId: string, applicantRole: UserRole): Promise<Signals | null> {
  if (applicantRole === "SUPPORT_WORKER") {
    const wp = await prisma.workerProfile.findUnique({
      where:  { userId: applicantUserId },
      select: { rating: true, totalCompleted: true, totalCancelledByWorker: true, experienceLevel: true, hourlyRate: true },
    });
    if (!wp) return null;
    return {
      rating: wp.rating,
      totalCompleted: wp.totalCompleted,
      totalCancelledByWorker: wp.totalCancelledByWorker,
      experienceLevel: wp.experienceLevel,
      hourlyRate: wp.hourlyRate != null ? Number(wp.hourlyRate) : null,
    };
  }

  if (applicantRole === "PROVIDER") {
    const pp = await prisma.providerProfile.findUnique({
      where:  { userId: applicantUserId },
      select: { averageRating: true, totalCompleted: true, totalCancelledByWorker: true },
    });
    if (!pp) return null;
    return {
      rating: pp.averageRating,
      totalCompleted: pp.totalCompleted,
      totalCancelledByWorker: pp.totalCancelledByWorker,
      experienceLevel: null,
      hourlyRate: null,
    };
  }

  return null;
}

// Computes the ranking score for one application. Call whenever an
// application's proposed rate could have changed (create/update on apply).
export async function computeApplicationScore(
  applicantUserId: string,
  applicantRole: UserRole,
  proposedRate: number | null,
  budgetPerHour: number | null,
): Promise<number> {
  const signals = await loadSignals(applicantUserId, applicantRole);
  if (!signals) return 0;

  const rate = cancellationRate(signals.totalCompleted, signals.totalCancelledByWorker);
  const ratingScore      = (signals.rating / 5) * WEIGHTS.rating;
  const reliabilityScore = (1 - rate) * WEIGHTS.reliability;
  const experienceScore  = ((EXPERIENCE_LEVEL_RANK[signals.experienceLevel ?? ""] ?? 0) / MAX_EXPERIENCE_RANK) * WEIGHTS.experience;
  const priceScore       = priceFitScore(signals.hourlyRate, proposedRate, budgetPerHour) * WEIGHTS.priceFit;

  return Math.round((ratingScore + reliabilityScore + experienceScore + priceScore) * 100) / 100;
}
