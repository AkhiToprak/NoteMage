/**
 * Phase 7 (manual) — generate a REAL ultra path on GLM and check quiz fidelity.
 *
 *   npx tsx --env-file=.env.local scripts/test-glm-ultra-path.ts
 *
 * Forces GLM_COMPOSITION=1, then for a real corpus:
 *   1. STRUCTURE — forcedStructuredCall(stage:'structure', ultra:true) → GLM-5.2.
 *   2. QUIZ ×3   — the REAL buildQuizPrompt(ctx) → forcedStructuredCall(
 *                  stage:'quiz', ultra:true) → GLM-4.7 — exactly what
 *                  generateQuizActivity does — then validated by the REAL
 *                  QuizSetV2Schema + the subject kind-filter (allowedKindsForSubjects).
 *
 * No DB writes. Real OpenRouter spend (check your dashboard). The script reports
 * cost per stage and, per quiz: schema-valid? all kinds allowed? + every
 * question so quality/answerability can be eyeballed.
 */

process.env.GLM_COMPOSITION = '1';

import { forcedStructuredCall, type NormalizedUsage } from '../src/lib/path-generator-routing';
import { costForCall } from '../src/lib/path-generator-cost';
import { PATH_STRUCTURE_TOOL, QUIZ_FOR_SLOT_TOOL, type QuizForSlotToolInput } from '../src/lib/ai-tools';
import { buildQuizPrompt, type SlotContentContext } from '../src/lib/path-prompts';
import { allowedKindsForSubjects, type SubjectId } from '../src/lib/path-subjects';
import { normalizeQuizQuestions } from '../src/lib/path-generator-normalize';
import { QuizSetV2Schema } from '@notemage/shared';

// ── Real study material (what a student would upload). ──────────────────────
const CORPUS = `Photosynthesis: How Plants Make Food

Photosynthesis is the process by which green plants, algae, and some bacteria convert light energy into chemical energy stored in glucose. The overall reaction takes six molecules of carbon dioxide and six molecules of water, and using light energy, produces one molecule of glucose and six molecules of oxygen: 6CO2 + 6H2O + light -> C6H12O6 + 6O2.

The Chloroplast
Photosynthesis happens inside organelles called chloroplasts, found mainly in the mesophyll cells of leaves. A chloroplast contains stacks of disc-shaped membranes called thylakoids; a stack of thylakoids is a granum. The fluid surrounding the thylakoids is the stroma. The green pigment chlorophyll sits in the thylakoid membranes and absorbs light most strongly in the blue and red parts of the spectrum, reflecting green light, which is why leaves look green.

The Light-Dependent Reactions
The light-dependent reactions take place in the thylakoid membranes. Chlorophyll absorbs photons, exciting electrons to a higher energy level. Water molecules are split (photolysis) to replace these electrons, releasing oxygen as a by-product and hydrogen ions. The energised electrons pass along an electron transport chain, and their energy is used to produce two energy carriers: ATP and NADPH. These reactions require light and cannot proceed in the dark.

The Calvin Cycle (Light-Independent Reactions)
The Calvin cycle occurs in the stroma and does not directly require light, though it depends on the ATP and NADPH produced by the light reactions. Carbon dioxide from the air is "fixed" by the enzyme RuBisCO onto a five-carbon sugar (RuBP). Through a series of steps powered by ATP and NADPH, this produces a three-carbon sugar (G3P), some of which is used to regenerate RuBP and some of which is combined to form glucose. Because it does not need light directly, the Calvin cycle is sometimes called the dark reactions, though it usually runs during the day.

Factors Affecting the Rate
Three main factors limit the rate of photosynthesis: light intensity, carbon dioxide concentration, and temperature. As light intensity increases, the rate rises until another factor becomes limiting. Higher CO2 concentration increases the rate up to a saturation point. Temperature affects the enzymes: too cold and they work slowly; too hot (above about 40°C) and they denature, sharply reducing the rate. The factor in shortest supply at any moment is the limiting factor.

Why It Matters
Photosynthesis is the foundation of almost all food chains, producing the oxygen that most living things breathe and removing carbon dioxide from the atmosphere. The glucose made is used by the plant for respiration (releasing energy), stored as starch, or built into cellulose for cell walls.`;

const SUBJECTS: SubjectId[] = ['general'];
const STRUCTURE_RULES = [
  'Design a learning-path structure from the source material for a high-school biology learner.',
  'Produce 3 sections (phases). Each phase has 2 slots. Cover the chloroplast, the light-dependent',
  'reactions, the Calvin cycle, limiting factors, and why photosynthesis matters.',
  'Titles concise; objectives verb-first and measurable; topicHint a sentence pointing at the material.',
].join('\n');

interface StructSlot {
  kind?: string;
  title?: string;
  objective?: string;
  topicHint?: string;
}
interface StructPhase {
  title?: string;
  description?: string;
  slots?: StructSlot[];
}
interface Structure {
  title?: string;
  description?: string;
  phases?: StructPhase[];
}

const stageCosts: { stage: string; model: string; estUsd: number; realUsd: number | null; ms: number }[] = [];

function recordCost(stage: string, u: NormalizedUsage | undefined, ms: number): void {
  if (!u) return;
  stageCosts.push({
    stage,
    model: u.model,
    estUsd: costForCall(u.model, {
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      cacheReadTokens: u.cacheReadTokens,
      cacheWriteTokens: u.cacheWriteTokens,
    }),
    realUsd: u.costUsd ?? null,
    ms,
  });
}

async function main(): Promise<void> {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('✗ OPENROUTER_API_KEY not set (run with --env-file=.env.local)');
    process.exit(1);
  }
  console.log('GLM_COMPOSITION=1 — generating a real ultra path on GLM.\n');

  // ── 1. STRUCTURE (GLM-5.2, ultra) ──
  let u1: NormalizedUsage | undefined;
  const t1 = Date.now();
  const structure = (await forcedStructuredCall<Structure>({
    stage: 'structure',
    ultra: true,
    corpus: CORPUS,
    staticInstructions: STRUCTURE_RULES,
    dynamicInstructions: 'Build the path structure for "Photosynthesis: How Plants Make Food".',
    anthropicTool: PATH_STRUCTURE_TOOL,
    anthropicTools: [PATH_STRUCTURE_TOOL],
    userMessage: 'Generate now.',
    onUsage: (u) => (u1 = u),
  })) as Structure;
  recordCost('structure', u1, Date.now() - t1);

  const phases = structure.phases ?? [];
  const slots: { phase: StructPhase; slot: StructSlot }[] = [];
  for (const ph of phases) for (const sl of ph.slots ?? []) slots.push({ phase: ph, slot: sl });
  console.log(`STRUCTURE (${u1?.model}): "${structure.title}" — ${phases.length} phases, ${slots.length} slots`);
  for (const ph of phases) {
    console.log(`  • ${ph.title}: ${(ph.slots ?? []).map((s) => s.title).join(' | ')}`);
  }

  // ── 2. QUIZ ×3 (GLM-4.7) via the REAL buildQuizPrompt + REAL validators ──
  const allowed = new Set(allowedKindsForSubjects(SUBJECTS));
  console.log(`\nAllowed quiz kinds for subjects [${SUBJECTS.join(',')}]: ${[...allowed].join(', ')}\n`);

  const picks = slots.slice(0, 3);
  let quizPass = 0;
  for (let i = 0; i < picks.length; i++) {
    const { phase, slot } = picks[i];
    const ctx: SlotContentContext = {
      pathTitle: structure.title ?? 'Photosynthesis',
      pathDescription: structure.description ?? '',
      phaseTitle: phase.title ?? 'Section',
      phaseDescription: phase.description ?? '',
      slotTitle: slot.title ?? `Slot ${i + 1}`,
      slotKind: 'assessment',
      slotTopicHint: slot.topicHint ?? slot.title ?? '',
      slotObjective: slot.objective,
      hasSourceMaterials: true,
      subjects: SUBJECTS,
      subjectWeights: [1],
      language: 'en',
    };
    const { system, tail } = buildQuizPrompt(ctx);

    let u: NormalizedUsage | undefined;
    const t = Date.now();
    const raw = await forcedStructuredCall<QuizForSlotToolInput>({
      stage: 'quiz',
      ultra: true,
      corpus: CORPUS,
      staticInstructions: system,
      dynamicInstructions: tail,
      anthropicTool: QUIZ_FOR_SLOT_TOOL,
      userMessage: `Generate the quiz for slot "${ctx.slotTitle}". The questions array must not be empty.`,
      onUsage: (uu) => (u = uu),
    });
    recordCost(`quiz:${ctx.slotTitle}`, u, Date.now() - t);

    // EXACTLY the production validation (parseQuizInput): normalize → QuizSetV2Schema.
    const normalized = normalizeQuizQuestions(raw.questions);
    const parsed = QuizSetV2Schema.safeParse({ title: raw.title || ctx.slotTitle, questions: normalized });

    console.log(`\n━━━ QUIZ ${i + 1}: "${ctx.slotTitle}" (${u?.model}) ━━━`);
    if (!parsed.success) {
      console.log(`  ✗ SCHEMA INVALID: ${parsed.error.issues.slice(0, 3).map((x) => `${x.path.join('.')}: ${x.message}`).join('; ')}`);
      continue;
    }
    const qs = parsed.data.questions;
    const offending = qs.filter((q) => !allowed.has(q.kind));
    const kindOk = offending.length === 0;
    console.log(`  ✓ schema valid — ${qs.length} questions; kinds: ${qs.map((q) => q.kind).join(', ')}`);
    console.log(`  ${kindOk ? '✓' : '✗'} kind-filter: ${kindOk ? 'all kinds allowed' : 'FORBIDDEN ' + offending.map((q) => q.kind).join(',')}`);
    if (parsed.success && kindOk) quizPass++;
    for (const q of qs) {
      // Print the FULL normalized payload so the marked answer is visible and
      // its correctness can be eyeballed against the corpus.
      console.log(`    - [${q.kind}] ${q.prompt}`);
      console.log(`        ${JSON.stringify(q.payload)}`);
    }
  }

  // ── Summary ──
  console.log('\n════════════════════ COST + RESULT ════════════════════');
  let estTotal = 0;
  let realTotal = 0;
  for (const c of stageCosts) {
    estTotal += c.estUsd;
    realTotal += c.realUsd ?? 0;
    console.log(
      `${c.stage.padEnd(34)} ${c.model.padEnd(14)} ${String(c.ms).padStart(6)}ms  est $${c.estUsd.toFixed(6)}  real $${(c.realUsd ?? 0).toFixed(6)}`,
    );
  }
  console.log(`\nTOTAL ultra-path GLM spend: est $${estTotal.toFixed(5)}  real $${realTotal.toFixed(5)}`);
  console.log(`Quiz fidelity: ${quizPass}/${picks.length} quizzes schema-valid AND within the allowed kind set.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
