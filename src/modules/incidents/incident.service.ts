import { prisma } from "../../lib/prisma";
import { notify } from "../../lib/notify";
import { NotFoundError, ForbiddenError } from "../../lib/errors";
import type { CreateIncidentInput } from "../../validators/incident.schema";

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
      category:    input.category,
      description: input.description ?? null,
    },
  });

  const admins = await prisma.user.findMany({
    where:  { roles: { some: { role: "ADMIN" } } },
    select: { id: true },
  });

  await Promise.allSettled(
    admins.map((a) =>
      notify.sendPushNotification(
        a.id,
        "Incident reported",
        `"${job.title}" — ${input.category}${input.description ? `: ${input.description}` : ""}`,
        { jobId, incidentId: incident.id },
        "INCIDENT_REPORTED",
      ),
    ),
  );

  return incident;
}
