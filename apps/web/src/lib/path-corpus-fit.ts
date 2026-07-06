// Pure, DB-free corpus budgeting for path generation.
//
// Split out from path-corpus.ts so both the server renderer and the client
// (the path-setup modal, via the estimate route) can share the SAME water-fill
// math and cap constants without the client bundling Prisma. This file must
// stay free of `db` / server-only imports — it is a type- and pure-function
// module imported across the server/client boundary.

export type MaterialKind = 'page' | 'document' | 'flashcard_set' | 'quiz_set';

export interface MaterialCorpusEntry {
  id: string;
  kind: MaterialKind;
  title: string;
  /**
   * The material's text — page/document body, or rendered Q&A for sets.
   * Null when a page or document has no extracted text yet.
   */
  content: string | null;
  /** Section title, for a page's header line. */
  sectionTitle?: string;
  /**
   * 1-based source page where this material's content begins (Phase D). Only
   * set for PDF-imported pages (`Page.sourceDocPage`); null for everything else.
   * Surfaced in the corpus header as a "[page N]" marker so the quiz model can
   * cite it as a question's `source.page`. The water-fill math ignores it.
   */
  pageNumber?: number | null;
  /** The notebook this material belongs to, if any. */
  notebookId: string | null;
}

// ── Per-path content caps ────────────────────────────────────────────────
//
// Differentiated by path type. Deliberately decoupled from chat's
// MAX_CONTEXT_CHARS (chat-stream.ts) — changing those caps must NOT touch chat.
//
// The corpus is embedded in EVERY generation stage, and the quiz stage runs on
// the GLM quiz slot (203k-token window) for both basic AND ultra. So the cap is
// bounded by that window minus output + scaffolding, not by the larger structure
// model. Basic 400k chars ≈ 100k tokens (~half the window). Ultra 600k chars ≈
// 150k tokens is the aggressive max within the current model lineup; going higher
// would need an ultra quiz-model upgrade (separate change).
export const BASIC_PATH_CONTENT_CAP = 400_000;
export const ULTRA_PATH_CONTENT_CAP = 600_000;

/** The applicable corpus cap for a path, by type. */
export function pathContentCap(ultra: boolean): number {
  return ultra ? ULTRA_PATH_CONTENT_CAP : BASIC_PATH_CONTENT_CAP;
}

/** At/above this fraction of the cap we surface a soft "focus" nudge. */
export const NEAR_BUDGET_FRACTION = 0.8;

export const EMPTY_BODY = '(no extracted text available — only the title is known)';

/** The body text used for an entry — its content, or the empty-body sentinel. */
export function entryBody(entry: MaterialCorpusEntry): string {
  const text = entry.content?.trim();
  return text && text.length > 0 ? text : EMPTY_BODY;
}

/**
 * Water-fill `total` chars across items by ascending length: short items take
 * only what they need, leaving more for long ones; whatever remains is split
 * evenly among the longest. Returns a per-item char budget aligned with the
 * input order.
 */
export function allocateBudget(lengths: number[], total: number): number[] {
  const result = new Array<number>(lengths.length).fill(0);
  const ascending = lengths
    .map((len, i) => ({ len, i }))
    .sort((a, b) => a.len - b.len);
  let remaining = total;
  let left = ascending.length;
  for (const { len, i } of ascending) {
    const share = left > 0 ? Math.floor(remaining / left) : 0;
    const give = Math.min(len, share);
    result[i] = give;
    remaining -= give;
    left -= 1;
  }
  return result;
}

/**
 * Compute the per-entry bodies + char budgets for a corpus under `cap`.
 * The single source of truth for how the corpus is trimmed — both
 * renderMaterialCorpus (server) and computeCorpusFit (estimate) use it, so the
 * pre-generation warning predicts exactly what generation will do.
 */
export function corpusBudget(
  entries: MaterialCorpusEntry[],
  cap: number,
): { bodies: string[]; budgets: number[] } {
  const bodies = entries.map(entryBody);
  const budgets = allocateBudget(
    bodies.map((b) => b.length),
    cap,
  );
  return { bodies, budgets };
}

/** One material's contribution to the corpus and whether it gets trimmed. */
export interface CorpusFitItem {
  id: string;
  title: string;
  kind: MaterialKind;
  /** Full body length. */
  chars: number;
  /** Chars that survive the water-fill (≤ chars). */
  includedChars: number;
  /** True when includedChars < chars — content is cut. */
  truncated: boolean;
}

/** Pre-generation fit summary for a selected material set under one cap. */
export interface PathCorpusEstimate {
  /** Sum of all body lengths. */
  totalChars: number;
  /** The applied cap (basic or ultra). */
  cap: number;
  /** Whether this estimate was computed for an ultra path. */
  ultra: boolean;
  /** totalChars > cap — content WILL be trimmed. */
  overBudget: boolean;
  /** ≥ NEAR_BUDGET_FRACTION of cap but still fits — soft nudge only. */
  nearBudget: boolean;
  /** totalChars ≤ ultra cap — drives the "use Ultra to fit it all" nudge. */
  fitsUltra: boolean;
  /** Materials that get trimmed under this cap, in selection order. */
  trimmed: CorpusFitItem[];
}

/**
 * Predict how a selected material set fits under `cap`. Pure — the estimate
 * route feeds it DB-loaded entries; it mirrors renderMaterialCorpus exactly.
 */
export function computeCorpusFit(
  entries: MaterialCorpusEntry[],
  cap: number,
  ultra: boolean,
): PathCorpusEstimate {
  const { bodies, budgets } = corpusBudget(entries, cap);
  const totalChars = bodies.reduce((sum, b) => sum + b.length, 0);
  const trimmed: CorpusFitItem[] = [];
  entries.forEach((e, i) => {
    const chars = bodies[i].length;
    const includedChars = Math.min(chars, budgets[i]);
    if (includedChars < chars) {
      trimmed.push({ id: e.id, title: e.title, kind: e.kind, chars, includedChars, truncated: true });
    }
  });
  const overBudget = totalChars > cap;
  return {
    totalChars,
    cap,
    ultra,
    overBudget,
    nearBudget: !overBudget && totalChars >= cap * NEAR_BUDGET_FRACTION,
    fitsUltra: totalChars <= ULTRA_PATH_CONTENT_CAP,
    trimmed,
  };
}
