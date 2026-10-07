// Additive multi-worker roster — sits alongside the existing single
// assignedWorkerUserId flow (job.service.ts assignWorker/start/complete/confirm)
// without changing it. A job with zero JobAssignment rows behaves exactly as
// it did before this feature existed.

import { prisma } from "../../lib/prisma";
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from "../../lib/errors";
import { missingRequiredDocs } from "../../middleware/marketplace.middleware";
import type { CreateAssignmentInput, UpdateAssignmentStatusInput } from "../../validators/job.schema";

const ASSIGNMENT_SELECT = {
  id:           true,
  requestId:    true,
  workerUserId: true,
  status:       true,
  assignedAt:   true,
  workerUser:   { select: { id: true, name: true, avatarUrl: true } },
};

export async function createAssignment(jobId: string, requesterId: string, input: CreateAssignmentInput) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  if (!job) throw new NotFoundError("We couldn't find that job. It may have been removed.");
  if (job.postedByUserId !== requesterId) {
    throw new ForbiddenError("Only the job poster can add workers to this job");
  }
  if (["DRAFT", "CANCELLED", "CONFIRMED"].includes(job.status)) {
    throw new BadRequestError("Workers can't be added to this job in its current state.");
  }

  const worker = await prisma.user.findUnique({
    where:   { id: input.workerUserId },
    include: { roles: true },
  });
  if (!worker) throw new NotFoundError("Worker not found");
  if (!worker.roles.some((r) => r.role === "SUPPORT_WORKER")) {
    throw new BadRequestError("That user is not a support worker");
  }

  const missingDocs = await missingRequiredDocs(worker.id, "SUPPORT_WORKER");
  if (missingDocs.length > 0) {
    throw new ForbiddenError(
      `This worker can't be added until their documents are submitted: ${missingDocs.join("; ")}`,
    );
  }

  const existing = await prisma.jobAssignment.findUnique({
    where: { requestId_workerUserId: { requestId: jobId, workerUserId: input.workerUserId } },
  });
  if (existing) throw new ConflictError("That worker is already on this job's roster");

  return prisma.jobAssignment.create({
    data:   { requestId: jobId, workerUserId: input.workerUserId },
    select: ASSIGNMENT_SELECT,
  });
}

export async function listAssignments(jobId: string, userId: string) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  if (!job) throw new NotFoundError("We couldn't find that job. It may have been removed.");

  const isOwner = job.postedByUserId === userId;
  if (!isOwner) {
    const onRoster = await prisma.jobAssignment.findFirst({ where: { requestId: jobId, workerUserId: userId } });
    if (!onRoster) throw new ForbiddenError("Only the job poster or an assigned worker can view this roster");
  }

  return prisma.jobAssignment.findMany({
    where:   { requestId: jobId },
    orderBy: { assignedAt: "asc" },
    select:  ASSIGNMENT_SELECT,
  });
}

export async function updateAssignmentStatus(
  jobId: string,
  assignmentId: string,
  userId: string,
  input: UpdateAssignmentStatusInput,
) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId } });
  if (!job) throw new NotFoundError("We couldn't find that job. It may have been removed.");

  const assignment = await prisma.jobAssignment.findFirst({ where: { id: assignmentId, requestId: jobId } });
  if (!assignment) throw new NotFoundError("Assignment not found");
  if (assignment.status !== "ASSIGNED") {
    throw new BadRequestError("This assignment has already been finalised.");
  }

  const isOwner  = job.postedByUserId === userId;
  const isWorker = assignment.workerUserId === userId;

  if (input.status === "COMPLETED" && !isWorker) {
    throw new ForbiddenError("Only the assigned worker can mark their own assignment complete");
  }
  if (input.status === "CANCELLED" && !isOwner && !isWorker) {
    throw new ForbiddenError("Only the job poster or the assigned worker can cancel this assignment");
  }

  return prisma.jobAssignment.update({
    where:  { id: assignmentId },
    data:   { status: input.status },
    select: ASSIGNMENT_SELECT,
  });
}
