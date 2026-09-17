// Suburb/postcode -> approximate centroid lookup for auto-filling a new job's
// lat/lng at posting time (see job.service.ts createJob). This is intentionally
// suburb-level precision (~1-5km), never a street address — see the locked
// geo-matching-only decision: lat/lng stays display-only, never GPS/attendance.
//
// Coverage: state/territory capital-city centroids (used whenever a job's
// suburb isn't in the curated list below) plus a curated set of well-known
// suburbs across the major metro areas. This is NOT a full ABS/Australia Post
// postcode dataset — widen this table over time as gaps are noticed, or swap
// in a licensed full dataset later; the lookup shape (postcode -> suburb+state
// fallback -> state capital) stays the same either way.

interface Centroid { lat: number; lng: number }

const STATE_CAPITAL_CENTROID: Record<string, Centroid> = {
  NSW: { lat: -33.8688, lng: 151.2093 }, // Sydney
  VIC: { lat: -37.8136, lng: 144.9631 }, // Melbourne
  QLD: { lat: -27.4698, lng: 153.0251 }, // Brisbane
  WA:  { lat: -31.9523, lng: 115.8613 }, // Perth
  SA:  { lat: -34.9285, lng: 138.6007 }, // Adelaide
  TAS: { lat: -42.8821, lng: 147.3272 }, // Hobart
  ACT: { lat: -35.2809, lng: 149.1300 }, // Canberra
  NT:  { lat: -12.4634, lng: 130.8456 }, // Darwin
};

// Keyed by "POSTCODE" (preferred, unambiguous) — populated where known.
const POSTCODE_CENTROID: Record<string, Centroid> = {
  "2150": { lat: -33.8150, lng: 150.9999 }, // Parramatta
  "2750": { lat: -33.7511, lng: 150.6942 }, // Penrith
  "2170": { lat: -33.9200, lng: 150.9235 }, // Liverpool
  "2148": { lat: -33.7668, lng: 150.9057 }, // Blacktown
  "2560": { lat: -34.0631, lng: 150.8143 }, // Campbelltown
  "2065": { lat: -33.8258, lng: 151.2108 }, // North Shore (Chatswood)
  "2230": { lat: -34.0567, lng: 151.1522 }, // Cronulla
  "2154": { lat: -33.7307, lng: 151.0003 }, // Castle Hill
  "2200": { lat: -33.9171, lng: 151.0350 }, // Bankstown
  "2112": { lat: -33.8151, lng: 151.1050 }, // Ryde
  "2077": { lat: -33.7042, lng: 151.0986 }, // Hornsby
  "2026": { lat: -33.8915, lng: 151.2767 }, // Bondi
};

// Keyed by "SUBURB|STATE" (uppercased) — fallback when postcode is missing/unmatched.
const SUBURB_STATE_CENTROID: Record<string, Centroid> = {
  "PARRAMATTA|NSW":    POSTCODE_CENTROID["2150"],
  "PENRITH|NSW":       POSTCODE_CENTROID["2750"],
  "LIVERPOOL|NSW":     POSTCODE_CENTROID["2170"],
  "BLACKTOWN|NSW":     POSTCODE_CENTROID["2148"],
  "CAMPBELLTOWN|NSW":  POSTCODE_CENTROID["2560"],
  "CRONULLA|NSW":      POSTCODE_CENTROID["2230"],
  "CASTLE HILL|NSW":   POSTCODE_CENTROID["2154"],
  "BANKSTOWN|NSW":     POSTCODE_CENTROID["2200"],
  "RYDE|NSW":          POSTCODE_CENTROID["2112"],
  "HORNSBY|NSW":       POSTCODE_CENTROID["2077"],
  "BONDI|NSW":         POSTCODE_CENTROID["2026"],
};

export function resolveJobCentroid(
  suburb: string | null | undefined,
  state: string | null | undefined,
  postcode?: string | null,
): Centroid | null {
  if (postcode && POSTCODE_CENTROID[postcode]) return POSTCODE_CENTROID[postcode];

  if (suburb && state) {
    const key = `${suburb.trim().toUpperCase()}|${state.trim().toUpperCase()}`;
    if (SUBURB_STATE_CENTROID[key]) return SUBURB_STATE_CENTROID[key];
  }

  if (state && STATE_CAPITAL_CENTROID[state.trim().toUpperCase()]) {
    return STATE_CAPITAL_CENTROID[state.trim().toUpperCase()];
  }

  return null;
}
