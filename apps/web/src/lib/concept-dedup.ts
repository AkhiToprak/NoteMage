/**
 * Weakness Training Phase 4.1b — tier-2 embedding dedup + per-user backfill.
 * See plans/weakness-training-phase4.md §11.2–§11.4, §11.7.
 *
 * Tier-1 (exact slug / Jaccard) lives in `concept-dedup-match.ts` and runs
 * synchronously, for free, inside `persistSlotConcepts()` (`concept-write.ts`
 * — not touched here). This module owns the async, flag-gated embedding path:
 * `runConceptDedup` (one freshly-created concept) and `runConceptDedupBackfill`
 * (a bounded per-user sweep over embedding-less rows), both wired into
 * `background-job-runner.ts` under `concept.dedup` / `concept.dedup.backfill`.
 *
 * Never throws out of either job entry point — a bad embedding call or a
 * malformed row must never fail the worker loop or retry-storm; every
 * failure is caught, logged, and the job completes as a no-op.
 */

import { db } from '@/lib/db';
import { getGeminiClient } from '@/lib/gemini';
import { costForCall } from '@/lib/path-generator-cost';
import { enqueueJob } from '@/lib/background-jobs';
import { weaknessConceptDedupEnabled } from '@/lib/feature-flags';

// ─── Tunables ───────────────────────────────────────────────────────────

/** Cosine similarity floor for an auto-applied tier-2 merge — deliberately
 *  above the typical 0.85–0.90 dedup range (plan §11.4: "false-merge worse
 *  than missed merge"). */
export const COSINE_MATCH_THRESHOLD = 0.92;

/** Candidates scoring in [SUGGEST_THRESHOLD, COSINE_MATCH_THRESHOLD) are
 *  logged as a suggestion only — no auto-merge, no UI in v1 (plan §11.4). */
export const COSINE_SUGGEST_THRESHOLD = 0.8;

/** Candidate pool cap for one dedup check (plan §11.3 "≤500 cap"). */
const CANDIDATE_POOL_LIMIT = 500;

/** Per-run cap for the backfill sweep (plan §11.7 "capped 500/run"). */
const BACKFILL_RUN_CAP = 500;

const EMBEDDING_MODEL = process.env.CONCEPT_EMBEDDING_MODEL?.trim() || 'text-embedding-004';
const EMBEDDING_OUTPUT_DIMENSIONALITY = 256;
const EMBEDDING_INPUT_MAX_CHARS = 200;

/** Inputs per batched embedContent call in the backfill sweep (M2b). One
 *  round trip embeds up to this many concept strings; kept well under the
 *  BACKFILL_RUN_CAP so a 500-row sweep is ≤5 calls instead of 500. */
const EMBEDDING_CHUNK_SIZE = 100;

// ─── Cosine similarity ──────────────────────────────────────────────────

/**
 * Cosine similarity between two equal-length embedding vectors. Returns 0
 * when either vector has zero magnitude (nothing to compare — never a
 * spurious match) or the vectors differ in length (defensive — should never
 * happen since both sides use the same model/dimensionality).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── Embedding call ─────────────────────────────────────────────────────

function buildEmbeddingInput(label: string, description: string | null): string {
  const text = `${label}. ${description ?? ''}`;
  return text.slice(0, EMBEDDING_INPUT_MAX_CHARS);
}

/**
 * Embed one concept's label+description via Gemini `text-embedding-004`
 * (overridable via `CONCEPT_EMBEDDING_MODEL`), requesting 256 dimensions
 * (plan §11.3). Logs tokens/estimated cost per call, mirroring the
 * `[weakness-session] cost` structured line in `weakness-session-generator.ts`
 * so a Coolify log query can filter on `[concept-dedup] cost` directly.
 *
 * Token count isn't reported by the embedContent Developer API (only the
 * Enterprise Agent Platform surfaces `statistics.tokenCount`), so cost is
 * estimated from input character count via the same `chars/4` approximation
 * used elsewhere in the codebase (`path-generator-gemini.ts`).
 *
 * Throws on failure — callers decide whether that's fatal to the whole job
 * (it isn't; every call site wraps this in try/catch).
 */
export async function getConceptEmbedding(
  label: string,
  description: string | null
): Promise<number[]> {
  const input = buildEmbeddingInput(label, description);
  const client = getGeminiClient();

  const response = await client.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: [input],
    config: { outputDimensionality: EMBEDDING_OUTPUT_DIMENSIONALITY },
  });

  const values = response.embeddings?.[0]?.values;
  if (!values || values.length === 0) {
    throw new Error('embedContent returned no embedding values');
  }

  const estimatedTokens = Math.ceil(input.length / 4);
  const estUsd = costForCall(EMBEDDING_MODEL, { inputTokens: estimatedTokens, outputTokens: 0 });

  console.info('[concept-dedup] cost', {
    model: EMBEDDING_MODEL,
    inputChars: input.length,
    estimatedTokens,
    estUsd: Number(estUsd.toFixed(6)),
  });

  return values;
}

/**
 * Batched sibling to {@link getConceptEmbedding} (M2b): embed N concept
 * strings in ONE `embedContent` round trip instead of N calls. The installed
 * `@google/genai` (v2.3.0) accepts an array `contents` (`EmbedContentParameters.contents:
 * ContentListUnion` = `… | PartUnion[]`) and returns `embeddings[]` "in the
 * same order as provided" — so response index i aligns with `inputs[i]`.
 *
 * Asserts the returned count matches the input count and every row has values;
 * a mismatch or an empty row throws (the caller — the backfill sweep — wraps
 * this so a bad chunk is logged and skipped, never a half-aligned write-back).
 * Emits ONE per-chunk cost line (summed input chars), replacing the former
 * per-row logs. Throws on failure — callers decide fatality.
 */
export async function getConceptEmbeddings(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const clamped = inputs.map((s) => s.slice(0, EMBEDDING_INPUT_MAX_CHARS));
  const client = getGeminiClient();

  const response = await client.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: clamped,
    config: { outputDimensionality: EMBEDDING_OUTPUT_DIMENSIONALITY },
  });

  const embeddings = response.embeddings ?? [];
  if (embeddings.length !== clamped.length) {
    throw new Error(
      `embedContent returned ${embeddings.length} embeddings for ${clamped.length} inputs (index misalignment)`,
    );
  }

  const out: number[][] = [];
  for (let i = 0; i < embeddings.length; i++) {
    const values = embeddings[i]?.values;
    if (!values || values.length === 0) {
      throw new Error(`embedContent returned no values for input index ${i}`);
    }
    out.push(values);
  }

  const inputChars = clamped.reduce((sum, s) => sum + s.length, 0);
  const estimatedTokens = Math.ceil(inputChars / 4);
  const estUsd = costForCall(EMBEDDING_MODEL, { inputTokens: estimatedTokens, outputTokens: 0 });
  console.info('[concept-dedup] cost', {
    model: EMBEDDING_MODEL,
    rows: clamped.length,
    inputChars,
    estimatedTokens,
    estUsd: Number(estUsd.toFixed(6)),
  });

  return out;
}

// ─── Candidate pool ─────────────────────────────────────────────────────

interface CandidateConcept {
  id: string;
  canonicalId: string | null;
  label: string;
  embedding: number[];
}

/**
 * The same user's OTHER canonical concepts (`canonicalId: null`, excluding
 * `excludeConceptId`), scoped via `plan: { userId }`, most-recently-created
 * first, capped at {@link CANDIDATE_POOL_LIMIT}, restricted to rows that
 * already have an embedding (plan §11.4 tier2Match "candidatePool").
 */
async function loadCandidatePool(
  userId: string,
  excludeConceptId: string
): Promise<CandidateConcept[]> {
  const rows = await db.concept.findMany({
    where: {
      canonicalId: null,
      id: { not: excludeConceptId },
      plan: { userId },
      NOT: { embeddedAt: null },
    },
    select: { id: true, canonicalId: true, label: true, embedding: true },
    orderBy: { createdAt: 'desc' },
    take: CANDIDATE_POOL_LIMIT,
  });

  return rows
    .filter((row) => row.embedding.length > 0)
    .map((row) => ({
      id: row.id,
      canonicalId: row.canonicalId,
      label: row.label,
      embedding: row.embedding,
    }));
}

interface BestMatch {
  candidate: CandidateConcept;
  similarity: number;
}

/** Argmax cosine similarity over the candidate pool (plan §11.4 tier2Match). */
function findBestMatch(embedding: number[], pool: CandidateConcept[]): BestMatch | null {
  let best: BestMatch | null = null;
  for (const candidate of pool) {
    const similarity = cosineSimilarity(embedding, candidate.embedding);
    if (!best || similarity > best.similarity) {
      best = { candidate, similarity };
    }
  }
  return best;
}

// ─── Core: embed one row, ensure it has an embedding ───────────────────

interface ConceptRow {
  id: string;
  planId: string;
  label: string;
  description: string | null;
  canonicalId: string | null;
  embedding: number[];
  embeddedAt: Date | null;
}

/**
 * Ensure `concept.embedding` is populated, persisting it if it had to be
 * computed. Returns the embedding vector to use for comparison (either the
 * already-stored one or the freshly computed one). Returns `null` if the
 * embedding call itself fails (caller treats this concept as un-dedupable
 * this run — never throws upward).
 */
async function ensureEmbedding(concept: ConceptRow): Promise<number[] | null> {
  if (concept.embedding.length > 0) return concept.embedding;

  try {
    const embedding = await getConceptEmbedding(concept.label, concept.description);
    await db.concept.update({
      where: { id: concept.id },
      data: { embedding, embeddedAt: new Date() },
    });
    return embedding;
  } catch (error) {
    console.error('[concept-dedup] embedding call failed (non-fatal)', {
      conceptId: concept.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Compare one concept (with its embedding) against the user's other
 * canonical concepts and, on a strong match, merge it (set `canonicalId`).
 * On a weak-but-notable match, logs a "suggested, not applied" line. Never
 * throws.
 *
 * The write is a conditional `updateMany({ where: { id, canonicalId: null },
 * ... })` (not `update`) so a killed-and-replayed job never double-merges or
 * clobbers a merge that already landed from a concurrent run.
 */
async function compareAndMaybeMerge(concept: ConceptRow, embedding: number[]): Promise<void> {
  const userId = await resolveConceptUserId(concept.planId);
  if (!userId) return;

  const pool = await loadCandidatePool(userId, concept.id);
  const best = findBestMatch(embedding, pool);
  if (!best) return;

  if (best.similarity >= COSINE_MATCH_THRESHOLD) {
    const canonicalId = best.candidate.canonicalId ?? best.candidate.id;
    const result = await db.concept.updateMany({
      where: { id: concept.id, canonicalId: null },
      data: {
        canonicalId,
        mergedAt: new Date(),
        mergedLabelSnapshot: best.candidate.label,
      },
    });
    if (result.count > 0) {
      console.info('[concept-dedup] merged', {
        conceptId: concept.id,
        canonicalId,
        similarity: Number(best.similarity.toFixed(4)),
      });
    }
    return;
  }

  if (best.similarity >= COSINE_SUGGEST_THRESHOLD) {
    console.info('[concept-dedup] suggested, not applied', {
      conceptId: concept.id,
      candidateConceptId: best.candidate.id,
      similarity: Number(best.similarity.toFixed(4)),
    });
  }
}

async function resolveConceptUserId(planId: string): Promise<string | null> {
  const plan = await db.studyPlan.findUnique({ where: { id: planId }, select: { userId: true } });
  return plan?.userId ?? null;
}

// ─── Job entry points ───────────────────────────────────────────────────

/**
 * Tier-2 dedup for one freshly-created canonical concept (plan §11.2 tier 2,
 * §11.4). Flag-gated on {@link weaknessConceptDedupEnabled}. Skips rows that
 * already have a `canonicalId` (already merged — nothing to do) or that
 * already carry an embedding AND have been compared (embeddedAt set with a
 * canonicalId decision already made is covered by the canonicalId check
 * above; a row with an embedding but no merge decision yet still runs the
 * comparison so a replay after a killed run finishes the job).
 *
 * Idempotent: the merge write is a conditional `updateMany` keyed on
 * `canonicalId: null`, so replaying this job on an already-merged concept is
 * a safe no-op. Never throws.
 */
export async function runConceptDedup(conceptId: string): Promise<void> {
  if (!weaknessConceptDedupEnabled()) return;

  try {
    const concept = await db.concept.findUnique({
      where: { id: conceptId },
      select: {
        id: true,
        planId: true,
        label: true,
        description: true,
        canonicalId: true,
        embedding: true,
        embeddedAt: true,
      },
    });
    if (!concept) return;
    if (concept.canonicalId) return; // already merged — nothing to do

    const embedding = await ensureEmbedding(concept);
    if (!embedding) return; // embedding call failed; leave as resume point

    await compareAndMaybeMerge(concept, embedding);
  } catch (error) {
    console.error('[concept-dedup] runConceptDedup failed (non-fatal)', {
      conceptId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Lazy per-user dedup backfill (plan §11.7). Loads the user's canonical
 * concepts with no embedding (cap {@link BACKFILL_RUN_CAP}), embeds them in
 * batched chunks of {@link EMBEDDING_CHUNK_SIZE} (M2b — one round trip per
 * chunk instead of one per row), writes each embedding + `embeddedAt` back,
 * THEN runs the existing per-row cosine/merge pass unchanged.
 *
 * `embeddedAt: null` rows are the resume checkpoint — a killed-and-replayed
 * run picks up exactly where it left off. A row already carrying an embedding
 * (from a prior partial run) is fed straight to the compare pass without
 * re-embedding, so the batched write-back is itself resume-safe. A failed
 * chunk is logged and skipped (its rows stay `embeddedAt: null` → retried next
 * run), never a half-aligned write. Never throws.
 */
export async function runConceptDedupBackfill(userId: string): Promise<void> {
  if (!weaknessConceptDedupEnabled()) return;

  try {
    const rows = await db.concept.findMany({
      where: {
        canonicalId: null,
        embeddedAt: null,
        plan: { userId },
      },
      select: {
        id: true,
        planId: true,
        label: true,
        description: true,
        canonicalId: true,
        embedding: true,
        embeddedAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: BACKFILL_RUN_CAP,
    });

    // Phase 1 — batched embed + write-back, chunk by chunk. `embeddingByRowId`
    // carries the freshly-computed vectors into phase 2's compare pass so a
    // successful chunk needs no re-read.
    const embeddingByRowId = new Map<string, number[]>();
    for (let i = 0; i < rows.length; i += EMBEDDING_CHUNK_SIZE) {
      const chunk = rows.slice(i, i + EMBEDDING_CHUNK_SIZE);
      try {
        const embeddings = await getConceptEmbeddings(
          chunk.map((row) => buildEmbeddingInput(row.label, row.description)),
        );
        const now = new Date();
        for (let j = 0; j < chunk.length; j++) {
          const row = chunk[j];
          const embedding = embeddings[j];
          await db.concept.update({
            where: { id: row.id },
            data: { embedding, embeddedAt: now },
          });
          embeddingByRowId.set(row.id, embedding);
        }
      } catch (error) {
        // Whole chunk failed (embed call error, or index-misalignment throw) —
        // leave every row's `embeddedAt: null` so the next run retries it.
        console.error('[concept-dedup] backfill chunk embed failed (non-fatal)', {
          userId,
          chunkStart: i,
          chunkSize: chunk.length,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Phase 2 — per-row cosine/merge pass (unchanged). A row whose chunk failed
    // has no embedding this run and is skipped; a row that arrived already
    // embedded (partial prior run) falls back to its stored vector.
    for (const row of rows) {
      const embedding = embeddingByRowId.get(row.id) ?? (row.embedding.length > 0 ? row.embedding : null);
      if (!embedding) continue; // chunk failed this run — stays the resume point

      await compareAndMaybeMerge(row, embedding);
    }
  } catch (error) {
    console.error('[concept-dedup] runConceptDedupBackfill failed (non-fatal)', {
      userId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

// ─── Enqueue helpers ─────────────────────────────────────────────────────

/**
 * Best-effort post-commit enqueue of `concept.dedup` for every concept on
 * `planId` that is still an unmatched canonical row with no embedding yet
 * (`canonicalId: null`, `embeddedAt: null`) — i.e. tier-1 (synchronous, in
 * `persistSlotConcepts()`) found no lexical match at creation time. Flag-
 * gated; never throws. Callers invoke this right alongside
 * `enqueueStructuralEdgeDerivation` (`concept-edges.ts`) after their plan
 * persistence transaction has committed.
 */
export async function enqueueConceptDedupForPlan(planId: string): Promise<void> {
  if (!weaknessConceptDedupEnabled()) return;

  try {
    const concepts = await db.concept.findMany({
      where: { planId, canonicalId: null, embeddedAt: null },
      select: { id: true },
    });

    for (const concept of concepts) {
      await enqueueJob(
        'concept.dedup',
        { conceptId: concept.id },
        { dedupeKey: `concept.dedup:${concept.id}` }
      );
    }
  } catch (error) {
    console.error('[concept-dedup] enqueueConceptDedupForPlan failed (non-fatal)', {
      planId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Lazy backfill trigger (plan §11.7): if `userId` has ≥2 canonical concepts
 * with no embedding, enqueue `concept.dedup.backfill` with a 24h bucketed
 * dedupeKey (`concept.dedup.backfill:<userId>:<isoDate>`, mirroring the
 * `exam-reminders.ts` date-suffix idiom) so at most one backfill run fires
 * per user per day regardless of how many times a weakness surface loads.
 * `runAt` is now; `maxAttempts` 1 (a failed backfill attempt isn't retried —
 * the next day's page load re-triggers it naturally). Flag-gated; never
 * throws — callers treat this as fire-and-forget.
 */
export async function maybeEnqueueDedupBackfill(userId: string): Promise<void> {
  if (!weaknessConceptDedupEnabled()) return;

  try {
    const unembeddedCount = await db.concept.count({
      where: { canonicalId: null, embeddedAt: null, plan: { userId } },
    });
    if (unembeddedCount < 2) return;

    const datePart = new Date().toISOString().slice(0, 10);
    await enqueueJob(
      'concept.dedup.backfill',
      { userId },
      { dedupeKey: `concept.dedup.backfill:${userId}:${datePart}`, runAt: new Date(), maxAttempts: 1 }
    );
  } catch (error) {
    console.error('[concept-dedup] maybeEnqueueDedupBackfill failed (non-fatal)', {
      userId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
