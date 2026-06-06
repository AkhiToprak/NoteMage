/**
 * Pure date-of-birth helpers shared by the client sign-up screens and the
 * server register / birth-date routes. No server-only imports — safe to
 * import from client components.
 */

/**
 * Minimum age to create a NoteMage account. Set to 16 to match the privacy
 * policy's stated digital-consent age (GDPR Art.8 default; Germany/NL/IE and
 * other EU/EEA states require 16). Lower to 13 only together with a verifiable
 * parental-consent flow for 13–15-year-olds in 16-threshold jurisdictions, or
 * make it country-aware — do not silently drop below the disclosed policy.
 */
export const MIN_AGE = 16;

/** Oldest plausible age — anything beyond this is treated as a typo. */
const MAX_AGE = 120;

/** Whole years between `birthDate` and `now`, both read in UTC. */
export function computeAge(birthDate: Date, now: Date = new Date()): number {
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birthDate.getUTCDate())) {
    age -= 1;
  }
  return age;
}

/**
 * Parse a `YYYY-MM-DD` string into a UTC-midnight Date, or return null when
 * the string is malformed, not a real calendar date, in the future, or older
 * than MAX_AGE. The round-trip check rejects values like `2021-02-30`.
 */
export function parseBirthDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  const now = new Date();
  if (date.getTime() > now.getTime()) return null;
  if (computeAge(date, now) > MAX_AGE) return null;
  return date;
}

/** True when the date of birth is valid and the person is at least MIN_AGE. */
export function meetsMinimumAge(value: unknown): boolean {
  const date = parseBirthDate(value);
  return date !== null && computeAge(date) >= MIN_AGE;
}
