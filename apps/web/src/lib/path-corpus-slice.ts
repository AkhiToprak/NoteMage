// Phase 4 cost pass (flag-gated PATH_CORPUS_SLICE, default OFF) — per-slot
// corpus slicing. Stage B sends the FULL rendered corpus (up to ~600k chars) as
// the cached prefix on every theory/flashcards/quiz call, but any one slot only
// concerns a handful of source sections. When enabled, this narrows a slot's
// call to the sections that lexically overlap its title + topicHint, cutting the
// per-call input tokens on large-corpus paths.
//
// Deterministic + local: keyword overlap only, NO embeddings, NO LLM — the same
// scoring shape `selectRelevantContext` (context-retrieval.ts) uses for
// chat-context budgeting, mirrored here (that scorer is not exported and slices
// pre-chunked chat parts, not `### `-headed corpus sections). Returning `null`
// tells the caller to fall back to the full corpus, so a weak/ambiguous match
// never silently starves a slot of grounding material.

/** Below this the full corpus is cheap enough that slicing isn't worth the risk
 *  of dropping a relevant section (a slice only pays off on the big paths). */
const MIN_CORPUS_CHARS = 150_000;

/** Char budget for the kept sections. Env-overridable; sections are added
 *  whole (in original order) until the next one would exceed this. */
const SLICE_BUDGET_CHARS = Math.max(
  1,
  Number(process.env.PATH_SLICE_BUDGET_CHARS ?? '120000') || 120_000,
);

/** Reused verbatim from context-retrieval.ts's `STOP_WORDS`. */
const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'and', 'are', 'can', 'could', 'does',
  'explain', 'for', 'from', 'have', 'how', 'into', 'please', 'that', 'this',
  'the', 'when', 'where', 'which', 'with', 'would', 'what',
]);

/** Mirrors context-retrieval.ts's `termsFor`: 3+ char alnum tokens, stopwords
 *  dropped, deduped, capped at 16. */
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

/**
 * Score one corpus section the way `selectRelevantContext` scores a chunk: each
 * query term contributes +4 if it appears in the header line and up to +6 for
 * body occurrences (capped so one term-spamming section can't dominate).
 */
function scoreSection(terms: string[], header: string, body: string): number {
  const headerLower = header.toLocaleLowerCase();
  const bodyLower = body.toLocaleLowerCase();
  return terms.reduce((sum, term) => {
    const headerHit = headerLower.includes(term) ? 4 : 0;
    const bodyHits = bodyLower.split(term).length - 1;
    return sum + headerHit + Math.min(bodyHits, 6);
  }, 0);
}

interface Section {
  /** Full `### <kind>: "<title>"…\n<body>` block, ready to re-emit verbatim. */
  text: string;
  header: string;
  body: string;
  order: number;
  score: number;
}

/** Split on the `### ` header line `renderMaterialCorpus` emits per material
 *  (path-corpus.ts). Anything before the first header (there normally is
 *  nothing) is discarded — sections are the unit we score + keep. */
function splitSections(corpus: string): Section[] {
  const sections: Section[] = [];
  const re = /^### .*$/gm;
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(corpus)) !== null) starts.push(m.index);
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1] : corpus.length;
    const text = corpus.slice(start, end).replace(/\s+$/, '');
    const nl = text.indexOf('\n');
    const header = nl >= 0 ? text.slice(0, nl) : text;
    const body = nl >= 0 ? text.slice(nl + 1) : '';
    sections.push({ text, header, body, order: i, score: 0 });
  }
  return sections;
}

/**
 * Pick the sections of `corpus` most relevant to `slot`, or `null` to signal
 * "use the full corpus". Kept sections retain their original relative order (we
 * never reorder the learner's material). Returns `null` when:
 *  - the corpus is small enough that slicing isn't worth it (< MIN_CORPUS_CHARS),
 *  - fewer than 2 sections parse (nothing to choose between), or
 *  - the best section scores 0 — no query term hit any section, so a slice would
 *    be an arbitrary prefix; the full corpus is the honest fallback.
 */
export function sliceCorpusForSlot(
  corpus: string,
  slot: { title: string; topicHint?: string | null },
): string | null {
  if (corpus.length <= MIN_CORPUS_CHARS) return null;

  const sections = splitSections(corpus);
  if (sections.length < 2) return null;

  const terms = termsFor(`${slot.title} ${slot.topicHint ?? ''}`);
  if (terms.length === 0) return null;
  for (const s of sections) s.score = scoreSection(terms, s.header, s.body);

  const best = Math.max(...sections.map((s) => s.score));
  // Minimal-confidence floor: 0 means not one query term appears in any section
  // header or body, so ranking is meaningless — bail to the full corpus.
  if (best <= 0) return null;

  // Take highest-scoring sections up to the budget, then restore original order.
  const kept: Section[] = [];
  let used = 0;
  for (const s of [...sections].sort((a, b) => b.score - a.score || a.order - b.order)) {
    if (s.score <= 0) continue;
    const addition = s.text.length + (kept.length > 0 ? 2 : 0); // 2 = the "\n\n" join
    if (used + addition > SLICE_BUDGET_CHARS) continue;
    kept.push(s);
    used += addition;
  }
  if (kept.length === 0) return null;
  kept.sort((a, b) => a.order - b.order);
  return kept.map((s) => s.text).join('\n\n');
}
