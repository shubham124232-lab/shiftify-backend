// Phone comparison helpers. Stored phone values are left exactly as saved
// (no data rewrite); lookups and duplicate checks compare every equivalent
// Australian spelling instead — 0412345678, +61412345678, 61412345678 and
// versions with spaces/dashes/brackets all match the same account.
import { isValidAuPhone } from "../validators/shared";

const AU_NATIONAL_RE = /^(?:\+?61|0)([23478]\d{8})$/;

function compact(raw: string): string {
  return raw.trim().replace(/[\s\-()]+/g, "");
}

/** True when the text is a syntactically valid Australian phone number. */
export function looksLikePhone(raw: string): boolean {
  return isValidAuPhone(compact(raw));
}

/** Every stored spelling that refers to the same Australian number (or just the compacted input). */
export function phoneVariants(raw: string): string[] {
  const s = compact(raw);
  const m = AU_NATIONAL_RE.exec(s);
  if (!m) return [s];
  return [`0${m[1]}`, `+61${m[1]}`, `61${m[1]}`];
}
