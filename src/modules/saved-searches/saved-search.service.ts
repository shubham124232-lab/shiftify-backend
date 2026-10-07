import { prisma } from "../../lib/prisma";
import { NotFoundError, ForbiddenError } from "../../lib/errors";
import { notify } from "../../lib/notify";
import type { CreateSavedSearchInput, UpdateSavedSearchInput } from "../../validators/saved-search.schema";

export async function createSavedSearch(workerId: string, data: CreateSavedSearchInput) {
  return prisma.savedSearch.create({
    data: { workerId, label: data.label, filters: data.filters },
  });
}

export async function listSavedSearches(workerId: string) {
  return prisma.savedSearch.findMany({
    where: { workerId },
    orderBy: { createdAt: "desc" },
  });
}

async function requireOwnedSavedSearch(workerId: string, id: string) {
  const existing = await prisma.savedSearch.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Saved search not found");
  if (existing.workerId !== workerId) throw new ForbiddenError("Not your saved search");
  return existing;
}

export async function updateSavedSearch(workerId: string, id: string, data: UpdateSavedSearchInput) {
  await requireOwnedSavedSearch(workerId, id);
  return prisma.savedSearch.update({
    where: { id },
    data: {
      ...(data.label    !== undefined ? { label: data.label }       : {}),
      ...(data.filters  !== undefined ? { filters: data.filters }   : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
}

export async function deleteSavedSearch(workerId: string, id: string) {
  await requireOwnedSavedSearch(workerId, id);
  await prisma.savedSearch.delete({ where: { id } });
}

// Called from job.service.ts publishJob — checks every active saved search
// against a newly-published job and notifies the worker on a match.
export async function notifyMatchingSavedSearches(job: {
  id: string;
  title: string;
  suburb: string;
  state: string;
  category: string;
  urgency: string;
  shiftType: string | null;
  fundingType: string | null;
  isRecurring: boolean;
}): Promise<void> {
  const candidates = await prisma.savedSearch.findMany({ where: { isActive: true } });

  for (const search of candidates) {
    const f = search.filters as Record<string, unknown>;
    if (f.suburb && !job.suburb.toLowerCase().includes(String(f.suburb).toLowerCase())) continue;
    if (f.state && job.state.toLowerCase() !== String(f.state).toLowerCase()) continue;
    if (f.category && f.category !== job.category) continue;
    if (f.urgency && f.urgency !== job.urgency) continue;
    if (f.shiftType && f.shiftType !== job.shiftType) continue;
    if (f.fundingType && f.fundingType !== job.fundingType) continue;
    if (typeof f.isRecurring === "boolean" && f.isRecurring !== job.isRecurring) continue;

    await notify.sendPushNotification(
      search.workerId,
      "New job matches your saved search",
      job.title,
      { jobId: job.id, savedSearchId: search.id },
      "NEW_JOB_NEARBY",
    );
  }
}
