// Demo data for client walkthroughs: one Rapid "Rapid personal care cover" request posted by a
// Provider, with two worker applications (Sophie Wilson, Priya Patel) — mirrors the Provider demo.
//
// Usage (from Backend/, with the target database in .env):
//   DEMO_PROVIDER_EMAIL=carepartners@shiftify.local npm run seed:demo-applications
//
// Safe to re-run: the two demo workers are upserted by email and the request/applications are
// only created when the Provider has no open request with this title. Remove later with
//   DEMO_PROVIDER_EMAIL=... DEMO_REMOVE=1 npm run seed:demo-applications

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { REQUIRED_DOCS_BY_ROLE } from "../src/middleware/marketplace.middleware";

const prisma = new PrismaClient();

const TITLE = "Rapid personal care cover";
const DEMO_WORKERS = [
  { email: "sophie.wilson.demo@shiftify.local", name: "Sophie Wilson", phone: "+61400009001", rate: 64, services: ["PERSONAL_CARE", "COMMUNITY_ACCESS"], level: "EXPERIENCED", note: "Available now — can arrive in about 25 minutes." },
  { email: "priya.patel.demo@shiftify.local",   name: "Priya Patel",   phone: "+61400009002", rate: 68, services: ["PERSONAL_CARE", "COMPLEX_CARE"],     level: "EXPERT",      note: "Can arrive in about 40 minutes." },
];

async function ensureWorkerDocs(userId: string) {
  const required = REQUIRED_DOCS_BY_ROLE["SUPPORT_WORKER"] ?? [];
  const have = new Set((await prisma.document.findMany({ where: { userId, docType: { in: required } }, select: { docType: true } })).map((d) => d.docType));
  for (const docType of required) {
    if (have.has(docType)) continue;
    await prisma.document.create({
      data: { userId, docType, filePath: `seed/${userId}/${String(docType).toLowerCase()}.pdf`, fileName: `${String(docType).toLowerCase()}.pdf`, mimeType: "application/pdf", sizeBytes: 1024, status: "VERIFIED" },
    });
  }
}

async function main() {
  const providerEmail = process.env.DEMO_PROVIDER_EMAIL;
  if (!providerEmail) throw new Error("Set DEMO_PROVIDER_EMAIL to the Provider account that should own the demo request.");

  const host = (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").replace(/\/.*$/, "");
  console.log(`[demo] Database host: ${host || "(unknown)"}`);

  const provider = await prisma.user.findUnique({ where: { email: providerEmail }, select: { id: true, name: true } });
  if (!provider) throw new Error(`No user with email ${providerEmail}`);

  if (process.env.DEMO_REMOVE === "1") {
    const jobs = await prisma.supportRequest.findMany({ where: { postedByUserId: provider.id, title: TITLE }, select: { id: true } });
    await prisma.jobApplication.deleteMany({ where: { jobId: { in: jobs.map((j) => j.id) } } });
    await prisma.supportRequest.deleteMany({ where: { id: { in: jobs.map((j) => j.id) } } });
    console.log(`[demo] Removed ${jobs.length} demo request(s). Demo worker accounts were left in place.`);
    return;
  }

  const existing = await prisma.supportRequest.findFirst({ where: { postedByUserId: provider.id, title: TITLE, status: "OPEN" }, select: { id: true } });
  if (existing) { console.log(`[demo] Open request already exists (${existing.id}). Nothing to do.`); return; }

  const freePlan = await prisma.plan.findUnique({ where: { key: "WORKER_FREE" } });
  const passwordHash = await bcrypt.hash("Password@123", 10);

  const workers: { id: string; name: string; note: string; rate: number }[] = [];
  for (const w of DEMO_WORKERS) {
    const u = await prisma.user.upsert({
      where: { email: w.email },
      update: {},
      create: {
        email: w.email, phone: w.phone, passwordHash, name: w.name, accountType: "SELF", status: "ACTIVE",
        emailVerified: true, phoneVerified: true, defaultSuburb: "Parramatta", defaultState: "NSW", defaultPostcode: "2150",
        roles: { create: { role: "SUPPORT_WORKER", isActiveDefault: true } },
        workerProfile: {
          create: {
            rightToWork: "CITIZEN", workType: "CONTRACTOR", servicesOffered: w.services, experienceLevel: w.level,
            availabilityType: "CASUAL", travelRadiusKm: 25, hasVehicle: true, insuranceValid: true, hourlyRate: w.rate,
            bio: "Demo worker for the Provider walkthrough.", isAvailableNow: true, suburb: "Parramatta", state: "NSW",
          },
        },
      },
      select: { id: true },
    });
    if (freePlan) {
      const sub = await prisma.userSubscription.findFirst({ where: { userId: u.id, planId: freePlan.id, status: "ACTIVE" } });
      if (!sub) await prisma.userSubscription.create({ data: { userId: u.id, planId: freePlan.id, status: "ACTIVE", mockReceiptRef: "SEED-DEMO" } });
    }
    await ensureWorkerDocs(u.id);
    workers.push({ id: u.id, name: w.name, note: w.note, rate: w.rate });
  }

  const start = new Date(Date.now() + 45 * 60000);
  const end = new Date(start.getTime() + 4 * 3600000);
  const job = await prisma.supportRequest.create({
    data: {
      postedByUserId: provider.id, forParticipantUserId: provider.id,
      title: TITLE, description: "Personal care cover with manual handling and current First Aid. Essential care instructions are released to the confirmed worker.",
      category: "PERSONAL_CARE", urgency: "RAPID", status: "OPEN",
      suburb: "Parramatta", state: "NSW", scheduledStartAt: start, scheduledEndAt: end, totalHours: 4,
      visibilityTarget: "ALL",
    },
    select: { id: true },
  });

  for (const w of workers) {
    await prisma.jobApplication.create({
      data: { jobId: job.id, applicantUserId: w.id, applicantRole: "SUPPORT_WORKER", status: "INTERESTED", proposedRate: w.rate, rateResponse: "OFFER_OWN", availabilityType: "YES_EXACT", note: w.note, score: 80 },
    });
  }

  console.log(`[demo] Created "${TITLE}" (${job.id}) for ${provider.name ?? providerEmail} with ${workers.length} applications.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
