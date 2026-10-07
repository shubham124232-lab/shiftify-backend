import type { UserRole } from "@prisma/client";

// SW doc Window 14 — a worker's own choices about who finds their profile and how much of it shows
// before a Connect exists. Shared by every pre-Connect discovery surface (Find Workers, professional search).

// Which `visibleTo` values let this viewer see the profile. A worker who has not chosen (null) is visible to all
// eligible users; PAUSED is visible to nobody.
export function workerAudienceWhere(viewerRole: UserRole | undefined) {
  const audience =
    viewerRole === "PARTICIPANT" ? "PARTICIPANTS"
    : viewerRole === "COORDINATOR" ? "COORDINATORS"
    : viewerRole === "PROVIDER" ? "PROVIDERS"
    : null;
  return { OR: [{ visibleTo: null }, { visibleTo: "ALL" }, ...(audience ? [{ visibleTo: audience }] : [])] };
}

export function toFirstNameInitial(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

// "General area" hides the suburb and shows the state and the first two postcode digits (e.g. "NSW 21xx").
export function maskLocation(
  w: { suburb: string | null; state: string | null; postcode?: string | null; locationDisplay?: string | null },
): { suburb: string | null; state: string | null; generalArea?: string } {
  if (w.locationDisplay !== "GENERAL_AREA") return { suburb: w.suburb, state: w.state };
  const area = [w.state, w.postcode && w.postcode.length >= 2 ? `${w.postcode.slice(0, 2)}xx` : null].filter(Boolean).join(" ");
  return { suburb: null, state: w.state, generalArea: area || undefined };
}
