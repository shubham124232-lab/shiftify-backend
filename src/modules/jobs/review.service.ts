import { prisma } from "../../lib/prisma";
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from "../../lib/errors";
import type { CreateReviewInput } from "../../validators/job.schema";

// A job's two review-eligible parties: the poster (client/coordinator/plan manager)
// and whichever worker actually did the work (direct-assign or provider-selected).
function reviewParties(job: { postedByUserId: string; assignedWorkerUserId: string | null; selectedApplicantUserId: string | null }) {
  return {
    clientId:      job.postedByUserId,
    workerPartyId: job.assignedWorkerUserId ?? job.selectedApplicantUserId,
  };
}

async function recomputeRatingAggregate(userId: string) {
  const agg = await prisma.review.aggregate({
    where:  { revieweeUserId: userId },
    _avg:   { rating: true },
    _count: { rating: true },
  });
  const average = agg._avg.rating ?? 0;
  const count   = agg._count.rating;

  await Promise.all([
    prisma.workerProfile.updateMany({ where: { userId }, data: { rating: average, totalReviews: count } }),
    prisma.providerProfile.updateMany({ where: { userId }, data: { averageRating: average, totalRatings: count } }),
    prisma.coordinatorProfile.updateMany({ where: { userId }, data: { averageRating: average, totalRatings: count } }),
  ]);
}

export async function createReview(jobId: string, raterUserId: string, input: CreateReviewInput) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  if (!job) throw new NotFoundError("Job not found");
  if (job.status !== "CONFIRMED") {
    throw new BadRequestError("Reviews can only be left once a job has been confirmed complete.");
  }

  const { clientId, workerPartyId } = reviewParties(job);
  if (!workerPartyId) throw new BadRequestError("This job has no assigned worker to review.");

  let revieweeUserId: string;
  if (raterUserId === clientId) revieweeUserId = workerPartyId;
  else if (raterUserId === workerPartyId) revieweeUserId = clientId;
  else throw new ForbiddenError("Only the client or the assigned worker can review this job");

  const existing = await prisma.review.findUnique({
    where: { requestId_raterUserId_revieweeUserId: { requestId: jobId, raterUserId, revieweeUserId } },
  });
  if (existing) throw new ConflictError("You've already reviewed this job");

  const review = await prisma.review.create({
    data: {
      requestId: jobId,
      raterUserId,
      revieweeUserId,
      rating:  input.rating,
      comment: input.comment ?? null,
    },
  });

  await recomputeRatingAggregate(revieweeUserId);
  return review;
}

export async function listReviews(jobId: string) {
  return prisma.review.findMany({
    where:   { requestId: jobId },
    orderBy: { createdAt: "desc" },
    include: {
      rater:    { select: { id: true, name: true, avatarUrl: true } },
      reviewee: { select: { id: true, name: true, avatarUrl: true } },
    },
  });
}
