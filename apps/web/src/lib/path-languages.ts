// Supported path-content languages. The user picks one when creating a
// path; it is persisted as `StudyPlan.language` (BCP-47 lowercase) and drives
// the source side of in-place path translation.
//
// `code`    — BCP-47 lowercase (ISO 639-1 where possible). Matches the
//             detail-route `?lang=` validator (`/^[a-z]{2,3}(-[a-z0-9]{2,4})?$/`).
// `label`   — English name (for filter readability + accessibility).
// `endonym` — native name (what the creation picker shows).
//
// The first six (en/de/fr/es/it/tr) are the `POPULAR_LANGUAGES` set the
// pre-translation fan-out eagerly caches; the rest translate on-demand.

export const PATH_LANGUAGES = [
  { code: 'en', label: 'English', endonym: 'English' },
  { code: 'de', label: 'German', endonym: 'Deutsch' },
  { code: 'fr', label: 'French', endonym: 'Français' },
  { code: 'es', label: 'Spanish', endonym: 'Español' },
  { code: 'it', label: 'Italian', endonym: 'Italiano' },
  { code: 'tr', label: 'Turkish', endonym: 'Türkçe' },
  { code: 'pt', label: 'Portuguese', endonym: 'Português' },
  { code: 'nl', label: 'Dutch', endonym: 'Nederlands' },
  { code: 'pl', label: 'Polish', endonym: 'Polski' },
  { code: 'ru', label: 'Russian', endonym: 'Русский' },
  { code: 'uk', label: 'Ukrainian', endonym: 'Українська' },
  { code: 'sv', label: 'Swedish', endonym: 'Svenska' },
  { code: 'da', label: 'Danish', endonym: 'Dansk' },
  { code: 'no', label: 'Norwegian', endonym: 'Norsk' },
  { code: 'fi', label: 'Finnish', endonym: 'Suomi' },
  { code: 'cs', label: 'Czech', endonym: 'Čeština' },
  { code: 'sk', label: 'Slovak', endonym: 'Slovenčina' },
  { code: 'ro', label: 'Romanian', endonym: 'Română' },
  { code: 'hu', label: 'Hungarian', endonym: 'Magyar' },
  { code: 'el', label: 'Greek', endonym: 'Ελληνικά' },
  { code: 'bg', label: 'Bulgarian', endonym: 'Български' },
  { code: 'hr', label: 'Croatian', endonym: 'Hrvatski' },
  { code: 'sr', label: 'Serbian', endonym: 'Српски' },
  { code: 'sl', label: 'Slovenian', endonym: 'Slovenščina' },
  { code: 'ca', label: 'Catalan', endonym: 'Català' },
  { code: 'ar', label: 'Arabic', endonym: 'العربية' },
  { code: 'he', label: 'Hebrew', endonym: 'עברית' },
  { code: 'fa', label: 'Persian', endonym: 'فارسی' },
  { code: 'hi', label: 'Hindi', endonym: 'हिन्दी' },
  { code: 'bn', label: 'Bengali', endonym: 'বাংলা' },
  { code: 'id', label: 'Indonesian', endonym: 'Bahasa Indonesia' },
  { code: 'ms', label: 'Malay', endonym: 'Bahasa Melayu' },
  { code: 'vi', label: 'Vietnamese', endonym: 'Tiếng Việt' },
  { code: 'th', label: 'Thai', endonym: 'ไทย' },
  { code: 'ja', label: 'Japanese', endonym: '日本語' },
  { code: 'ko', label: 'Korean', endonym: '한국어' },
  { code: 'zh', label: 'Chinese', endonym: '中文' },
] as const;

export type PathLanguageCode = (typeof PATH_LANGUAGES)[number]['code'];

export const DEFAULT_PATH_LANGUAGE: PathLanguageCode = 'en';

/**
 * The eagerly pre-translated popular set (matches the `POPULAR_LANGUAGES`
 * env default). The community filter renders these as chips; the remaining
 * languages live in a "More…" dropdown beside them.
 */
export const POPULAR_PATH_LANGUAGE_CODES: readonly PathLanguageCode[] = [
  'en',
  'de',
  'fr',
  'es',
  'it',
  'tr',
];

/**
 * Human-readable name for a path language, used to tell the generator which
 * language to write content in — e.g. `"de"` → `"German (Deutsch)"`. Falls
 * back to English for an unknown code.
 */
export function pathLanguageName(code: PathLanguageCode): string {
  const entry = PATH_LANGUAGES.find((l) => l.code === code);
  if (!entry) return 'English';
  return entry.endonym && entry.endonym !== entry.label
    ? `${entry.label} (${entry.endonym})`
    : entry.label;
}

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
