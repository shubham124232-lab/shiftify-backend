// Provider workspace reads/writes behind the Provider demo pages (Matched/Saved Requests, Confirmed Service
// Starts, Offers and Assignments, Team Availability, Reports, Promotions). Reuses existing tables; the only new
// tables are the Team Availability request/reply pair.

import { prisma } from "../../lib/prisma";
import { notify } from "../../lib/notify";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../lib/errors";
import { missingRequiredDocs } from "../../middleware/marketplace.middleware";
import { providerServiceCategories, categoryLabel } from "../../lib/provider-categories";
import { devCodesEnabled } from "../../config/env";

const JOB_CARD = {
  id: true, title: true, category: true, urgency: true, suburb: true, state: true,
  scheduledStartAt: true, totalHours: true, status: true, fundingType: true, budgetPerHour: true,
  isRecurring: true, applicationDeadlineAt: true, createdAt: true,
  postedBy: { select: { roles: { select: { role: true } } } },
} as const;

type JobCardRow = {
  id: string; title: string; category: string; urgency: string; suburb: string; state: string | null;
  scheduledStartAt: Date; totalHours: unknown; status: string; fundingType: string | null; budgetPerHour: unknown;
  postedBy: { roles: { role: string }[] };
  isRecurring?: boolean; applicationDeadlineAt?: Date | null; createdAt?: Date;
};

// Participant identifiers stay private on cards — only the kind of poster is shown.
function posterKind(roles: { role: string }[]): string {
  const r = roles.map((x) => x.role);
  if (r.includes("COORDINATOR")) return "Support Coordinator";
  if (r.includes("PARTICIPANT")) return "Participant";
  if (r.includes("PROVIDER")) return "Provider";
  if (r.includes("PLAN_MANAGER")) return "Plan Manager";
  return "Poster";
}

function toCard(j: JobCardRow) {
  return {
    id: j.id, title: j.title, category: j.category, categoryLabel: categoryLabel(j.category), urgency: j.urgency,
    suburb: j.suburb, state: j.state, scheduledStartAt: j.scheduledStartAt, totalHours: j.totalHours === null ? null : Number(j.totalHours),
    status: j.status, fundingType: j.fundingType, budgetPerHour: j.budgetPerHour === null ? null : Number(j.budgetPerHour),
    posterKind: posterKind(j.postedBy.roles),
    isRecurring: j.isRecurring ?? false, applicationDeadlineAt: j.applicationDeadlineAt ?? null, createdAt: j.createdAt ?? null,
  };
}

// ─── Matched + Saved Requests ────────────────────────────────────────────────

export async function matchedRequests(userId: string) {
  const now = new Date();
  const listings = await prisma.providerListing.findMany({
    where: { providerUserId: userId, listingCategory: "SERVICE", status: "ACTIVE" },
    select: { serviceCategory: true, serviceCategories: true, suburb: true },
  });
  const categories = providerServiceCategories(listings);
  if (categories.length === 0) return { hasLiveServices: listings.length > 0, requests: [] };
  const areas = new Set(listings.map((l) => l.suburb.toLowerCase()));

  const rows = await prisma.supportRequest.findMany({
    where: {
      status: "OPEN",
      postedByUserId: { not: userId },
      scheduledStartAt: { gt: now },
      category: { in: categories },
      AND: [
        { OR: [{ visibilityTarget: "ALL" }, { visibilityTarget: "VERIFIED" }, { visibilityTarget: "PROVIDERS_ONLY" }, { visibilityTarget: null }] },
        { OR: [{ applicationDeadlineAt: null }, { applicationDeadlineAt: { gt: now } }] },
      ],
    },
    select: {
      ...JOB_CARD,
      bookmarks: { where: { workerUserId: userId, saved: true }, select: { id: true } },
      applications: { where: { applicantUserId: userId }, select: { status: true } },
    },
    orderBy: [{ urgency: "asc" }, { scheduledStartAt: "asc" }],
    take: 40,
  });

  return {
    hasLiveServices: true,
    requests: rows.map((r) => ({
      ...toCard(r as unknown as JobCardRow),
      reasons: [
        `Matches your ${categoryLabel(r.category)} service`,
        areas.has(r.suburb.toLowerCase()) ? `In your service area (${r.suburb})` : null,
      ].filter((x): x is string => !!x),
      saved: r.bookmarks.length > 0,
      responseStatus: r.applications[0]?.status ?? null,
    })),
  };
}

// Browse Requests: every open Participant / Coordinator request the Provider can respond to. Requests that fit a live
// service listing carry match reasons; the rest are shown with a "review" line (doc P40: filter by service, region, urgency).
export async function browseRequests(userId: string) {
  const now = new Date();
  const listings = await prisma.providerListing.findMany({
    where: { providerUserId: userId, listingCategory: "SERVICE", status: "ACTIVE" },
    select: { serviceCategory: true, serviceCategories: true, suburb: true },
  });
  const categories = new Set<string>(providerServiceCategories(listings));
  const areas = new Set(listings.map((l) => l.suburb.toLowerCase()));

  const rows = await prisma.supportRequest.findMany({
    where: {
      status: "OPEN",
      postedByUserId: { not: userId },
      scheduledStartAt: { gt: now },
      AND: [
        { OR: [{ visibilityTarget: "ALL" }, { visibilityTarget: "VERIFIED" }, { visibilityTarget: "PROVIDERS_ONLY" }, { visibilityTarget: null }] },
        { OR: [{ applicationDeadlineAt: null }, { applicationDeadlineAt: { gt: now } }] },
      ],
    },
    select: {
      ...JOB_CARD,
      bookmarks: { where: { workerUserId: userId, saved: true }, select: { id: true } },
      applications: { where: { applicantUserId: userId }, select: { status: true } },
    },
    orderBy: [{ urgency: "asc" }, { scheduledStartAt: "asc" }],
    take: 100,
  });

  return {
    hasLiveServices: listings.length > 0,
    requests: rows.map((r) => ({
      ...toCard(r as unknown as JobCardRow),
      reasons: [
        categories.has(r.category) ? `Matches your ${categoryLabel(r.category)} service` : null,
        areas.has(r.suburb.toLowerCase()) ? `In your service area (${r.suburb})` : null,
      ].filter((x): x is string => !!x),
      saved: r.bookmarks.length > 0,
      responseStatus: r.applications[0]?.status ?? null,
    })),
  };
}

export async function savedRequests(userId: string) {
  const rows = await prisma.jobBookmark.findMany({
    where: { workerUserId: userId, saved: true },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      createdAt: true,
      job: { select: { ...JOB_CARD, applications: { where: { applicantUserId: userId }, select: { status: true } } } },
    },
  });
  return {
    requests: rows.map((b) => ({
      ...toCard(b.job as unknown as JobCardRow),
      savedAt: b.createdAt,
      open: b.job.status === "OPEN",
      responseStatus: b.job.applications[0]?.status ?? null,
    })),
  };
}

// ─── Confirmed Service Starts ────────────────────────────────────────────────

// "Manage intake and start": the Provider records the agreed start, the nominated team member, both agreements and intake notes.
// This is a record, not a confirmation: worker acceptance and the poster's agreement are separate steps.
export async function saveServiceStart(
  userId: string, jobId: string,
  input: { agreedStartAt?: string | null; nominatedWorkerId?: string | null; serviceAgreement?: string; participantAgreement?: string; notes?: string; isDraft?: boolean },
) {
  const job = await prisma.supportRequest.findUnique({ where: { id: jobId }, select: { selectedApplicantUserId: true } });
  if (!job) throw new NotFoundError("Request not found");
  if (job.selectedApplicantUserId !== userId) throw new ForbiddenError("Only the Provider whose proposal was accepted can record intake");
  if (input.nominatedWorkerId) {
    const [managed, roster] = await Promise.all([
      prisma.user.findFirst({ where: { id: input.nominatedWorkerId, parentUserId: userId }, select: { id: true } }),
      prisma.providerTeamMember.findFirst({ where: { id: input.nominatedWorkerId, providerUserId: userId, removedAt: null }, select: { id: true } }),
    ]);
    if (!managed && !roster) throw new BadRequestError("The nominated worker must be on your internal team.");
  }
  const data = {
    ...(input.agreedStartAt !== undefined ? { agreedStartAt: input.agreedStartAt ? new Date(input.agreedStartAt) : null } : {}),
    ...(input.nominatedWorkerId !== undefined ? { nominatedWorkerId: input.nominatedWorkerId } : {}),
    ...(input.serviceAgreement ? { serviceAgreement: input.serviceAgreement } : {}),
    ...(input.participantAgreement ? { participantAgreement: input.participantAgreement } : {}),
    ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
    ...(input.isDraft !== undefined ? { isDraft: input.isDraft } : {}),
  };
  return prisma.serviceStartRecord.upsert({ where: { jobId }, create: { jobId, providerUserId: userId, ...data }, update: data });
}

export async function confirmedStarts(userId: string) {
  const [pending, intake, confirmed] = await Promise.all([
    prisma.jobApplication.findMany({
      where: { applicantUserId: userId, status: { in: ["INTERESTED", "SHORTLISTED"] }, job: { status: "OPEN" } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { status: true, updatedAt: true, job: { select: JOB_CARD } },
    }),
    prisma.supportRequest.findMany({
      where: { selectedApplicantUserId: userId, status: "ASSIGNED" },
      orderBy: { scheduledStartAt: "asc" },
      take: 50,
      select: { ...JOB_CARD, selectedAt: true, assignedWorker: { select: { name: true } } },
    }),
    prisma.supportRequest.findMany({
      where: { selectedApplicantUserId: userId, status: { in: ["CONFIRMED", "IN_PROGRESS", "COMPLETED"] } },
      orderBy: { scheduledStartAt: "desc" },
      take: 50,
      select: { ...JOB_CARD, assignedWorker: { select: { name: true } } },
    }),
  ]);
  // The Provider's own intake records (agreed start, agreements, nominated team member). Until the ServiceStartRecord
  // migration is applied the table is missing; the page must still load.
  const records = await prisma.serviceStartRecord.findMany({ where: { providerUserId: userId } }).catch(() => []);
  const rec = new Map(records.map((r) => [r.jobId, r]));
  return {
    awaitingAcceptance: pending.map((a) => ({ ...toCard(a.job as unknown as JobCardRow), applicationStatus: a.status, respondedAt: a.updatedAt })),
    awaitingIntake: intake.map((j) => ({ ...toCard(j as unknown as JobCardRow), selectedAt: j.selectedAt, workerName: j.assignedWorker?.name ?? null, intake: rec.get(j.id) ?? null })),
    startConfirmed: confirmed.map((j) => ({ ...toCard(j as unknown as JobCardRow), workerName: j.assignedWorker?.name ?? null })),
  };
}

// ─── Offers and Assignments ──────────────────────────────────────────────────

export async function offersAndAssignments(userId: string) {
  // An offer for a shift that has already started can no longer be answered.
  await prisma.internalShiftOffer.updateMany({
    where: { providerUserId: userId, status: "PENDING", job: { scheduledStartAt: { lt: new Date() } } },
    data: { status: "EXPIRED" },
  });
  const [internalOffers, invites, selectedPending, assignments] = await Promise.all([
    prisma.internalShiftOffer.findMany({
      where: { providerUserId: userId }, orderBy: { sentAt: "desc" }, take: 50,
      select: {
        id: true, status: true, memberType: true, memberName: true, offeredRate: true, sentAt: true, respondedAt: true,
        job: { select: { id: true, title: true, suburb: true, scheduledStartAt: true, scheduledEndAt: true, urgency: true, riskSafetyNotes: true, workerPreferences: true } },
      },
    }),
    prisma.jobInvite.findMany({
      where: { invitedByUserId: userId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, createdAt: true, amountAud: true,
        invitedUser: { select: { name: true } },
        job: { select: { id: true, title: true, suburb: true, scheduledStartAt: true, urgency: true } },
      },
    }),
    // A worker/provider picked on one of this Provider's own requests who has not accepted yet.
    prisma.supportRequest.findMany({
      where: { postedByUserId: userId, status: "ASSIGNED", workerConfirmedAt: null, selectedApplicantUserId: { not: null } },
      orderBy: { scheduledStartAt: "asc" },
      take: 50,
      select: { id: true, title: true, suburb: true, scheduledStartAt: true, urgency: true, selectedAt: true, selectedApplicant: { select: { name: true } } },
    }),
    prisma.supportRequest.findMany({
      where: {
        postedByUserId: userId,
        status: { in: ["ASSIGNED", "CONFIRMED", "IN_PROGRESS"] },
        OR: [{ workerConfirmedAt: { not: null } }, { assignedWorkerUserId: { not: null } }],
      },
      orderBy: { scheduledStartAt: "asc" },
      take: 100,
      select: {
        id: true, title: true, suburb: true, scheduledStartAt: true, scheduledEndAt: true, urgency: true, status: true,
        selectedApplicant: { select: { name: true } }, assignedWorker: { select: { name: true } },
      },
    }),
  ]);

  // A roster member has no login, so the confirmed offer is what names them on the assignment.
  const confirmedOffers = assignments.length
    ? await prisma.internalShiftOffer.findMany({ where: { jobId: { in: assignments.map((a) => a.id) }, status: "CONFIRMED" }, select: { jobId: true, memberName: true } })
    : [];
  const confirmedNames = new Map(confirmedOffers.map((o) => [o.jobId, o.memberName]));

  return {
    internalOffers: internalOffers.map((o) => ({ ...o, offeredRate: o.offeredRate === null ? null : Number(o.offeredRate) })),
    offers: [
      ...invites.map((i) => ({
        id: `invite-${i.id}`, kind: "INVITE" as const, to: i.invitedUser.name, sentAt: i.createdAt,
        amountAud: i.amountAud === null ? null : Number(i.amountAud), job: i.job,
      })),
      ...selectedPending.map((j) => ({
        id: `selected-${j.id}`, kind: "SELECTED" as const, to: j.selectedApplicant?.name ?? "Selected worker", sentAt: j.selectedAt, amountAud: null,
        job: { id: j.id, title: j.title, suburb: j.suburb, scheduledStartAt: j.scheduledStartAt, urgency: j.urgency },
      })),
    ],
    assignments: assignments.map((j) => ({
      id: j.id, title: j.title, suburb: j.suburb, scheduledStartAt: j.scheduledStartAt, scheduledEndAt: j.scheduledEndAt,
      urgency: j.urgency, status: j.status, workerName: j.assignedWorker?.name ?? j.selectedApplicant?.name ?? confirmedNames.get(j.id) ?? "Worker",
    })),
  };
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export async function reports(userId: string, fromIso?: string, toIso?: string) {
  const to = toIso ? new Date(toIso) : new Date();
  const from = fromIso ? new Date(fromIso) : new Date(to.getTime() - 30 * 86400000);
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) throw new BadRequestError("Choose a valid date range.");
  const range = { gte: from, lte: to };

  const [byUrgency, confirmed, converted, applicationsReceived, responsesSent, teamRoster, managedCount, services, housing, platinum, featured, connect] = await Promise.all([
    prisma.supportRequest.groupBy({ by: ["urgency"], where: { postedByUserId: userId, createdAt: range }, _count: { _all: true } }),
    prisma.supportRequest.count({ where: { postedByUserId: userId, selectedAt: range, status: { in: ["ASSIGNED", "CONFIRMED", "IN_PROGRESS", "COMPLETED"] } } }),
    prisma.directInquiry.count({ where: { recipientUserId: userId, parentInquiryId: null, status: "CONVERTED", createdAt: range } }),
    prisma.jobApplication.count({ where: { job: { postedByUserId: userId }, createdAt: range } }),
    prisma.jobApplication.count({ where: { applicantUserId: userId, createdAt: range } }),
    prisma.providerTeamMember.count({ where: { providerUserId: userId, removedAt: null } }),
    prisma.user.count({ where: { parentUserId: userId, accountType: "MANAGED", roles: { some: { role: "SUPPORT_WORKER" } } } }),
    prisma.providerListing.findMany({ where: { providerUserId: userId, listingCategory: "SERVICE", status: "ACTIVE" }, select: { openSlots: true } }),
    prisma.providerListing.count({ where: { providerUserId: userId, listingCategory: "HOUSING", status: "ACTIVE" } }),
    prisma.platinumTileCampaign.aggregate({ where: { providerUserId: userId, startsAt: range }, _sum: { priceAud: true } }),
    prisma.featuredShiftPurchase.aggregate({ where: { purchasedByUserId: userId, purchasedAt: range }, _sum: { priceAud: true } }),
    prisma.jobInvite.aggregate({ where: { invitedByUserId: userId, status: "ACCEPTED", amountAud: { not: null }, respondedAt: range }, _sum: { amountAud: true } }),
  ]);

  const lanes: Record<string, number> = { RAPID: 0, URGENT: 0, LAST_MINUTE: 0, ROUTINE: 0 };
  for (const g of byUrgency) lanes[g.urgency] = g._count._all;
  const num = (d: { toString(): string } | null | undefined) => (d ? Number(d.toString()) : 0);
  const spend = { platinumTile: num(platinum._sum.priceAud), featuredShift: num(featured._sum.priceAud), directConnect: num(connect._sum.amountAud) };

  return {
    from: from.toISOString(), to: to.toISOString(),
    staffingRequests: Object.values(lanes).reduce((a, b) => a + b, 0),
    lanes,
    confirmedAssignments: confirmed,
    convertedEnquiries: converted,
    applicationsReceived,
    responsesSent,
    internalTeamMembers: teamRoster + managedCount,
    openServiceSlots: services.reduce((sum, s) => sum + (s.openSlots ?? 0), 0),
    liveHousingListings: housing,
    spend: { ...spend, total: Math.round((spend.platinumTile + spend.featuredShift + spend.directConnect) * 100) / 100 },
  };
}

// ─── Promotions ──────────────────────────────────────────────────────────────

export async function promotions(userId: string) {
  const [featuredShifts, directConnect, campaigns, housing, eligible] = await Promise.all([
    prisma.featuredShiftPurchase.findMany({
      where: { purchasedByUserId: userId }, orderBy: { purchasedAt: "desc" }, take: 30,
      select: { id: true, tier: true, priceAud: true, purchasedAt: true, expiresAt: true, job: { select: { id: true, title: true } } },
    }),
    prisma.jobInvite.findMany({
      where: { invitedByUserId: userId, amountAud: { not: null } }, orderBy: { createdAt: "desc" }, take: 30,
      select: { id: true, status: true, amountAud: true, createdAt: true, invitedUser: { select: { name: true } }, job: { select: { id: true, title: true } } },
    }),
    prisma.platinumTileCampaign.findMany({ where: { providerUserId: userId }, orderBy: { startsAt: "desc" }, take: 30 }),
    prisma.providerListing.findMany({
      where: { providerUserId: userId, listingCategory: "HOUSING", isFeatured: true }, orderBy: { featuredSince: "desc" }, take: 30,
      select: { id: true, title: true, featuredQueuePosition: true, featuredSince: true, featuredExpiresAt: true, status: true },
    }),
    prisma.supportRequest.findMany({
      where: { postedByUserId: userId, status: "OPEN", scheduledStartAt: { gt: new Date() } },
      orderBy: { scheduledStartAt: "asc" }, take: 50,
      select: { id: true, title: true, urgency: true, suburb: true, scheduledStartAt: true, featuredUntil: true },
    }),
  ]);
  return {
    featuredShifts: featuredShifts.map((f) => ({ ...f, priceAud: Number(f.priceAud) })),
    directConnect: directConnect.map((d) => ({ ...d, amountAud: d.amountAud === null ? null : Number(d.amountAud) })),
    platinumCampaigns: campaigns.map((c) => ({ ...c, priceAud: Number(c.priceAud) })),
    featuredHousing: housing,
    eligibleShifts: eligible,
  };
}

// ─── Team Availability ───────────────────────────────────────────────────────

export async function teamAvailability(providerUserId: string) {
  const now = new Date();
  const managed = await prisma.user.findMany({
    where: { parentUserId: providerUserId, accountType: "MANAGED", roles: { some: { role: "SUPPORT_WORKER" } } },
    select: { id: true, name: true, status: true, workerProfile: { select: { isAvailableNow: true, availableNowUntil: true, servicesOffered: true } } },
    orderBy: { name: "asc" },
  });
  const managedIds = managed.map((m) => m.id);
  const [live, upcoming, roster, requests] = await Promise.all([
    managedIds.length ? prisma.supportRequest.findMany({ where: { assignedWorkerUserId: { in: managedIds }, status: "IN_PROGRESS" }, select: { assignedWorkerUserId: true } }) : [],
    managedIds.length ? prisma.supportRequest.findMany({ where: { assignedWorkerUserId: { in: managedIds }, status: { in: ["ASSIGNED", "CONFIRMED"] }, scheduledStartAt: { gt: now } }, select: { assignedWorkerUserId: true } }) : [],
    prisma.providerTeamMember.findMany({
      where: { providerUserId, removedAt: null }, orderBy: { name: "asc" },
      select: { id: true, name: true, inviteStatus: true, locations: true, skills: true, relationshipType: true, accessLevel: true, languages: true, credentialStatus: true, experienceYears: true, branch: { select: { name: true } } },
    }),
    prisma.teamAvailabilityRequest.findMany({ where: { providerUserId }, orderBy: { createdAt: "desc" }, take: 20, include: { replies: { orderBy: { memberName: "asc" } } } }),
  ]);
  const onShift = new Set(live.map((j) => j.assignedWorkerUserId));
  const upcomingBy = new Map<string, number>();
  for (const j of upcoming) if (j.assignedWorkerUserId) upcomingBy.set(j.assignedWorkerUserId, (upcomingBy.get(j.assignedWorkerUserId) ?? 0) + 1);

  return {
    members: [
      ...managed.map((m) => {
        const availableNow = !!m.workerProfile?.isAvailableNow && (!m.workerProfile.availableNowUntil || m.workerProfile.availableNowUntil > now);
        const status = m.status !== "ACTIVE" ? "INVITED" : onShift.has(m.id) ? "ON_SHIFT" : availableNow ? "AVAILABLE" : "NOT_SET";
        const so = m.workerProfile?.servicesOffered;
        const skills = Array.isArray(so) ? so.filter((x): x is string => typeof x === "string").map(categoryLabel) : [];
        return { key: `M:${m.id}`, name: m.name, kind: "MANAGED" as const, branch: null as string | null, skills, status, upcomingAssignments: upcomingBy.get(m.id) ?? 0, relationship: "Worker with login", access: "Personal assignment access", languages: [] as string[], credentialStatus: null as string | null, experienceYears: null as number | null };
      }),
      ...roster.map((m) => ({
        key: `R:${m.id}`, name: m.name, kind: "ROSTER" as const, branch: m.branch.name, skills: m.skills.map((k) => (/^[A-Z0-9_]+$/.test(k) ? categoryLabel(k) : k)), // codes become labels; typed labels stay as entered
        status: m.inviteStatus === "VERIFIED" ? "VERIFIED" : "INVITED", upcomingAssignments: 0,
        relationship: m.relationshipType === "CONTRACTOR" ? "Contractor" : m.relationshipType === "OTHER" ? "Other verified relationship" : "Employee",
        access: m.accessLevel === "LIMITED" ? "Limited access" : "Personal assignment access",
        languages: m.languages, credentialStatus: m.credentialStatus, experienceYears: m.experienceYears,
      })),
    ],
    requests,
  };
}

export async function createAvailabilityRequest(
  providerUserId: string,
  input: { jobId?: string; title?: string; message?: string; memberKeys: string[] },
) {
  let title = input.title?.trim() ?? "";
  let startsAt: Date | null = null;
  let endsAt: Date | null = null;
  if (input.jobId) {
    const job = await prisma.supportRequest.findUnique({ where: { id: input.jobId }, select: { postedByUserId: true, title: true, scheduledStartAt: true, scheduledEndAt: true } });
    if (!job || job.postedByUserId !== providerUserId) throw new NotFoundError("That shift was not found.");
    title = title || job.title;
    startsAt = job.scheduledStartAt;
    endsAt = job.scheduledEndAt;
  }
  if (!title) throw new BadRequestError("Choose a shift or give the request a title.");
  if (input.memberKeys.length === 0) throw new BadRequestError("Choose at least one team member.");

  const managedIds = input.memberKeys.filter((k) => k.startsWith("M:")).map((k) => k.slice(2));
  const rosterIds = input.memberKeys.filter((k) => k.startsWith("R:")).map((k) => k.slice(2));
  const [managed, roster] = await Promise.all([
    managedIds.length ? prisma.user.findMany({ where: { id: { in: managedIds }, parentUserId: providerUserId, accountType: "MANAGED" }, select: { id: true, name: true } }) : [],
    rosterIds.length ? prisma.providerTeamMember.findMany({ where: { id: { in: rosterIds }, providerUserId, removedAt: null }, select: { id: true, name: true } }) : [],
  ]);
  if (managed.length !== managedIds.length || roster.length !== rosterIds.length) throw new BadRequestError("One or more people are not on your team.");

  const request = await prisma.teamAvailabilityRequest.create({
    data: {
      providerUserId, jobId: input.jobId ?? null, title, startsAt, endsAt, message: input.message?.trim() || null,
      replies: {
        create: [
          ...managed.map((m) => ({ memberType: "MANAGED", memberUserId: m.id, memberName: m.name })),
          ...roster.map((m) => ({ memberType: "ROSTER", teamMemberId: m.id, memberName: m.name })),
        ],
      },
    },
    include: { replies: true },
  });

  const when = startsAt ? ` (${startsAt.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })})` : "";
  await Promise.all(managed.map((m) => notify.sendPushNotification(
    m.id, "Availability request", `Your organisation is asking if you are available for: ${title}${when}. Open your dashboard to reply.`,
    { requestId: request.id }, "TEAM_AVAILABILITY_REQUEST",
  ).catch(() => undefined)));

  return request;
}

// The Provider records the answer of a roster (mobile-only) member, e.g. after a phone call.
export async function recordRosterReply(providerUserId: string, replyId: string, status: "AVAILABLE" | "UNAVAILABLE") {
  const reply = await prisma.teamAvailabilityReply.findUnique({ where: { id: replyId }, include: { request: { select: { providerUserId: true } } } });
  if (!reply || reply.request.providerUserId !== providerUserId) throw new NotFoundError("Reply not found");
  // Login workers reply for themselves; the Provider may only preview their answer on staging.
  if (reply.memberType !== "ROSTER" && !devCodesEnabled) throw new ForbiddenError("Managed workers reply for themselves.");
  return prisma.teamAvailabilityReply.update({ where: { id: replyId }, data: { status, respondedAt: new Date() } });
}

// Managed worker side: requests addressed to me, newest first.
// ─── Internal shift offers (Provider doc P30) ─────────────────────────────────

export async function createInternalOffer(providerUserId: string, input: { jobId: string; memberKey: string }) {
  const job = await prisma.supportRequest.findUnique({
    where: { id: input.jobId },
    select: { postedByUserId: true, status: true, scheduledStartAt: true, budgetPerHour: true },
  });
  if (!job || job.postedByUserId !== providerUserId) throw new NotFoundError("That shift was not found.");
  if (job.status !== "OPEN") throw new BadRequestError("Offers can only be sent for a live, open shift.");
  if (job.scheduledStartAt <= new Date()) throw new BadRequestError("This shift has already started.");

  const isManaged = input.memberKey.startsWith("M:");
  const isRoster = input.memberKey.startsWith("R:");
  if (!isManaged && !isRoster) throw new BadRequestError("Choose a team member.");
  const id = input.memberKey.slice(2);
  const member = isManaged
    ? await prisma.user.findFirst({ where: { id, parentUserId: providerUserId, accountType: "MANAGED" }, select: { id: true, name: true } })
    : await prisma.providerTeamMember.findFirst({ where: { id, providerUserId, removedAt: null }, select: { id: true, name: true } });
  if (!member) throw new BadRequestError("That person is not on your team.");

  const existing = await prisma.internalShiftOffer.findFirst({
    where: { jobId: input.jobId, providerUserId, status: "PENDING", ...(isManaged ? { memberUserId: id } : { teamMemberId: id }) },
    select: { id: true },
  });
  if (existing) throw new BadRequestError("An offer to this person is already pending for this shift.");

  const offer = await prisma.internalShiftOffer.create({
    data: {
      providerUserId, jobId: input.jobId, memberType: isManaged ? "MANAGED" : "ROSTER",
      memberUserId: isManaged ? id : null, teamMemberId: isManaged ? null : id, memberName: member.name,
      offeredRate: job.budgetPerHour,
    },
  });
  if (isManaged) {
    await notify.sendPushNotification(id, "Shift offer from your organisation",
      "Your organisation sent you a shift offer. Open your dashboard to accept or decline. An offer does not confirm the shift.",
      { offerId: offer.id }, "TEAM_AVAILABILITY_REQUEST").catch(() => undefined);
  }
  return offer;
}

async function setOfferStatus(offerId: string, status: "ACCEPTED" | "DECLINED") {
  return prisma.internalShiftOffer.update({ where: { id: offerId }, data: { status, respondedAt: new Date() } });
}

// The Provider records the answer of a roster member (e.g. after a phone call), or - on staging only - previews the
// answer a login worker would give. A login worker normally answers from their own dashboard.
export async function recordInternalOfferResponse(providerUserId: string, offerId: string, status: "ACCEPTED" | "DECLINED") {
  const offer = await prisma.internalShiftOffer.findUnique({ where: { id: offerId } });
  if (!offer || offer.providerUserId !== providerUserId) throw new NotFoundError("Offer not found");
  if (offer.status !== "PENDING") throw new BadRequestError("This offer has already been answered or has expired.");
  if (offer.memberType === "MANAGED" && !devCodesEnabled) {
    throw new ForbiddenError("This worker answers from their own login.");
  }
  return setOfferStatus(offerId, status);
}

// Provider doc P30/P31: confirmation follows acceptance and a fresh eligibility check. The slot is committed once
// (concurrent confirmations cannot overfill it), the other offers for a filled request are closed, and a request
// with more workers required than confirmed stays open as a partial vacancy.
export async function confirmInternalOffer(providerUserId: string, offerId: string) {
  const offer = await prisma.internalShiftOffer.findUnique({
    where: { id: offerId },
    include: { job: { select: { id: true, title: true, postedByUserId: true, status: true, scheduledStartAt: true, scheduledEndAt: true, workersRequired: true } } },
  });
  if (!offer || offer.providerUserId !== providerUserId) throw new NotFoundError("Offer not found");
  if (offer.status === "CONFIRMED") throw new ConflictError("This offer is already confirmed.");
  if (offer.status !== "ACCEPTED") throw new BadRequestError("Only an accepted offer can be confirmed. The worker has not accepted yet.");
  const job = offer.job;
  if (job.postedByUserId !== providerUserId) throw new ForbiddenError("This is not your request.");
  if (job.status !== "OPEN") throw new BadRequestError("This request is no longer open for confirmation.");
  if (job.scheduledStartAt <= new Date()) throw new BadRequestError("This shift has already started.");

  // Eligibility is rechecked now, not at the time the offer was sent.
  if (offer.memberType === "MANAGED" && offer.memberUserId) {
    const worker = await prisma.user.findUnique({ where: { id: offer.memberUserId }, select: { status: true, parentUserId: true } });
    if (!worker || worker.parentUserId !== providerUserId) throw new ForbiddenError("That worker is no longer on your team.");
    if (worker.status !== "ACTIVE") throw new BadRequestError("That worker's setup is not finished yet.");
    const missing = await missingRequiredDocs(offer.memberUserId, "SUPPORT_WORKER");
    if (missing.length > 0) throw new ForbiddenError(`This worker's documents are incomplete: ${missing.join("; ")}`);
    const clash = await prisma.supportRequest.findFirst({
      where: { assignedWorkerUserId: offer.memberUserId, status: { in: ["ASSIGNED", "CONFIRMED", "IN_PROGRESS"] }, scheduledStartAt: { lt: job.scheduledEndAt }, scheduledEndAt: { gt: job.scheduledStartAt } },
      select: { title: true },
    });
    if (clash) throw new ConflictError(`${offer.memberName} already has an overlapping assignment ("${clash.title}").`);
  } else if (offer.teamMemberId) {
    const member = await prisma.providerTeamMember.findFirst({ where: { id: offer.teamMemberId, providerUserId, removedAt: null }, select: { inviteStatus: true } });
    if (!member) throw new ForbiddenError("That person is no longer on your team.");
    const clash = await prisma.internalShiftOffer.findFirst({
      where: { teamMemberId: offer.teamMemberId, status: "CONFIRMED", job: { scheduledStartAt: { lt: job.scheduledEndAt }, scheduledEndAt: { gt: job.scheduledStartAt } } },
      select: { job: { select: { title: true } } },
    });
    if (clash) throw new ConflictError(`${offer.memberName} already has an overlapping assignment ("${clash.job.title}").`);
  }

  const result = await prisma.$transaction(async (tx) => {
    const filled = await tx.internalShiftOffer.count({ where: { jobId: job.id, status: "CONFIRMED" } });
    if (filled >= job.workersRequired) throw new ConflictError("Every slot on this request is already filled.");
    const fresh = await tx.internalShiftOffer.updateMany({ where: { id: offerId, status: "ACCEPTED" }, data: { status: "CONFIRMED", respondedAt: new Date() } });
    if (fresh.count === 0) throw new ConflictError("This offer was just updated. Refresh and try again.");
    const nowFilled = filled + 1;
    const complete = nowFilled >= job.workersRequired;
    if (complete) {
      await tx.supportRequest.update({
        where: { id: job.id },
        data: { status: "ASSIGNED", workerConfirmedAt: new Date(), selectedAt: new Date(), ...(offer.memberType === "MANAGED" && offer.memberUserId ? { assignedWorkerUserId: offer.memberUserId } : {}) },
      });
      await tx.internalShiftOffer.updateMany({ where: { jobId: job.id, status: { in: ["PENDING", "ACCEPTED"] } }, data: { status: "EXPIRED" } });
    }
    return { filled: nowFilled, required: job.workersRequired, complete };
  }, { isolationLevel: "Serializable" });

  if (offer.memberType === "MANAGED" && offer.memberUserId) {
    void notify.sendPushNotification(offer.memberUserId, "Shift confirmed", `Your organisation confirmed you for "${job.title}".`, { jobId: job.id }, "JOB_ASSIGNED");
  }
  return result;
}

export async function myInternalOffers(workerUserId: string) {
  await prisma.internalShiftOffer.updateMany({
    where: { memberUserId: workerUserId, status: "PENDING", job: { scheduledStartAt: { lt: new Date() } } },
    data: { status: "EXPIRED" },
  });
  const rows = await prisma.internalShiftOffer.findMany({
    where: { memberUserId: workerUserId }, orderBy: { sentAt: "desc" }, take: 20,
    select: { id: true, status: true, offeredRate: true, sentAt: true, job: { select: { id: true, title: true, suburb: true, scheduledStartAt: true, scheduledEndAt: true } } },
  });
  return rows.map((r) => ({ ...r, offeredRate: r.offeredRate === null ? null : Number(r.offeredRate) }));
}

export async function respondToInternalOffer(workerUserId: string, offerId: string, status: "ACCEPTED" | "DECLINED") {
  const offer = await prisma.internalShiftOffer.findUnique({ where: { id: offerId } });
  if (!offer || offer.memberUserId !== workerUserId) throw new NotFoundError("Offer not found");
  if (offer.status !== "PENDING") throw new BadRequestError("This offer has already been answered or has expired.");
  const result = await setOfferStatus(offerId, status);
  // Provider doc P71: the Provider is told when an internal offer is answered.
  void notify.sendPushNotification(offer.providerUserId, `Internal offer ${status === "ACCEPTED" ? "accepted" : "declined"}`,
    `${offer.memberName} ${status === "ACCEPTED" ? "accepted" : "declined"} your shift offer.`, { jobId: offer.jobId }, "TEAM_AVAILABILITY_REQUEST").catch(() => undefined);
  return result;
}

export async function myAvailabilityRequests(workerUserId: string) {
  const replies = await prisma.teamAvailabilityReply.findMany({
    where: { memberUserId: workerUserId }, orderBy: { request: { createdAt: "desc" } }, take: 20,
    select: { id: true, status: true, respondedAt: true, request: { select: { id: true, title: true, startsAt: true, endsAt: true, message: true, createdAt: true } } },
  });
  return replies;
}

export async function respondToAvailabilityRequest(workerUserId: string, replyId: string, status: "AVAILABLE" | "UNAVAILABLE") {
  const reply = await prisma.teamAvailabilityReply.findUnique({ where: { id: replyId } });
  if (!reply || reply.memberUserId !== workerUserId) throw new NotFoundError("Request not found");
  const updated = await prisma.teamAvailabilityReply.update({
    where: { id: replyId }, data: { status, respondedAt: new Date() },
    include: { request: { select: { providerUserId: true, title: true, jobId: true } } },
  });
  const who = await prisma.user.findUnique({ where: { id: workerUserId }, select: { name: true } });
  void notify.sendPushNotification(updated.request.providerUserId, `Availability reply: ${status === "AVAILABLE" ? "available" : "unavailable"}`,
    `${who?.name ?? "A team member"} is ${status === "AVAILABLE" ? "available" : "unavailable"} for: ${updated.request.title}.`,
    { requestId: reply.requestId, ...(updated.request.jobId ? { jobId: updated.request.jobId } : {}) }, "TEAM_AVAILABILITY_REQUEST").catch(() => undefined);
  return updated;
}
