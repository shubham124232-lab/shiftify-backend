/* eslint-disable no-console */
// One-off backfill — computes JobApplication.score for existing rows that
// were created before scoring was wired into applyToJob().
//
//   npm run backfill:scores

import { prisma } from "../src/lib/prisma";
import { computeApplicationScore } from "../src/modules/jobs/job-scoring";

async function main() {
  const applications = await prisma.jobApplication.findMany({
    where:  { status: { not: "WITHDRAWN" } },
    select: { id: true, applicantUserId: true, applicantRole: true, proposedRate: true, jobId: true },
  });

  console.log(`Found ${applications.length} applications to score`);

  let updated = 0;
  for (const app of applications) {
    const job = await prisma.supportRequest.findUnique({
      where:  { id: app.jobId },
      select: { budgetPerHour: true },
    });

    const score = await computeApplicationScore(
      app.applicantUserId,
      app.applicantRole,
      app.proposedRate != null ? Number(app.proposedRate) : null,
      job?.budgetPerHour != null ? Number(job.budgetPerHour) : null,
    );

    await prisma.jobApplication.update({ where: { id: app.id }, data: { score } });
    updated++;
  }

  console.log(`Scored ${updated} applications`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
