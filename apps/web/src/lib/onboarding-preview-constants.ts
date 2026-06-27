/* Shared caps, types, and the corpus-truncation helper for the anonymous
 * onboarding preview (real-generation plan, P1).
 *
 * Imported by BOTH the client extractor (onboarding-corpus.ts) and the server
 * route (app/api/start/preview/route.ts) so the client extraction cap and the
 * server defensive cap can never drift. Keep this module pure — no browser or
 * node APIs, no heavy imports — so it's safe on either side of the boundary.
 *
 * The numeric caps are tunable, not load-bearing (the plan moves them to env in
 * P5); they exist here so a single edit retunes both sides at once. */

/** How the anonymous user's material reached us. `sample` is the no-material
 *  demo fallback (existing behaviour); the other three are the real sources. */
export type OnboardingSourceKind = 'upload' | 'link' | 'notes' | 'sample';

/** A small, client-extracted text slice + a best-effort title. The heavy source
 *  (PDF bytes) never travels with this — it stays in IndexedDB until auth. */
export type CappedCorpus = {
  /** capped, boundary-trimmed text (may be '' when nothing is extractable) */
  text: string;
  /** PDF metadata title if present, else a cleaned-up filename */
  title: string;
  /** length of the raw extracted text before capping (for a truncation note) */
  rawChars: number;
  /** true when the raw text exceeded the cap and was trimmed */
  truncated: boolean;
};

/** Max characters of corpus fed to the preview model (~10k ≈ a few pages). */
export const PREVIEW_CORPUS_CHARS = 10_000;

/** Below this much usable text the preview isn't worth running — caller falls
 *  back to the sample/demo path (e.g. a scanned PDF with no text layer). */
export const MIN_CORPUS_CHARS = 200;

/** Hard cap on pasted notes before the client truncates (defends the request). */
export const NOTES_MAX_CHARS = 50_000;

/** Largest upload the client will accept before rejecting it outright (P5). The
 *  preview only ever reads a capped text slice, so a huge file buys nothing — and
 *  the raw bytes sit in IndexedDB until auth, so we keep them bounded too. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/** Human label for the cap, used in the reject message. */
export const MAX_UPLOAD_LABEL = '25 MB';

/** True when a picked file is too large for the anonymous preview to accept. */
export function uploadTooLarge(size: number): boolean {
  return Number.isFinite(size) && size > MAX_UPLOAD_BYTES;
}

/** Pages of a PDF's text layer the preview reads (first N — the rest is a
 *  post-auth, full-import concern). */
export const PREVIEW_PDF_MAX_PAGES = 5;

/**
 * Truncate `text` to at most `max` characters, preferring the last sentence or
 * line boundary in the final stretch so the slice never ends mid-word. Falls
 * back to a word boundary, then a hard cut. Also normalises CRLF and collapses
 * trailing whitespace so both sides hash/compare the same string.
 */
export function capAtBoundary(text: string, max: number): string {
  const clean = (text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  if (clean.length <= max) return clean;

  const slice = clean.slice(0, max);
  // Don't trim back more than ~30% chasing a boundary, or a wall-of-text page
  // with no punctuation would collapse to almost nothing.
  const floor = Math.floor(max * 0.7);
  const sentenceEnds = [
    slice.lastIndexOf('. '),
    slice.lastIndexOf('.\n'),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? '),
    slice.lastIndexOf('\n'),
  ].filter((i) => i >= floor);

  if (sentenceEnds.length) {
    return slice.slice(0, Math.max(...sentenceEnds) + 1).trim();
  }
  const space = slice.lastIndexOf(' ');
  return (space > floor ? slice.slice(0, space) : slice).trim();
}
