// P11 — pre-translation config. Owns the popular-language set, the
// popularity threshold, and the per-path pre-translation cost ceiling.
//
// Every value is read from env at CALL time (not module load) so a
// Coolify env rotation lands without a redeploy — the same pattern the
// on-demand route uses for the per-language daily-budget guard
// (`isDailyBudgetExceeded` in app/api/community/paths/[shareId]/route.ts).
//
// Defaults trace to the P0 spec §6 decisions:
//   - POPULAR_LANGUAGES = de,en,fr,es,it,tr (6 langs, capped to bound
//     pre-translation cost).
//   - POPULARITY_THRESHOLD = 10 (downloadCount crossing that fans out a
//     community path's pre-translations — see AC-Translate-13).
//   - PRETRANSLATION_COST_CEILING_USD = 1.00 (hard per-path ceiling from
//     P0 §7.4; the target is $0.50, the ceiling is the runaway guard).

const DEFAULT_POPULAR_LANGUAGES = ['de', 'en', 'fr', 'es', 'it', 'tr'] as const;
const DEFAULT_POPULARITY_THRESHOLD = 10;
const DEFAULT_PRETRANSLATION_COST_CEILING_USD = 1.0;

// Same permissive BCP-47 lowercase shape the detail route validates
// `?lang=` against — 2-3 letter primary tag + optional region/script
// sub-tag. Keeps the env-configured set and the on-demand surface in
// lockstep so a popular language is always a translatable language.
const LANG_PATTERN = /^[a-z]{2,3}(-[a-z0-9]{2,4})?$/;

/**
 * The popular-language set the pre-translation fan-out targets. Parsed
 * from `POPULAR_LANGUAGES` (comma-separated, e.g. "de,en,fr,es,it,tr"),
 * lowercased, de-duped, and filtered to well-formed BCP-47 codes. Falls
 * back to the documented default set when the env var is missing, empty,
 * or parses to nothing valid — a malformed env var must never silently
 * collapse the funnel anchor's language coverage to zero.
 */
export function getPopularLanguages(): string[] {
  const raw = process.env.POPULAR_LANGUAGES;
  if (!raw || raw.trim() === '') return [...DEFAULT_POPULAR_LANGUAGES];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const lang = part.trim().toLowerCase();
    if (lang && LANG_PATTERN.test(lang) && !seen.has(lang)) {
      seen.add(lang);
      out.push(lang);
    }
  }
  return out.length > 0 ? out : [...DEFAULT_POPULAR_LANGUAGES];
}

/**
 * The clone-count at which a community path first fans out its popular-
 * language pre-translations. Read from `POPULARITY_THRESHOLD`; a
 * missing / non-positive / non-finite value falls back to 10.
 */
export function getPopularityThreshold(): number {
  const raw = process.env.POPULARITY_THRESHOLD;
  if (raw === undefined || raw === '') return DEFAULT_POPULARITY_THRESHOLD;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_POPULARITY_THRESHOLD;
}

/**
 * Hard per-path ceiling for a single fan-out's cumulative spend. The
 * fan-out aborts the remaining languages once cumulative cost crosses
 * this, so a runaway translation can't blow the monthly pre-translation
 * budget (P0 §7.4). Read from `PRETRANSLATION_COST_CEILING_USD`; falls
 * back to $1.00.
 */
export function getPretranslationCostCeilingUsd(): number {
  const raw = process.env.PRETRANSLATION_COST_CEILING_USD;
  if (raw === undefined || raw === '') return DEFAULT_PRETRANSLATION_COST_CEILING_USD;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PRETRANSLATION_COST_CEILING_USD;
}
