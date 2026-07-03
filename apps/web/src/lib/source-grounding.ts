import { SourceAnchorSchema, type SourceAnchor } from '@notemage/shared';

/** Normalize only formatting differences; never paraphrase or stem citations. */
export function normalizeGroundingText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

/**
 * Deterministic first-line grounding check. A displayed quote is accepted only
 * when its normalized text occurs in the exact corpus sent to the generator.
 */
export function sourceQuoteExists(corpus: string | null | undefined, quote: string): boolean {
  if (!corpus || !quote.trim()) return false;
  const normalizedQuote = normalizeGroundingText(quote);
  if (!normalizedQuote) return false;
  return normalizeGroundingText(corpus).includes(normalizedQuote);
}

/** Parse a source anchor and reject fabricated/non-verbatim quotes. */
export function verifiedSourceAnchor(
  raw: unknown,
  corpus: string | null | undefined,
): SourceAnchor | null {
  const parsed = SourceAnchorSchema.safeParse(raw);
  if (!parsed.success) return null;
  return sourceQuoteExists(corpus, parsed.data.quote) ? parsed.data : null;
}
