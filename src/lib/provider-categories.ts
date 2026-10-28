import { JobCategory } from "@prisma/client";

const VALID = new Set<string>(Object.values(JobCategory));

// Listings may hold a label ("Personal Care") or the enum value — normalise, keep only real categories.
export function providerServiceCategories(
  listings: { serviceCategory: string | null; serviceCategories: unknown }[],
): JobCategory[] {
  const out = new Set<JobCategory>();
  const add = (raw: string) => {
    const key = raw.trim().toUpperCase().replace(/[\s&/-]+/g, "_");
    if (VALID.has(key)) out.add(key as JobCategory);
  };
  for (const l of listings) {
    if (l.serviceCategory) add(l.serviceCategory);
    if (Array.isArray(l.serviceCategories)) for (const c of l.serviceCategories) if (typeof c === "string") add(c);
  }
  return [...out];
}

export const categoryLabel = (value: string): string =>
  value.toLowerCase().split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
