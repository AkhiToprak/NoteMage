/**
 * Phase 7 (manual) — generate a COMPLETE ultra path on GLM with real content:
 * structure + every slot's theory / flashcards / quiz, per the slot-kind
 * composition (learning = theory+flashcards, review = flashcards+quiz,
 * assessment = quiz). Uses the REAL prompt builders + normalizers + validators
 * (exactly what generateTheory/Flashcards/QuizActivity do). No DB writes.
 *
 *   npx tsx --env-file=.env.local scripts/test-glm-full-path.ts
 *
 * Routing: GLM_COMPOSITION=1 → structure on GLM-5.2, quiz on GLM-4.7. We also
 * pin PATH_THEORY_MODEL / PATH_FLASHCARDS_MODEL to GLM so the whole path runs on
 * GLM without a Gemini key. NOTE: in PRODUCTION theory + flashcards run on Gemini
 * Flash-Lite (cheaper); this run validates GLM can do them too.
 */

process.env.GLM_COMPOSITION = '1';
// ULTRA experiment: pin EVERY path stage to the flagship GLM-5.2.
process.env.PATH_STRUCTURE_MODEL = 'glm-sonnet';
process.env.PATH_THEORY_MODEL = 'glm-sonnet';
process.env.PATH_FLASHCARDS_MODEL = 'glm-sonnet';
process.env.PATH_QUIZ_MODEL = 'glm-sonnet';

import { forcedStructuredCall, type NormalizedUsage } from '../src/lib/path-generator-routing';
import { costForCall } from '../src/lib/path-generator-cost';
import {
  PATH_STRUCTURE_TOOL,
  THEORY_SECTION_TOOL,
  FLASHCARDS_FOR_SLOT_TOOL,
  QUIZ_FOR_SLOT_TOOL,
  type QuizForSlotToolInput,
} from '../src/lib/ai-tools';
import {
  buildTheoryPrompt,
  buildFlashcardsPrompt,
  buildQuizPrompt,
  type SlotContentContext,
} from '../src/lib/path-prompts';
import { allowedKindsForSubjects, type SubjectId } from '../src/lib/path-subjects';
import {
  normalizeTheoryInput,
  normalizeFlashcardsInput,
  normalizeQuizQuestions,
} from '../src/lib/path-generator-normalize';
import { QuizSetV2Schema } from '@notemage/shared';

const CORPUS = `Newton's Laws of Motion

In 1687 Isaac Newton published three laws that together form the foundation of classical mechanics — the description of how objects move under the action of forces. A force is a push or a pull, measured in newtons (N). The net force is the single force that results from adding up all the individual forces acting on an object.

Newton's First Law (The Law of Inertia)
An object at rest stays at rest, and an object in motion stays in motion at constant velocity, unless acted on by a net external force. This tendency of an object to resist a change in its motion is called inertia, and it increases with mass. A book on a table stays put until pushed; a passenger lurches forward when a car brakes suddenly because their body tends to keep moving — which is why seatbelts matter.

Newton's Second Law (F = ma)
The acceleration of an object is directly proportional to the net force acting on it and inversely proportional to its mass: F = ma, where F is the net force in newtons, m is the mass in kilograms, and a is the acceleration in metres per second squared. A larger force produces a larger acceleration; a more massive object accelerates less for the same force. To accelerate a 1000 kg car at 2 m/s^2 requires a net force of 2000 N.

Newton's Third Law (Action and Reaction)
For every action there is an equal and opposite reaction. When one object exerts a force on a second object, the second exerts a force of equal magnitude in the opposite direction on the first. A rocket pushes exhaust gases downward and the gases push the rocket upward; when you walk, your foot pushes back on the ground and the ground pushes you forward. The two forces act on different objects, which is why they do not cancel out.

Mass versus Weight
Mass is the amount of matter in an object, measured in kilograms, and it does not change with location. Weight is the force of gravity acting on that mass, measured in newtons, and it is given by W = mg, where g is the gravitational field strength (about 9.8 N/kg on Earth). The same astronaut has the same mass on the Moon but weighs about one sixth as much, because the Moon's gravity is weaker.

Why the Laws Matter
Newton's laws let engineers predict motion precisely: the thrust a rocket needs to reach orbit, the braking distance of a car, the recoil of a fired gun, the forces in a bridge. They hold extremely well for everyday speeds and sizes, breaking down only near the speed of light (relativity) or at atomic scales (quantum mechanics).`;

const SUBJECTS: SubjectId[] = ['general'];

interface StructSlot { kind?: string; title?: string; objective?: string; topicHint?: string }
interface StructPhase { title?: string; description?: string; slots?: StructSlot[] }
interface Structure { title?: string; description?: string; phases?: StructPhase[] }

const costs: { stage: string; model: string; real: number; est: number }[] = [];
function rec(stage: string, u: NormalizedUsage | undefined): void {
  if (!u) return;
  costs.push({
    stage,
    model: u.model,
    real: u.costUsd ?? 0,
    est: costForCall(u.model, { inputTokens: u.inputTokens, outputTokens: u.outputTokens, cacheReadTokens: u.cacheReadTokens, cacheWriteTokens: u.cacheWriteTokens }),
  });
}

/** Recursively collect string values — used to derive plain theory text. */
function plainTextOf(v: unknown, acc: string[] = []): string {
  if (typeof v === 'string') acc.push(v);
  else if (Array.isArray(v)) v.forEach((x) => plainTextOf(x, acc));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => plainTextOf(x, acc));
  return acc.join(' ');
}

function ctxFor(s: Structure, ph: StructPhase, sl: StructSlot, slotKind: string, theoryText?: string): SlotContentContext {
  return {
    pathTitle: s.title ?? 'Photosynthesis',
    pathDescription: s.description ?? '',
    phaseTitle: ph.title ?? 'Section',
    phaseDescription: ph.description ?? '',
    slotTitle: sl.title ?? 'Slot',
    slotKind: slotKind as SlotContentContext['slotKind'],
    slotTopicHint: sl.topicHint ?? sl.title ?? '',
    slotObjective: sl.objective,
    hasSourceMaterials: true,
    subjects: SUBJECTS,
    subjectWeights: [1],
    language: 'en',
    theoryText,
  };
}

async function genTheory(ctx: SlotContentContext): Promise<{ text: string; ok: boolean }> {
  const { system, tail } = buildTheoryPrompt(ctx);
  let u: NormalizedUsage | undefined;
  const raw = await forcedStructuredCall<unknown>({
    stage: 'theory', corpus: CORPUS, staticInstructions: system, dynamicInstructions: tail,
    anthropicTool: THEORY_SECTION_TOOL, userMessage: `Write the theory section for slot "${ctx.slotTitle}".`,
    onUsage: (uu) => (u = uu),
  });
  rec(`theory:${ctx.slotTitle}`, u);
  const norm = normalizeTheoryInput(raw) as Record<string, unknown>;
  const text = plainTextOf(norm);
  return { text, ok: text.length > 40 };
}

async function genFlashcards(ctx: SlotContentContext): Promise<{ cards: { question: string; answer: string }[]; ok: boolean }> {
  const { system, tail } = buildFlashcardsPrompt(ctx);
  let u: NormalizedUsage | undefined;
  const raw = await forcedStructuredCall<unknown>({
    stage: 'flashcards', corpus: CORPUS, staticInstructions: system, dynamicInstructions: tail,
    anthropicTool: FLASHCARDS_FOR_SLOT_TOOL, userMessage: `Generate flashcards for slot "${ctx.slotTitle}". The flashcards array must not be empty.`,
    onUsage: (uu) => (u = uu),
  });
  rec(`flashcards:${ctx.slotTitle}`, u);
  const norm = normalizeFlashcardsInput(raw) as { flashcards: { question: string; answer: string }[] };
  return { cards: norm.flashcards, ok: norm.flashcards.length > 0 };
}

async function genQuiz(ctx: SlotContentContext): Promise<{ qs: ReturnType<typeof QuizSetV2Schema.parse>['questions'] | null; valid: boolean; kindOk: boolean }> {
  const { system, tail } = buildQuizPrompt(ctx);
  let u: NormalizedUsage | undefined;
  const raw = await forcedStructuredCall<QuizForSlotToolInput>({
    stage: 'quiz', corpus: CORPUS, staticInstructions: system, dynamicInstructions: tail,
    anthropicTool: QUIZ_FOR_SLOT_TOOL, userMessage: `Generate the quiz for slot "${ctx.slotTitle}". The questions array must not be empty.`,
    onUsage: (uu) => (u = uu),
  });
  rec(`quiz:${ctx.slotTitle}`, u);
  const parsed = QuizSetV2Schema.safeParse({ title: raw.title || ctx.slotTitle, questions: normalizeQuizQuestions(raw.questions) });
  if (!parsed.success) return { qs: null, valid: false, kindOk: false };
  const allowed = new Set(allowedKindsForSubjects(SUBJECTS));
  return { qs: parsed.data.questions, valid: true, kindOk: parsed.data.questions.every((q) => allowed.has(q.kind)) };
}

const COMPOSITION: Record<string, ('theory' | 'flashcards' | 'quiz')[]> = {
  learning: ['theory', 'flashcards'],
  review: ['flashcards', 'quiz'],
  assessment: ['quiz'],
  final_exam: ['quiz'],
};

async function main(): Promise<void> {
  if (!process.env.OPENROUTER_API_KEY) { console.error('✗ OPENROUTER_API_KEY not set'); process.exit(1); }
  console.log('Generating a COMPLETE ultra path on GLM (structure + theory + flashcards + quizzes)…\n');

  let u: NormalizedUsage | undefined;
  const structure = (await forcedStructuredCall<Structure>({
    stage: 'structure', ultra: true, corpus: CORPUS,
    staticInstructions: 'Design a learning path for a high-school physics learner from the source material. 3 sections; mix of learning, review and assessment slots; one final assessment. Verb-first objectives.',
    dynamicInstructions: 'Build the path structure for "Newton\'s Laws of Motion".',
    anthropicTool: PATH_STRUCTURE_TOOL, anthropicTools: [PATH_STRUCTURE_TOOL], userMessage: 'Generate now.',
    onUsage: (uu) => (u = uu),
  })) as Structure;
  rec('structure', u);

  const phases = structure.phases ?? [];
  console.log(`\n█ PATH: ${structure.title}\n  ${structure.description ?? ''}\n`);

  let tStats = { theory: 0, flashcards: 0, quizValid: 0, quizKindOk: 0, quizTotal: 0 };
  for (const ph of phases) {
    console.log(`\n┏━ SECTION: ${ph.title} ${ph.description ? '— ' + ph.description : ''}`);
    for (const sl of ph.slots ?? []) {
      const kind = (sl.kind ?? 'learning').toLowerCase();
      const acts = COMPOSITION[kind] ?? ['theory', 'flashcards'];
      console.log(`┃\n┃  ◆ SLOT [${kind}]: ${sl.title}`);
      let theoryText: string | undefined;
      for (const act of acts) {
        if (act === 'theory') {
          const t = await genTheory(ctxFor(structure, ph, sl, kind));
          theoryText = t.text;
          tStats.theory += t.ok ? 1 : 0;
          console.log(`┃     · theory  ${t.ok ? '✓' : '✗'}  ${t.text.replace(/\s+/g, ' ').slice(0, 180)}…`);
        } else if (act === 'flashcards') {
          const f = await genFlashcards(ctxFor(structure, ph, sl, kind, theoryText));
          tStats.flashcards += f.ok ? 1 : 0;
          console.log(`┃     · flashcards ${f.ok ? '✓' : '✗'} (${f.cards.length})`);
          f.cards.slice(0, 3).forEach((c) => console.log(`┃         Q: ${c.question}\n┃         A: ${c.answer}`));
          if (f.cards.length > 3) console.log(`┃         …+${f.cards.length - 3} more`);
        } else if (act === 'quiz') {
          const q = await genQuiz(ctxFor(structure, ph, sl, kind, theoryText));
          tStats.quizTotal += 1;
          tStats.quizValid += q.valid ? 1 : 0;
          tStats.quizKindOk += q.kindOk ? 1 : 0;
          console.log(`┃     · quiz ${q.valid && q.kindOk ? '✓' : '✗'} (${q.qs?.length ?? 0} Q, schema=${q.valid}, kinds=${q.kindOk})`);
          (q.qs ?? []).slice(0, 4).forEach((qq) => console.log(`┃         [${qq.kind}] ${qq.prompt}  →  ${JSON.stringify(qq.payload).slice(0, 90)}`));
        }
      }
    }
    console.log('┗━');
  }

  const real = costs.reduce((s, c) => s + c.real, 0);
  const est = costs.reduce((s, c) => s + c.est, 0);
  const byModel: Record<string, number> = {};
  for (const c of costs) byModel[c.model] = (byModel[c.model] ?? 0) + c.real;
  console.log('\n════════════════ FULL PATH RESULT ════════════════');
  console.log(`stages: ${costs.length} LLM calls`);
  console.log(`theory ok: ${tStats.theory} | flashcards ok: ${tStats.flashcards} | quizzes valid+kindOk: ${tStats.quizKindOk}/${tStats.quizTotal}`);
  for (const [m, c] of Object.entries(byModel)) console.log(`  ${m.padEnd(14)} real $${c.toFixed(5)}`);
  console.log(`TOTAL: real $${real.toFixed(5)} (est $${est.toFixed(5)})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
