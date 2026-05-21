// Supported path-content languages. The user picks one when creating a
// path; it is persisted as `StudyPlan.language` (BCP-47 lowercase) and
// snapshotted onto `SharedPath` at publish time — so moderation wordlist
// routing (L1), the community-library language filter, and the translation
// cache all key off this value. Kept in sync with the `POPULAR_LANGUAGES`
// default set used by the pre-translation fan-out.

export const PATH_LANGUAGES = [
  { code: 'en', label: 'English', endonym: 'English' },
  { code: 'de', label: 'German', endonym: 'Deutsch' },
  { code: 'fr', label: 'French', endonym: 'Français' },
  { code: 'es', label: 'Spanish', endonym: 'Español' },
  { code: 'it', label: 'Italian', endonym: 'Italiano' },
  { code: 'tr', label: 'Turkish', endonym: 'Türkçe' },
] as const;

export type PathLanguageCode = (typeof PATH_LANGUAGES)[number]['code'];

export const DEFAULT_PATH_LANGUAGE: PathLanguageCode = 'en';

const CODES = new Set<string>(PATH_LANGUAGES.map((l) => l.code));

/** Type guard — true only for a supported, exact lowercase code. */
export function isPathLanguage(value: unknown): value is PathLanguageCode {
  return typeof value === 'string' && CODES.has(value);
}

/**
 * Normalise arbitrary client input to a supported code, falling back to
 * the default (`en`). The server uses this so a malformed / unsupported
 * `language` in the request body can never persist a junk value onto
 * `StudyPlan.language`.
 */
export function normalizePathLanguage(value: unknown): PathLanguageCode {
  return isPathLanguage(value) ? value : DEFAULT_PATH_LANGUAGE;
}
