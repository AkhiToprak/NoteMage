/**
 * Explicit web-intent heuristic (Mage P4b) — pure + client-safe (no db).
 *
 * Detects whether a user message explicitly asks Mage to search the web, or
 * explicitly forbids it. NEGATION WINS: a negation anywhere in the message
 * short-circuits to 'negated' before any request phrase is considered (so
 * "search the web but don't google random blogs" ⇒ 'negated', never a grant).
 * Covers EN + DE. Returns 'none' when neither matches.
 *
 * Used by the messages route to (PRO only) flip the thread web grant immediately
 * on an explicit request, and by deriveConsentChips to suppress the web chip on a
 * negation. Web *execution* is P5 — this only sets flags/prompt.
 */

// Negations first — a negation ANYWHERE beats a request. Word-boundary-ish
// (leading \b) so "search" inside "researcher" won't trip request phrases.
const NEGATION_RES: RegExp[] = [
  /\bdo\s?n(?:'|’)?t\s+(?:search|browse|google|look\s+it\s+up)/i,
  /\bdo\s+not\s+(?:search|browse|google|look\s+it\s+up)/i,
  /\bno\s+web\b/i,
  /\bwithout\s+(?:search|browsing|googling|the\s+web|internet)/i,
  /\bnot\s+(?:on|in|from)\s+the\s+(?:web|internet)\b/i,
  /\bnot\s+(?:online|in\s+the\s+internet)\b/i,
  // German
  /\bohne\s+(?:zu\s+)?(?:googeln|suchen|internet|das\s+internet|zu\s+surfen)\b/i,
  /\bkein(?:e)?\s+internet\b/i,
  /\bnicht\s+im\s+(?:internet|netz|web)\b/i,
  /\bnicht\s+googeln\b/i,
  /\bsuch(?:e)?\s+nicht\b/i,
];

// Explicit requests to go to the web.
const REQUEST_RES: RegExp[] = [
  /\bsearch\s+(?:the\s+web|online)\b/i,
  /\bsearch\s+online\s+for\b/i,
  /\bgoogle\s+it\b/i,
  /\blook\s+it\s+up\s+online\b/i,
  /\b(?:on|from)\s+the\s+(?:web|internet)\b/i,
  /\bweb\s+search\b/i,
  // German
  /\bim\s+(?:internet|netz)\s+(?:suchen|nachschauen|nachsehen)\b/i,
  /\bgoogeln\b/i,
  /\bweb\s+durchsuchen\b/i,
  /\bim\s+internet\s+nach\b/i,
];

/** 'request' | 'negated' | 'none'. Case-insensitive; negation short-circuits. */
export function detectExplicitWebIntent(message: string): 'request' | 'negated' | 'none' {
  if (typeof message !== 'string' || message.length === 0) return 'none';
  for (const re of NEGATION_RES) if (re.test(message)) return 'negated';
  for (const re of REQUEST_RES) if (re.test(message)) return 'request';
  return 'none';
}
