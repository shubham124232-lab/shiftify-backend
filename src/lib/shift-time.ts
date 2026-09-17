// Time-of-day bucketing for the public Live Shiftboard's filter. A shift's
// `scheduledStartAt` is a UTC instant — the "morning/afternoon/evening" a
// visitor means is relative to the JOB's own state, not the server's or the
// visitor's timezone, so we convert via each state's IANA zone before
// bucketing rather than reading the UTC hour directly.

export type TimeOfDay = "MORNING" | "AFTERNOON" | "EVENING" | "OVERNIGHT";

const STATE_TIMEZONE: Record<string, string> = {
  NSW: "Australia/Sydney",
  VIC: "Australia/Melbourne",
  ACT: "Australia/Sydney",
  TAS: "Australia/Hobart",
  QLD: "Australia/Brisbane",
  SA:  "Australia/Adelaide",
  NT:  "Australia/Darwin",
  WA:  "Australia/Perth",
};

const DEFAULT_TIMEZONE = "Australia/Sydney";

function localHour(date: Date, state: string): number {
  const timeZone = STATE_TIMEZONE[state] ?? DEFAULT_TIMEZONE;
  const hourStr = new Intl.DateTimeFormat("en-AU", { timeZone, hour: "numeric", hour12: false }).format(date);
  // "24" is midnight in some locales' 24-hour formatting — normalize to 0.
  const hour = Number(hourStr);
  return hour === 24 ? 0 : hour;
}

export function bucketForShift(scheduledStartAt: Date, state: string): TimeOfDay {
  const hour = localHour(scheduledStartAt, state);
  if (hour >= 6 && hour < 12)  return "MORNING";
  if (hour >= 12 && hour < 18) return "AFTERNOON";
  if (hour >= 18 && hour < 24) return "EVENING";
  return "OVERNIGHT";
}
