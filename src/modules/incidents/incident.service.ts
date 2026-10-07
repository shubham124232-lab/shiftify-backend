import { prisma } from "../../lib/prisma";
import { notify } from "../../lib/notify";
import { NotFoundError, ForbiddenError, BadRequestError } from "../../lib/errors";
import type { CreateIncidentInput, UpdateIncidentInput } from "../../validators/incident.schema";

async function notifyAdminsOfIncident(jobTitle: string, jobId: string, incidentId: string, category: string, description: string | null) {
  const admins = await prisma.user.findMany({
    where:  { roles: { some: { role: "ADMIN" } } },
    select: { id: true },
  });

  await Promise.allSettled(
    admins.map((a) =>
      notify.sendPushNotification(
        a.id,
        "Incident reported",
        `"${jobTitle}" — ${category}${description ? `: ${description}` : ""}`,
        { jobId, incidentId },
        "INCIDENT_REPORTED",
      ),
    ),
  );
}

export async function createIncident(jobId: string, reporterUserId: string, input: CreateIncidentInput) {
  const job = await prisma.supportRequest.findUnique({
    where:   { id: jobId },
    include: { applications: { select: { applicantUserId: true } } },
  });
  if (!job) throw new NotFoundError("Job not found");

  const isParty =
    job.postedByUserId          === reporterUserId ||
    job.forParticipantUserId    === reporterUserId ||
    job.selectedApplicantUserId === reporterUserId ||
    job.assignedWorkerUserId    === reporterUserId ||
    job.applications.some((a) => a.applicantUserId === reporterUserId);
  if (!isParty) throw new ForbiddenError("You don't have access to this job.");

  const incident = await prisma.incidentReport.create({
    data: {
      jobId,
      reporterUserId,
      category:     input.category,
      description:  input.description ?? null,
      evidenceUrls: input.evidenceUrls ?? [],
      status:       input.isDraft ? "DRAFT" : "OPEN",
    },
  });

  // Drafts aren't a submitted report yet — don't page admins until it's finalized.
  if (!input.isDraft) {
    await notifyAdminsOfIncident(job.title, jobId, incident.id, input.category, input.description ?? null);
  }

  return incident;
}

// GET /jobs/:id/incidents/draft — lets the reporter resume an in-progress
// report instead of starting blank when they navigate back to the job.
export async function getDraftIncident(jobId: string, reporterUserId: string) {
  return prisma.incidentReport.findFirst({
    where:   { jobId, reporterUserId, status: "DRAFT" },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateIncident(incidentId: string, userId: string, input: UpdateIncidentInput) {
  const incident = await prisma.incidentReport.findUnique({
    where:   { id: incidentId },
    include: { job: { select: { title: true } } },
  });
  if (!incident) throw new NotFoundError("Incident report not found");
  if (incident.reporterUserId !== userId) throw new ForbiddenError("Not your incident report");

  const isDraft = incident.status === "DRAFT";

  // Once a report is submitted (OPEN/RESOLVED) its category/description are a
  // record of what was reported — only evidence can still be added after the fact.
  if (!isDraft && (input.category !== undefined || input.description !== undefined)) {
    throw new BadRequestError("A submitted incident report's category and description can no longer be edited");
  }

  if (input.finalize && isDraft && !(input.category ?? incident.category)) {
    throw new BadRequestError("Select a category before submitting the report");
  }

  const data: Record<string, unknown> = {};
  if (input.category !== undefined)    data.category = input.category;
  if (input.description !== undefined) data.description = input.description;
  if (input.evidenceUrls !== undefined) {
    data.evidenceUrls = Array.from(new Set([...incident.evidenceUrls, ...input.evidenceUrls]));
  }
  if (input.finalize && isDraft) data.status = "OPEN";

  const updated = await prisma.incidentReport.update({ where: { id: incidentId }, data });

  if (input.finalize && isDraft) {
    await notifyAdminsOfIncident(incident.job.title, incident.jobId, incident.id, updated.category, updated.description ?? null);
  }

  return updated;
}
