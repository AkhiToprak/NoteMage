/**
 * Weakness Training Phase 1B — remediation session generator.
 *
 * Canonical source: `plans/weakness-training.md` §5.2 "Generation shape — ONE
 * call, not N lazy calls", §5.3 "Cost — measured, not asserted", §5.5
 * "Cost/abuse caps", §5.6 "No-corpus fallback", §2.3 "Misconception layer",
 * §6.4 "Training session player", §7.2 "Free vs Pro". Phase 0 findings:
 * `plans/weakness-phase0-findings.md` (teaching rows persist as ungraded
 * `QuizQuestion` rows via `payload.stepType`, never a new column/table).
 *
 * Mirrors `practice-generator.ts` end to end — same `forcedStructuredCall` +
 * `QuizSetV2Schema` validation + `buildLegacyColumns` persistence pipeline —
 * so the remediation session rides the exact same prompt-caching, retry, and
 * grading machinery a practice quiz does. The only NEW things here are:
 *   1. a 3-part-per-concept tool shape (reteach + discriminate + retest)
 *      instead of a flat question list,
 *   2. concept SELECTION off `deriveConceptWeakAreas` (Phase 1A) rather than
 *      a path/exam focus pool,
 *   3. persistence that (a) stamps ungraded teaching rows with `payload.stepType`
 *      metadata post-validation (server-side, never model-controlled — Phase 0
 *      finding B2) and (b) tags every graded re-test question with a
 *      `ConceptTag` so `trackConceptAttempts` (Phase 1A) feeds the retest's
 *      grade back into `ConceptMastery` — the loop that makes graduation
 *      (§2.4) possible.
 *
 * This module owns: concept selection, the AI call + validation, and
 * persistence. The route (`app/api/weakness/sessions/route.ts`) owns auth,
 * feature-flag/Pro gating, rate limiting, and quota reserve/refund.
 */

import type { ToolDef } from './ai-tool-types';
import { Prisma } from '@prisma/client';
import { db } from './db';
import { tiptapJsonToPlainText } from './contentConverter';
import { forcedStructuredCall, type NormalizedUsage } from './path-generator-routing';
import { quizPayloadCatalogFor } from './ai-tools';
import { normalizeQuizQuestions } from './path-generator-normalize';
import { QuizSetV2Schema, type QuestionKind } from '@notemage/shared';
import { buildLegacyColumns } from './quiz-grading';
import { logAiUsage } from './ai-usage';
import { logTelemetry } from './telemetry-server';
import { costForCall } from './path-generator-cost';
import { deriveConceptWeakAreas } from './concept-weak-areas';
import { loadConceptWeakAreaRows } from './concept-weak-areas-loader';
import { classifyBand, type MasteryBand } from './concept-mastery';
import type { TierKey } from './tiers';

// ─────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────

/** The 3 kinds a graded re-test question may use — the same server-gradable,
 *  subject-agnostic floor `practice-generator.ts` reserves for ad-hoc
 *  generation (§5.2 lists `mc|true_false|fill_blank` explicitly). */
export const RETEST_KINDS: QuestionKind[] = ['mc', 'true_false', 'fill_blank'];

/** Total corpus chars fed to one session call — scoped to just the target
 *  concepts' slots (§5.2 "keeps the cached prefix small"), so this is much
 *  tighter than a full practice-quiz corpus. */
const SESSION_CORPUS_CAP = 3_500;

/** Minimum / maximum concepts per session (task spec + §5.2 "2-3 concepts"). */
const MIN_SESSION_CONCEPTS = 1;
const MAX_SESSION_CONCEPTS = 3;

/** Reuse-before-generate window (§5.4): re-offer an existing session rather than regenerate. */
const REUSE_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Per-concept cooldown (§5.5): after training a concept, block re-targeting it in a NEW session for this long. */
const CONCEPT_COOLDOWN_MS = 2 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────
// Concept selection (§6.2 canonical ranking → session target list)
// ─────────────────────────────────────────────────────────────────────

export interface SessionConceptTarget {
  conceptId: string;
  label: string;
  description: string | null;
  slotId: string;
  planId: string;
  /** Phase 4.2c (§12.4) — set by `pickSessionConcepts` when this target was
   *  opportunistically folded in by `findWeakPrerequisite` rather than
   *  ranked in generically. Threaded through so `generateWeaknessSession`'s
   *  existing `[weakness-session] cost` log can report `includedPrerequisite`
   *  without a second log line or a route.ts change. */
  isPrerequisite?: boolean;
}

/** Top-N `ConceptEdge` rows into a target considered by {@link findWeakPrerequisite}
 *  before giving up (plan §12.4 "top-3 edges into the target by confidence"). */
const MAX_PREREQUISITE_EDGES_CHECKED = 3;

export interface WeakPrerequisite {
  conceptId: string;
  band: Exclude<MasteryBand, 'solid' | 'building' | 'strengthening'>;
}

/**
 * Find a weak/rusty/untested prerequisite of `conceptId` for `userId`, per
 * plan §12.4 "hint-plus-opportunistic-fill". Looks at the top
 * {@link MAX_PREREQUISITE_EDGES_CHECKED} `ConceptEdge` rows into the target
 * ordered by `confidence` desc, and returns the first whose `fromConcept`'s
 * RE-DECAYED band (via `classifyBand` — never `ConceptMastery.status`, per
 * §10.1/§2.1.1) is `weak`, `rusty`, or `untested` (no mastery row at all also
 * counts as `untested`). Returns `null` when no edge qualifies (all solid/
 * building, or the target has no inbound edges).
 *
 * Canonical resolution (§10.1, §12.5): both the target and every edge's
 * `fromConceptId` are resolved through `canonicalId ?? id` before use, since
 * edges are never rewritten at merge time and may reference pre-merge ids.
 * `toConceptId` matching ALSO widens to every member of the target's merge
 * group (not just its canonical id) — cheap here because the merge group is
 * already loaded to compute the target's canonical id, and it's the only way
 * a pre-merge edge (`fromConceptId -> preMergeTargetId`) stays visible after
 * its target was folded into a different canonical concept. This mirrors
 * `loadConceptWeakAreaRows`'s grouping (`concept.canonicalId ?? concept.id`)
 * but is NOT a full inverse-index lookup — a merge group is only assembled
 * for the ONE target concept passed in, not the whole graph.
 *
 * Never returns the target itself, and — via `alreadyPickedConceptIds` —
 * never a concept already selected for this session.
 */
export async function findWeakPrerequisite(
  userId: string,
  conceptId: string,
  now: Date,
  alreadyPickedConceptIds: Set<string> = new Set(),
): Promise<WeakPrerequisite | null> {
  const targetConcept = await db.concept.findUnique({
    where: { id: conceptId },
    select: { id: true, canonicalId: true },
  });
  if (!targetConcept) return null;
  const targetCanonicalId = targetConcept.canonicalId ?? targetConcept.id;

  // Merge group of the TARGET — every concept row that resolves to the same
  // canonical id, including the canonical row itself. A stored edge may still
  // point at a pre-merge sibling's id as `toConceptId` (edges are never
  // rewritten on merge, §12.5), so all member ids are searched, not just the
  // canonical one.
  const targetGroupRows = await db.concept.findMany({
    where: { OR: [{ id: targetCanonicalId }, { canonicalId: targetCanonicalId }] },
    select: { id: true },
  });
  const targetGroupIds = targetGroupRows.length > 0 ? targetGroupRows.map((r) => r.id) : [conceptId];

  const edges = await db.conceptEdge.findMany({
    where: { toConceptId: { in: targetGroupIds } },
    orderBy: { confidence: 'desc' },
    take: MAX_PREREQUISITE_EDGES_CHECKED,
    select: { fromConceptId: true },
  });
  if (edges.length === 0) return null;

  const fromIds = Array.from(new Set(edges.map((e) => e.fromConceptId)));
  const fromConceptRows = await db.concept.findMany({
    where: { id: { in: fromIds } },
    select: { id: true, canonicalId: true },
  });
  const canonicalByConceptId = new Map(
    fromConceptRows.map((r) => [r.id, r.canonicalId ?? r.id]),
  );

  // Resolve each edge's fromConceptId to its canonical id, in the original
  // confidence-desc order, deduping repeats and dropping self/already-picked.
  const candidateCanonicalIds: string[] = [];
  const seen = new Set<string>();
  for (const edge of edges) {
    const resolved = canonicalByConceptId.get(edge.fromConceptId) ?? edge.fromConceptId;
    if (resolved === targetCanonicalId) continue; // never the target itself
    if (targetGroupIds.includes(resolved)) continue; // defensive — a pre-merge sibling of the target
    if (alreadyPickedConceptIds.has(resolved)) continue;
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    candidateCanonicalIds.push(resolved);
  }
  if (candidateCanonicalIds.length === 0) return null;

  // Mastery lookup goes through the SAME loader every other weak-area read
  // uses (§10.2) so the union/decay-to-recency-anchor logic is identical —
  // `loadConceptWeakAreaRows` already groups by `canonicalId ?? id`, so
  // passing the resolved canonical ids here returns (at most) one row per
  // candidate, keyed by that canonical id.
  const masteryRows = await loadConceptWeakAreaRows(userId, { conceptIds: candidateCanonicalIds });
  const masteryByConceptId = new Map(masteryRows.map((r) => [r.conceptId, r]));

  for (const candidateId of candidateCanonicalIds) {
    const mastery = masteryByConceptId.get(candidateId);
    const band: MasteryBand = mastery ? classifyBand(mastery, now) : 'untested';
    if (band === 'weak' || band === 'rusty' || band === 'untested') {
      return { conceptId: candidateId, band };
    }
  }
  return null;
}

/**
 * Build the 1-3 concepts a remediation session should target, ranked off the
 * SAME canonical `deriveConceptWeakAreas` used by the Weak Spots page (§6.2 —
 * "single source of truth for every surface"), so a session can never target
 * a concept the diagnosis surface wouldn't also flag.
 *
 * `primaryConceptId` MUST be one of the learner's current weak/rusty areas —
 * if it isn't (e.g. it graduated between page load and the POST, or the id
 * is bogus/not-owned), this returns `[]` and the route 400s rather than
 * silently substituting a different concept the learner didn't ask to train.
 *
 * Fills up to 2 additional slots from the remaining ranked weak/rusty areas,
 * preferring the SAME `planId` as the primary (keeps the session's corpus
 * scoped to one path's slots, per §5.2), then falling back to any other
 * weak/rusty concept if the primary's path doesn't have enough on its own.
 *
 * `excludeConceptIds`, when provided, drops any ADDITIONAL-fill candidate on
 * cooldown (§5.5) before the fill slots are chosen — the primary concept is
 * NEVER filtered by this set (the route validates the primary's cooldown
 * separately and 429s rather than silently substituting a concept the
 * learner didn't ask to train).
 *
 * Phase 4.2c (§12.4): once the generic ranked fill list is assembled, checks
 * {@link findWeakPrerequisite} for the primary target. If a weak/rusty/
 * untested prerequisite exists AND there is still a free fill slot
 * (`< MAX_SESSION_CONCEPTS` concepts picked so far), the prerequisite is
 * PREFERRED over the next generic fill candidate and placed FIRST in the
 * returned delivery order (the primary target is still validated/required
 * exactly as before — this only reorders and opportunistically fills, it
 * never substitutes). Skips a prerequisite that's already on the cooldown/
 * exclusion list or already picked as generic fill. If the session is
 * already full (3 concepts from primary + generic fill alone), nothing is
 * bumped to make room.
 */
export async function pickSessionConcepts(
  userId: string,
  primaryConceptId: string,
  now: Date,
  excludeConceptIds?: Set<string>,
): Promise<SessionConceptTarget[]> {
  const concepts = await loadConceptWeakAreaRows(userId);

  const result = deriveConceptWeakAreas({ concepts, now, scope: { scope: 'all-paths' } });

  const primary = result.areas.find((a) => a.conceptId === primaryConceptId);
  if (!primary) return [];

  const rest = result.areas.filter(
    (a) => a.conceptId !== primaryConceptId && !excludeConceptIds?.has(a.conceptId),
  );
  const sameplan = rest.filter((a) => a.planId === primary.planId);
  const otherPlan = rest.filter((a) => a.planId !== primary.planId);
  // Both sub-lists are already ranked by impactPoints (deriveConceptWeakAreas'
  // own sort) — concatenating same-plan-first then other-plan preserves that
  // order within each bucket while satisfying the same-plan preference.
  const additional = [...sameplan, ...otherPlan].slice(0, MAX_SESSION_CONCEPTS - 1);

  let orderedIds = [primary.conceptId, ...additional.map((a) => a.conceptId)].slice(
    0,
    MAX_SESSION_CONCEPTS,
  );

  // Phase 4.2c (§12.4) — opportunistic prerequisite fill. Only attempted when
  // a fill slot is genuinely free (`orderedIds.length < MAX_SESSION_CONCEPTS`
  // here means the generic ranking didn't already fill the session), so
  // prepending the prerequisite and re-trimming below can never bump an
  // already-picked generic-fill concept — "session already full" is a no-op
  // by construction, not a separate branch.
  let prerequisiteConceptId: string | null = null;
  if (orderedIds.length < MAX_SESSION_CONCEPTS) {
    const alreadyPicked = new Set(orderedIds);
    if (excludeConceptIds) for (const id of excludeConceptIds) alreadyPicked.add(id);
    const prerequisite = await findWeakPrerequisite(userId, primary.conceptId, now, alreadyPicked);
    if (prerequisite) {
      // Prefer the prerequisite over the generic ranked fill list, and place
      // it FIRST in delivery order (§12.4 point 3 — the interleave re-teaches
      // the prerequisite before the primary target).
      orderedIds = [prerequisite.conceptId, ...orderedIds].slice(0, MAX_SESSION_CONCEPTS);
      prerequisiteConceptId = prerequisite.conceptId;
    }
  }

  const rows = await db.concept.findMany({
    where: { id: { in: orderedIds } },
    select: { id: true, label: true, description: true, slotId: true, planId: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));

  const targets: SessionConceptTarget[] = [];
  for (const id of orderedIds) {
    const row = byId.get(id);
    if (!row) continue; // defensive — the concept was deleted between the two reads
    targets.push({
      conceptId: row.id,
      label: row.label,
      description: row.description,
      slotId: row.slotId,
      planId: row.planId,
      isPrerequisite: row.id === prerequisiteConceptId,
    });
  }
  return targets.length >= MIN_SESSION_CONCEPTS ? targets : [];
}

// ─────────────────────────────────────────────────────────────────────
// Session persistence — reuse-before-generate (§5.4) + per-concept
// cooldown (§5.5), backed by the Phase 2 `WeaknessTrainingSession` table.
// ─────────────────────────────────────────────────────────────────────

/** Pure: flatten the conceptIds of recently-created sessions into a cooldown set. */
export function cooldownConceptSet(recentSessions: { conceptIds: string[] }[]): Set<string> {
  const s = new Set<string>();
  for (const row of recentSessions) for (const id of row.conceptIds) s.add(id);
  return s;
}

/** Concepts the user trained within CONCEPT_COOLDOWN_MS — excluded from a fresh session (§5.5). */
export async function getConceptsOnCooldown(userId: string, now: Date): Promise<Set<string>> {
  const cutoff = new Date(now.getTime() - CONCEPT_COOLDOWN_MS);
  const rows = await db.weaknessTrainingSession.findMany({
    where: { userId, createdAt: { gte: cutoff } },
    select: { conceptIds: true },
  });
  return cooldownConceptSet(rows);
}

/**
 * Reuse-before-generate (§5.4). Re-offer the most recent ready|completed session
 * (<24h) whose conceptIds INCLUDE `conceptId` and whose QuizSet still exists.
 *
 * DESIGN NOTE (documented deviation from §5.4's literal "same conceptIds set"):
 * reuse is keyed on the PRIMARY concept the learner clicked, not exact-set
 * equality. The additional fill concepts are chosen non-deterministically from
 * live rankings, so exact-set-match would almost never hit; keying on the
 * clicked concept both satisfies "re-offer instead of regenerate" for the thing
 * the learner asked to train AND is a strictly stronger anti-farming guard.
 */
export async function findReusableSessionForConcept(
  userId: string,
  conceptId: string,
  now: Date,
): Promise<{ quizSetId: string; notebookId: string } | null> {
  const cutoff = new Date(now.getTime() - REUSE_WINDOW_MS);
  const sessions = await db.weaknessTrainingSession.findMany({
    where: {
      userId,
      createdAt: { gte: cutoff },
      status: { in: ['ready', 'completed'] },
      quizSetId: { not: null },
      conceptIds: { has: conceptId },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  for (const s of sessions) {
    if (!s.quizSetId) continue;
    // The QuizSet may have been deleted since — verify it still exists + is owned.
    const qs = await db.quizSet.findFirst({
      where: { id: s.quizSetId, userId },
      select: { id: true, notebookId: true },
    });
    if (qs?.notebookId) return { quizSetId: qs.id, notebookId: qs.notebookId };
  }
  return null;
}

/** Persist a generated session (status 'ready') so reuse/cooldown/achievements can see it. */
export async function recordWeaknessSession(
  userId: string,
  opts: { conceptIds: string[]; quizSetId: string; sourcePathId: string | null },
): Promise<void> {
  await db.weaknessTrainingSession.create({
    data: {
      userId,
      conceptIds: opts.conceptIds,
      quizSetId: opts.quizSetId,
      sourcePathId: opts.sourcePathId,
      status: 'ready',
    },
  });
}

// ─────────────────────────────────────────────────────────────────────
// Tool shape (§5.2 — one forced-tool call, 3 parts per concept)
// ─────────────────────────────────────────────────────────────────────

export interface SessionConceptToolOutput {
  /** MUST be copied verbatim from one of the target concepts' ids passed in
   *  the dynamic instructions — closed enum, enforced post-hoc by dropping
   *  any entry whose conceptId isn't one of the inputs (see parseWeaknessSession). */
  conceptId: string;
  reteach: {
    explanation: string;
    workedExample: string;
    sourceAnchor?: string;
  };
  discriminate: {
    prompt: string;
    correctOption: string;
    confusedOption: string;
    explanation: string;
  };
  retest: {
    kind: 'mc' | 'true_false' | 'fill_blank';
    prompt: string;
    payload: unknown;
    correctExplanation: string;
    wrongExplanation: string;
  };
}

export interface WeaknessSessionToolInput {
  concepts: SessionConceptToolOutput[];
}

/**
 * The remediation-session tool (§5.2). Input is ONE object with a `concepts`
 * array (2-3 entries), each carrying the three-part shape (reteach,
 * discriminate, retest) that `persistWeaknessQuizSet` later fans out into
 * interleaved `QuizQuestion` rows. The retest sub-shape reuses the SAME
 * payload catalog (`quizPayloadCatalogFor`) the path/practice quiz tools use,
 * restricted to `RETEST_KINDS`, so the retest payload validates through the
 * unchanged `QuizSetV2Schema` + `buildLegacyColumns` pipeline.
 */
export const WEAKNESS_SESSION_TOOL: ToolDef = {
  name: 'create_weakness_session',
  description: [
    'Build a short remediation session for 1-3 concepts a learner is weak or rusty on.',
    'For EACH concept in the provided closed list, produce exactly one entry with `conceptId` copied VERBATIM from that concept\'s id — never invent a conceptId, never omit a concept, never add an extra one.',
    '',
    'Each entry has three parts:',
    '1. `reteach` — a re-explanation of the concept that is MEANINGFULLY DIFFERENT from how it was likely first taught (a fresh angle, analogy, or framing — not a copy of the original theory) plus a concrete `workedExample` applying it. Set `sourceAnchor` to a short verbatim quote from the source materials when one directly supports the explanation; omit it otherwise.',
    '2. `discriminate` — a contrastive forced choice between this concept\'s correct rule (`correctOption`) and a commonly-confused neighbor (`confusedOption`), with a `prompt` framing the choice and an `explanation` of why the correct option is right and the neighbor is a trap. When a known confusable neighbor is given for this concept below, base `confusedOption` on THAT real neighbor rather than inventing an unrelated one.',
    '3. `retest` — ONE graded question in the SAME v2 shape as any quiz tool: `kind` is one of `mc`, `true_false`, `fill_blank` ONLY, `prompt` is the question text, `payload` matches that kind\'s shape exactly (see below), and `correctExplanation`/`wrongExplanation` are short feedback lines.',
    '',
    'STRICT SHAPE RULES for `retest.payload` — the server rejects entries that violate these:',
    '1. `mc` `payload.options` is an ARRAY OF PLAIN STRINGS (never objects); the answer is `payload.correctIndex` (0-3).',
    '2. `true_false` `payload` is `{"correct": true|false}`.',
    '3. `fill_blank` `payload` MUST wrap answers inside `payload.blank: { acceptableAnswers: [...] }` — never at the payload root.',
    '',
    quizPayloadCatalogFor(RETEST_KINDS),
  ].join('\n'),
  input_schema: {
    type: 'object' as const,
    properties: {
      concepts: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_SESSION_CONCEPTS,
        items: {
          type: 'object',
          properties: {
            conceptId: {
              type: 'string',
              description: 'Copied verbatim from one of the provided target concept ids.',
            },
            reteach: {
              type: 'object',
              properties: {
                explanation: { type: 'string' },
                workedExample: { type: 'string' },
                sourceAnchor: { type: 'string' },
              },
              required: ['explanation', 'workedExample'],
            },
            discriminate: {
              type: 'object',
              properties: {
                prompt: { type: 'string' },
                correctOption: { type: 'string' },
                confusedOption: { type: 'string' },
                explanation: { type: 'string' },
              },
              required: ['prompt', 'correctOption', 'confusedOption', 'explanation'],
            },
            retest: {
              type: 'object',
              properties: {
                kind: { type: 'string', enum: RETEST_KINDS },
                prompt: { type: 'string' },
                payload: { type: 'object' },
                correctExplanation: { type: 'string' },
                wrongExplanation: { type: 'string' },
              },
              required: ['kind', 'prompt', 'payload', 'correctExplanation', 'wrongExplanation'],
            },
          },
          required: ['conceptId', 'reteach', 'discriminate', 'retest'],
        },
        description: 'One entry per target concept (1-3 total).',
      },
    },
    required: ['concepts'],
  },
};

// ─────────────────────────────────────────────────────────────────────
// Corpus loading (§5.2 — scoped to the targets' slots only)
// ─────────────────────────────────────────────────────────────────────

/** Join titled text sections under a total char cap, dropping empty ones.
 *  Local copy of practice-generator's private `joinCappedSections` (not
 *  exported there) — same behavior, smaller cap for this call. */
function joinCappedSections(sections: { heading?: string; text: string }[], cap: number): string {
  const parts: string[] = [];
  let used = 0;
  for (const s of sections) {
    const text = s.text.trim();
    if (!text) continue;
    const block = s.heading ? `## ${s.heading}\n${text}` : text;
    if (used + block.length > cap) {
      const remaining = cap - used;
      if (remaining > 400) parts.push(block.slice(0, remaining));
      break;
    }
    parts.push(block);
    used += block.length;
  }
  return parts.join('\n\n');
}

/**
 * Load the theory bodies for exactly the target concepts' slots, ownership-
 * scoped to `userId`, capped at {@link SESSION_CORPUS_CAP}. Returns `null`
 * when nothing resolves (deleted/revoked material, or a slot with no theory
 * activity) — the caller falls back to the §5.6 no-corpus instruction rather
 * than failing the session.
 */
async function loadTargetSlotsCorpus(userId: string, slotIds: string[]): Promise<string | null> {
  if (slotIds.length === 0) return null;
  const acts = await db.checkpointActivity.findMany({
    where: { kind: 'theory', slot: { id: { in: slotIds }, phase: { plan: { userId } } } },
    select: { title: true, theory: { select: { body: true } } },
    take: 20,
  });
  const corpus = joinCappedSections(
    acts.map((a) => ({ heading: a.title, text: a.theory ? tiptapJsonToPlainText(a.theory.body) || '' : '' })),
    SESSION_CORPUS_CAP,
  );
  return corpus.trim().length > 0 ? corpus : null;
}

// ─────────────────────────────────────────────────────────────────────
// Instructions (static block byte-stable for prompt caching)
// ─────────────────────────────────────────────────────────────────────

/** The cacheable static instruction block — role framing only; the full
 *  shape/payload rules already live in `WEAKNESS_SESSION_TOOL`'s description
 *  (which is sent every call regardless, so duplicating it in the system
 *  prompt would just burn cache-write tokens for no gain). Kept byte-stable
 *  across every session so the corpus + this prefix prompt-cache together. */
function buildSessionStaticInstructions(): string {
  return [
    'You are NoteMage, building a short remediation session for a learner who is weak or rusty on a small set of concepts from material they already studied.',
    'Ground the re-teach explanation, the worked example, and the retest question in the SOURCE MATERIALS when they are provided — never invent facts the material does not support.',
    'Keep every field concise and concrete. This is a fast, focused re-teach — not a full lesson.',
  ].join('\n');
}

/** The per-call dynamic tail — the closed list of target concepts (id/label/
 *  description) plus each one's misconception line when available (§2.3),
 *  framed as material-level confusability, never a claim about the learner. */
function buildSessionDynamicTail(opts: {
  targets: SessionConceptTarget[];
  misconceptionByConceptId: Map<string, string>;
  hasCorpus: boolean;
}): string {
  const lines: string[] = ['Target concepts (produce exactly one entry per concept, in any order):'];
  for (const t of opts.targets) {
    lines.push(`- conceptId: "${t.conceptId}"`);
    lines.push(`  label: ${t.label}`);
    if (t.description) lines.push(`  description: ${t.description}`);
    const misconception = opts.misconceptionByConceptId.get(t.conceptId);
    if (misconception) {
      lines.push(`  known confusable neighbor: learners often confuse this with — ${misconception}`);
    }
  }
  if (!opts.hasCorpus) {
    lines.push(
      '',
      'No source material excerpt is available for these concepts — write the re-teach, discriminate, and retest from the concept label/description alone. Do not fabricate a citation or sourceAnchor.',
    );
  }
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────
// Generation + validation (§5.2 call shape, §5.3 cost logging)
// ─────────────────────────────────────────────────────────────────────

export interface ParsedSessionConcept {
  conceptId: string;
  label: string;
  reteach: { explanation: string; workedExample: string; sourceAnchor?: string };
  discriminate: { prompt: string; correctOption: string; confusedOption: string; explanation: string };
  retest: {
    kind: QuestionKind;
    prompt: string;
    payload: Record<string, unknown>;
    correctExplanation: string;
    wrongExplanation: string;
  };
}

export interface ParsedSession {
  concepts: ParsedSessionConcept[];
}

/**
 * A very rough USD→CHF conversion for the structured cost log (§5.3). No
 * existing currency-conversion helper was found in the codebase (checked
 * `ai-usage.ts` / `path-generator-cost.ts` — both report USD only), so this
 * is a fixed, clearly-labeled approximation rather than a live FX call —
 * good enough for the "is this under 0.05 CHF/session" acceptance check the
 * plan calls for; NOT used for billing.
 */
const APPROX_USD_TO_CHF = 0.9;

/**
 * Assemble a remediation session in ONE forced-tool call (§5.2). Validates
 * each concept's `retest` through the same `normalizeQuizQuestions` +
 * `QuizSetV2Schema` pipeline `parsePracticeQuiz` uses, restricted to
 * {@link RETEST_KINDS}. A concept is kept only if ALL THREE parts
 * (reteach/discriminate/retest) are present and the retest validates —
 * dropping just the retest and keeping the teaching rows would produce an
 * ungradeable "session" with no denominator contribution, so the concept is
 * dropped as a whole instead (simplest coherent behavior per the task spec).
 *
 * Up to 2 attempts on empty/malformed output, mirroring
 * `assemblePracticeQuiz`. Throws if fewer than 1 concept survives — the
 * route refunds the `ai_quizzes` reservation on any throw.
 */
export async function generateWeaknessSession(opts: {
  userId: string;
  tier: TierKey;
  concepts: SessionConceptTarget[];
  misconceptionByConceptId: Map<string, string>;
}): Promise<ParsedSession> {
  const targets = opts.concepts.slice(0, MAX_SESSION_CONCEPTS);
  if (targets.length < MIN_SESSION_CONCEPTS) {
    throw new Error('generateWeaknessSession requires at least 1 target concept');
  }

  const slotIds = Array.from(new Set(targets.map((t) => t.slotId)));
  const corpus = await loadTargetSlotsCorpus(opts.userId, slotIds);

  const staticInstructions = buildSessionStaticInstructions();
  const baseTail = buildSessionDynamicTail({
    targets,
    misconceptionByConceptId: opts.misconceptionByConceptId,
    hasCorpus: corpus !== null,
  });

  const usage = {
    // Placeholder — overwritten by onUsage with the real provider (openrouter
    // for the quiz stage). Kept as a valid provider literal for typing.
    provider: 'openrouter' as NormalizedUsage['provider'],
    model: '',
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  const onUsage = (u: NormalizedUsage) => {
    usage.provider = u.provider;
    usage.model = u.model;
    usage.inputTokens += u.inputTokens;
    usage.outputTokens += u.outputTokens;
    usage.cacheReadTokens += u.cacheReadTokens;
    usage.cacheWriteTokens += u.cacheWriteTokens;
  };

  const targetIds = new Set(targets.map((t) => t.conceptId));
  const labelById = new Map(targets.map((t) => [t.conceptId, t.label]));

  let parsed: ParsedSession | null = null;
  for (let attempt = 1; attempt <= 2 && !parsed; attempt++) {
    const tail =
      attempt === 1
        ? baseTail
        : [
            baseTail,
            '',
            '--- RETRY NOTICE ---',
            'Your previous output was empty or malformed. Regenerate the entire `concepts` array — it MUST contain one valid entry per target concept, and every retest payload MUST match its kind exactly.',
          ].join('\n');
    try {
      const raw = await forcedStructuredCall<WeaknessSessionToolInput>({
        stage: 'quiz',
        corpus,
        staticInstructions,
        dynamicInstructions: tail,
        anthropicTool: WEAKNESS_SESSION_TOOL,
        anthropicTools: [WEAKNESS_SESSION_TOOL],
        userMessage: 'Generate the remediation session now. The concepts array must not be empty.',
        // Extraction-shaped forced tool — sample cold, not at the ~1.0 default.
        temperature: 0.3,
        onUsage,
      });
      parsed = parseWeaknessSession(raw, targetIds, labelById);
    } catch (err) {
      logTelemetry(opts.userId, 'weakness.session.retry', {
        attempt,
        conceptCount: targets.length,
        reason: err instanceof Error ? err.message : 'call_failed',
      });
    }
  }

  if (usage.model) {
    const estCHF = costForCall(usage.model, {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
    }) * APPROX_USD_TO_CHF;

    logAiUsage({
      userId: opts.userId,
      feature: 'weakness-session',
      tier: opts.tier,
      provider: usage.provider,
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      extra: { conceptCount: targets.length },
    });

    // §5.3 acceptance instrument — the plan requires this per-session log to
    // exist BEFORE the feature can be promoted past beta (≥20 real sessions
    // must confirm the ≤0.05 CHF/session target empirically). Kept as its own
    // structured console line (not folded into logAiUsage/logTelemetry) so a
    // Coolify log query can filter on `[weakness-session] cost` directly.
    //
    // Phase 4.2c (§12.4): `includedPrerequisite` / `prerequisiteConceptId`
    // ride along on this SAME log line (rather than a new one) so a Coolify
    // query can segment cost-per-session by whether a prerequisite was
    // folded in, to measure "does folding P in improve X's closing re-test
    // rate" per §12.4's stated goal.
    const prerequisiteTarget = targets.find((t) => t.isPrerequisite);
    console.info('[weakness-session] cost', {
      userId: opts.userId,
      conceptCount: targets.length,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      model: usage.model,
      estCHF: Number(estCHF.toFixed(5)),
      includedPrerequisite: Boolean(prerequisiteTarget),
      ...(prerequisiteTarget ? { prerequisiteConceptId: prerequisiteTarget.conceptId } : {}),
    });
  }

  if (!parsed || parsed.concepts.length === 0) {
    throw new Error('weakness session generation produced no usable concepts');
  }
  return parsed;
}

/**
 * Validate raw tool output into a parsed session (mirrors `parsePracticeQuiz`):
 * closed-enum filter on `conceptId` (drop anything not in `targetIds`), then
 * per-concept validate `retest` through `normalizeQuizQuestions` +
 * `QuizSetV2Schema` restricted to {@link RETEST_KINDS}. A concept survives
 * only if `reteach`/`discriminate`/`retest` are all present and non-empty AND
 * the retest validates. Returns `null` when nothing usable survives (caller
 * retries). Pure — no I/O.
 */
function parseWeaknessSession(
  raw: unknown,
  targetIds: Set<string>,
  labelById: Map<string, string>,
): ParsedSession | null {
  const r = (raw ?? {}) as { concepts?: unknown };
  const rawConcepts = Array.isArray(r.concepts) ? r.concepts : [];
  const safe = new Set<QuestionKind>(RETEST_KINDS);

  const out: ParsedSessionConcept[] = [];
  const seen = new Set<string>();

  for (const entry of rawConcepts) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const conceptId = typeof e.conceptId === 'string' ? e.conceptId : '';
    if (!conceptId || !targetIds.has(conceptId)) continue; // closed-enum drop
    if (seen.has(conceptId)) continue; // de-dupe a repeated conceptId
    seen.add(conceptId);

    const reteachRaw = e.reteach;
    const discriminateRaw = e.discriminate;
    const retestRaw = e.retest;
    if (!reteachRaw || typeof reteachRaw !== 'object') continue;
    if (!discriminateRaw || typeof discriminateRaw !== 'object') continue;
    if (!retestRaw || typeof retestRaw !== 'object') continue;

    const reteach = reteachRaw as Record<string, unknown>;
    const explanation = typeof reteach.explanation === 'string' ? reteach.explanation.trim() : '';
    const workedExample = typeof reteach.workedExample === 'string' ? reteach.workedExample.trim() : '';
    if (!explanation || !workedExample) continue;
    const sourceAnchor = typeof reteach.sourceAnchor === 'string' && reteach.sourceAnchor.trim()
      ? reteach.sourceAnchor.trim()
      : undefined;

    const discriminate = discriminateRaw as Record<string, unknown>;
    const dPrompt = typeof discriminate.prompt === 'string' ? discriminate.prompt.trim() : '';
    const correctOption = typeof discriminate.correctOption === 'string' ? discriminate.correctOption.trim() : '';
    const confusedOption = typeof discriminate.confusedOption === 'string' ? discriminate.confusedOption.trim() : '';
    const dExplanation = typeof discriminate.explanation === 'string' ? discriminate.explanation.trim() : '';
    if (!dPrompt || !correctOption || !confusedOption || !dExplanation) continue;

    // Validate the retest through the SAME normalize+Zod pipeline every quiz
    // question goes through — wrap the single question in a minimal v2 set
    // shape so `normalizeQuizQuestions` + `QuizSetV2Schema` can be reused
    // verbatim rather than hand-rolling a parallel validator.
    const normalized = normalizeQuizQuestions([retestRaw]);
    const setParsed = QuizSetV2Schema.safeParse({ title: 'retest', questions: normalized });
    if (!setParsed.success || setParsed.data.questions.length === 0) continue;
    const question = setParsed.data.questions[0];
    if (!safe.has(question.kind)) continue;

    out.push({
      conceptId,
      label: labelById.get(conceptId) ?? conceptId,
      reteach: { explanation, workedExample, sourceAnchor },
      discriminate: { prompt: dPrompt, correctOption, confusedOption, explanation: dExplanation },
      retest: {
        kind: question.kind,
        prompt: question.prompt,
        payload: question.payload as Record<string, unknown>,
        correctExplanation: question.correctExplanation ?? '',
        wrongExplanation: question.wrongExplanation ?? '',
      },
    });
  }

  return out.length > 0 ? { concepts: out } : null;
}

// ─────────────────────────────────────────────────────────────────────
// Persistence (§5.2 payload contract, §6.4 delivery order, ConceptTag wiring)
// ─────────────────────────────────────────────────────────────────────

/** Ungraded teaching-row payload shapes (§5.2/§6.4) — server-stamped after
 *  validation, never model-controlled (Phase 0 finding B2). */
interface ReteachRowPayload {
  stepType: 'reteach';
  conceptId: string;
  hintEligible: false;
  immediateFeedback: true;
  reteach: { explanation: string; workedExample: string; sourceAnchor?: string };
}

interface DiscriminateRowPayload {
  stepType: 'discriminate';
  conceptId: string;
  hintEligible: false;
  immediateFeedback: true;
  discriminate: { prompt: string; correctOption: string; confusedOption: string; explanation: string };
}

/**
 * Persist a validated session as a `QuizSet`, in the §6.4 interleave order:
 * ALL re-teach rows (concept order) → ALL discriminate rows (concept order)
 * → ALL re-test rows (concept order). `sortOrder` is assigned 0..N-1 across
 * that flattened order, matching `QuizSessionRunner`'s existing `sortOrder`-
 * driven step sequencing (no runner change needed for the ordering itself).
 *
 * Teaching rows (reteach/discriminate) are ungraded `QuizQuestion` rows —
 * `kind: 'mc'`, `options: []`, `correctIndex: 0` sentinels (never rendered as
 * a real MC choice; the runner reads `payload.stepType` first) — with the
 * REAL content + step metadata stamped into `payload` server-side. Re-test
 * rows persist as NORMAL graded rows via `buildLegacyColumns`, exactly like
 * `practiceQuestionRows` — no `stepType` in their payload, so they count in
 * the attempt/grading denominator like any other quiz question.
 *
 * CRITICAL WIRING: for each created re-test question, upserts a
 * `ConceptTag { conceptId, itemType: 'quiz_question', itemId, weight: 1.0 }`
 * (weight 1.0 — the retest is the concept's sole primary tag, mirrors
 * `TAG_WEIGHT_PRIMARY` from `concept-mastery.ts`). Without this tag the
 * retest's grade would never reach `trackConceptAttempts` /
 * `recordConceptAttempt`, so `ConceptMastery` would never update and a
 * concept could never graduate (§2.4) — this is the ONLY reason the loop
 * closes. Tags are upserted (not created) so re-persisting is idempotent.
 *
 * Returns the created `QuizSet.id`.
 */
export async function persistWeaknessQuizSet(
  userId: string,
  notebookId: string,
  parsed: ParsedSession,
): Promise<string> {
  interface RowPlan {
    conceptId: string;
    isRetest: boolean;
    row: Prisma.QuizQuestionCreateWithoutQuizSetInput;
  }

  const reteachRows: RowPlan[] = [];
  const discriminateRows: RowPlan[] = [];
  const retestRows: RowPlan[] = [];

  for (const concept of parsed.concepts) {
    const reteachPayload: ReteachRowPayload = {
      stepType: 'reteach',
      conceptId: concept.conceptId,
      hintEligible: false,
      immediateFeedback: true,
      reteach: concept.reteach,
    };
    reteachRows.push({
      conceptId: concept.conceptId,
      isRetest: false,
      row: {
        kind: 'mc',
        payload: reteachPayload as unknown as Prisma.InputJsonValue,
        question: concept.label,
        options: [],
        correctIndex: 0,
        sortOrder: 0, // reassigned below
      },
    });

    const discriminatePayload: DiscriminateRowPayload = {
      stepType: 'discriminate',
      conceptId: concept.conceptId,
      hintEligible: false,
      immediateFeedback: true,
      discriminate: concept.discriminate,
    };
    discriminateRows.push({
      conceptId: concept.conceptId,
      isRetest: false,
      row: {
        kind: 'mc',
        payload: discriminatePayload as unknown as Prisma.InputJsonValue,
        question: concept.discriminate.prompt,
        options: [],
        correctIndex: 0,
        sortOrder: 0, // reassigned below
      },
    });

    const legacy = buildLegacyColumns(concept.retest.kind, concept.retest.payload);
    retestRows.push({
      conceptId: concept.conceptId,
      isRetest: true,
      row: {
        kind: concept.retest.kind,
        payload: concept.retest.payload as unknown as Prisma.InputJsonValue,
        question: concept.retest.prompt,
        options: legacy.options,
        correctIndex: legacy.correctIndex,
        correctExplanation: concept.retest.correctExplanation || null,
        wrongExplanation: concept.retest.wrongExplanation || null,
        sortOrder: 0, // reassigned below
      },
    });
  }

  // §6.4 delivery order: all reteach, then all discriminate, then all retest.
  const ordered: RowPlan[] = [...reteachRows, ...discriminateRows, ...retestRows];
  ordered.forEach((plan, i) => {
    plan.row.sortOrder = i;
  });

  const set = await db.quizSet.create({
    data: {
      userId,
      notebookId,
      title: 'Weak-spot training session',
      questions: { create: ordered.map((plan) => plan.row) },
    },
    include: { questions: { orderBy: { sortOrder: 'asc' } } },
  });

  // Map created questions back to their concept by position — `ordered` and
  // `set.questions` (sorted by sortOrder) are the same length and sequence.
  const retestQuestionIdByConceptId = new Map<string, string>();
  set.questions.forEach((q, i) => {
    const plan = ordered[i];
    if (plan?.isRetest) retestQuestionIdByConceptId.set(plan.conceptId, q.id);
  });

  // ConceptTag wiring — the load-bearing link that lets the retest's grade
  // flow back into ConceptMastery via the Phase 1A trackConceptAttempts hook.
  for (const [conceptId, questionId] of retestQuestionIdByConceptId) {
    await db.conceptTag.upsert({
      where: {
        conceptId_itemType_itemId: { conceptId, itemType: 'quiz_question', itemId: questionId },
      },
      update: { weight: 1.0 },
      create: { conceptId, itemType: 'quiz_question', itemId: questionId, weight: 1.0 },
    });
  }

  return set.id;
}
