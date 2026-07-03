const STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'and',
  'are',
  'can',
  'could',
  'does',
  'explain',
  'for',
  'from',
  'have',
  'how',
  'into',
  'please',
  'that',
  'the',
  'this',
  'what',
  'when',
  'where',
  'which',
  'with',
  'would',
]);

const CHUNK_CHARS = 3_200;
const CHUNK_OVERLAP = 240;
const SEPARATOR = '\n\n---\n\n';

function termsFor(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLocaleLowerCase()
        .match(/[\p{L}\p{N}]{3,}/gu)
        ?.filter((term) => !STOP_WORDS.has(term)) ?? [],
    ),
  ).slice(0, 16);
}

function headerAndBody(part: string): { header: string; body: string } {
  const newline = part.indexOf('\n');
  if (newline <= 0) return { header: '', body: part };
  const first = part.slice(0, newline).trim();
  return first.startsWith('[')
    ? { header: first, body: part.slice(newline + 1) }
    : { header: '', body: part };
}

/**
 * Query-aware character-budget selection used only when chat context would be
 * truncated. It is deterministic and local: no embedding/model call, and the
 * source header is repeated on every selected chunk so citation markers remain
 * meaningful.
 */
export function selectRelevantContext(
  parts: string[],
  query: string,
  maxChars: number,
): { text: string; originalChars: number; keptChars: number; truncated: boolean } {
  const joined = parts.join(SEPARATOR);
  if (joined.length <= maxChars) {
    return { text: joined, originalChars: joined.length, keptChars: joined.length, truncated: false };
  }

  const terms = termsFor(query);
  const chunks: Array<{
    partIndex: number;
    chunkIndex: number;
    text: string;
    score: number;
  }> = [];
  parts.forEach((part, partIndex) => {
    const { header, body } = headerAndBody(part);
    const headerLower = header.toLocaleLowerCase();
    let chunkIndex = 0;
    for (let start = 0; start < body.length; start += CHUNK_CHARS - CHUNK_OVERLAP) {
      const bodyChunk = body.slice(start, start + CHUNK_CHARS).trim();
      if (!bodyChunk) continue;
      const lower = bodyChunk.toLocaleLowerCase();
      const score = terms.reduce((sum, term) => {
        const headerHit = headerLower.includes(term) ? 4 : 0;
        const bodyHits = lower.split(term).length - 1;
        return sum + headerHit + Math.min(bodyHits, 6);
      }, 0);
      chunks.push({
        partIndex,
        chunkIndex,
        text: header ? `${header}\n${bodyChunk}` : bodyChunk,
        score,
      });
      chunkIndex++;
    }
  });

  const ranked = [...chunks].sort((a, b) => {
    if (terms.length > 0 && b.score !== a.score) return b.score - a.score;
    if (a.chunkIndex !== b.chunkIndex) return a.chunkIndex - b.chunkIndex;
    return a.partIndex - b.partIndex;
  });
  const selected: typeof chunks = [];
  let used = 0;
  for (const chunk of ranked) {
    const addition = chunk.text.length + (selected.length > 0 ? SEPARATOR.length : 0);
    if (used + addition > maxChars) continue;
    selected.push(chunk);
    used += addition;
  }
  if (selected.length === 0 && ranked[0]) {
    selected.push({ ...ranked[0], text: ranked[0].text.slice(0, maxChars) });
  }
  selected.sort((a, b) => a.partIndex - b.partIndex || a.chunkIndex - b.chunkIndex);
  const text = selected.map((chunk) => chunk.text).join(SEPARATOR);
  return { text, originalChars: joined.length, keptChars: text.length, truncated: true };
}
