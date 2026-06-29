// Source-highlighting feature — locate a model-emitted `quote` inside a longer
// source text so the viewer can wrap it in <mark> and scroll to it. The quote is
// stored verbatim, but whitespace, line wrapping, and case routinely drift
// between the corpus the model read and the rendered text — so match is
// case-insensitive + whitespace-collapsed, with progressively shorter prefixes
// as a fallback. Pure + client-safe (no DOM, no server imports).

export interface QuoteRange {
  /** Inclusive start index into the ORIGINAL text. */
  start: number;
  /** Exclusive end index into the ORIGINAL text. */
  end: number;
}

const WS = /\s/;

/**
 * Find `quote` inside `text`, tolerating whitespace/case drift. Returns a range
 * into the ORIGINAL string (so the caller can slice for rendering), or null when
 * no confident match exists — the caller then shows the quote on its own.
 */
export function locateQuote(text: string, quote: string): QuoteRange | null {
  if (!text || !quote) return null;

  // Normalized haystack + a map from each normalized char back to its origin index.
  const normChars: string[] = [];
  const map: number[] = [];
  let prevSpace = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (WS.test(c)) {
      if (prevSpace) continue;
      normChars.push(' ');
      map.push(i);
      prevSpace = true;
    } else {
      normChars.push(c.toLowerCase());
      map.push(i);
      prevSpace = false;
    }
  }
  const haystack = normChars.join('');

  const normQuote = quote.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normQuote) return null;

  // Full quote first; then a 40- and 24-char prefix so a quote whose tail was
  // lightly paraphrased / truncated still anchors on its opening words.
  const candidates = [normQuote];
  if (normQuote.length > 40) candidates.push(normQuote.slice(0, 40).trim());
  if (normQuote.length > 24) candidates.push(normQuote.slice(0, 24).trim());

  for (const cand of candidates) {
    const idx = haystack.indexOf(cand);
    if (idx >= 0) {
      const start = map[idx];
      const lastNorm = Math.min(idx + cand.length - 1, map.length - 1);
      const end = map[lastNorm] + 1;
      return { start, end };
    }
  }
  return null;
}
