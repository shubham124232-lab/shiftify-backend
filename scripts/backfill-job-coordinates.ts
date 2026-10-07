/* eslint-disable no-console */
// One-off backfill — fills lat/lng on existing OPEN jobs that predate the
// createJob centroid auto-fill, so they aren't invisible on the public Live
// Shiftboard's map/radius search.
//
//   npm run backfill:job-coordinates

import { prisma } from "../src/lib/prisma";
import { resolveJobCentroid } from "../src/lib/au-postcode-centroids";

async function main() {
  const jobs = await prisma.supportRequest.findMany({
    where:  { status: "OPEN", lat: null },
    select: { id: true, suburb: true, state: true, postcode: true },
  });

  console.log(`Found ${jobs.length} OPEN jobs missing coordinates`);

  let updated = 0;
  for (const job of jobs) {
    const centroid = resolveJobCentroid(job.suburb, job.state, job.postcode);
    if (!centroid) continue;
    await prisma.supportRequest.update({
      where: { id: job.id },
      data:  { lat: centroid.lat, lng: centroid.lng },
    });
    updated++;
  }

  console.log(`Backfilled coordinates for ${updated} jobs`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
