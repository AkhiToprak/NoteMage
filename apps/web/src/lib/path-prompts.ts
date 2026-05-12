// Phase 10.2 — System prompts for the Duolingo-style path generator.
//
// Stage A builds the curriculum skeleton. Stage B fills each slot's
// activities (theory / flashcards / quiz). Each builder returns a string
// suitable as the `system` field on an Anthropic messages call. The
// orchestrator (`path-generator.ts`) forces the relevant tool via
// `tool_choice` so the AI is constrained to a single structured output.

import type { PathSlotKind } from './ai-tools';

export interface PathStructureContext {
  /** Path title the user requested. May be refined by the AI. */
  title: string;
  /** Optional brief from the user (notebook scope, learning goals, …). */
  brief?: string;
  /** Target number of days the learner has — guides phase count + density. */
  targetDays: number;
  /**
   * Optional inventory of source materials the AI must base the path on.
   * Pre-formatted as one entry per line so the prompt stays compact.
   */
  materialInventory?: string;
}

export interface SlotContentContext {
  pathTitle: string;
  pathDescription: string;
  /** The section ("phase") this slot belongs to. */
  phaseTitle: string;
  phaseDescription: string;
  slotTitle: string;
  slotKind: PathSlotKind;
  slotTopicHint: string;
  /**
   * For `review` and `assessment` slots: short summaries of the prior
   * slots in the same phase the slot should review. Empty for `learning`
   * slots.
   */
  reviewOf?: string[];
}

/**
 * Stage A — system prompt for `create_path_structure`. The AI returns the
 * full phase / slot skeleton in one tool call.
 */
export function buildPathStructurePrompt(ctx: PathStructureContext): string {
  const lines: string[] = [
    'You are NoteMage, an AI tutor that designs Duolingo-style learning paths.',
    'Your job is to plan the SHAPE of the path — sections and slots — not the lesson content itself.',
    '',
    'Use the `create_path_structure` tool exactly once. Do not produce any text outside the tool call.',
    '',
    'Rules:',
    '- Output 3–6 sections.',
    '- Each section has 4–6 slots.',
    '- The LAST slot of every section MUST have `kind: "assessment"`. This becomes the checkpoint that gates the next section.',
    '- Early sections should be mostly `learning` slots.',
    '- Middle and late sections may include one `review` slot before the assessment to consolidate earlier slots.',
    '- Slot titles are one short line (≤ 6 words). The `topicHint` is 1–2 sentences telling the content generator what to teach.',
    '- Section titles should read like "Section N: Topic" or similar — the UI renders them as banners.',
    '',
    `Path title (user-provided, you may refine): "${ctx.title}"`,
    `Target days the learner has: ${ctx.targetDays}`,
  ];
  if (ctx.brief) {
    lines.push(`Learner brief: ${ctx.brief}`);
  }
  if (ctx.materialInventory && ctx.materialInventory.trim().length > 0) {
    lines.push(
      '',
      'Source materials the path should be grounded in (anchor your section / slot topics to these):',
      ctx.materialInventory,
    );
  }
  return lines.join('\n');
}

/**
 * Stage B — theory section prompt. Returns ~300–500 words of structured
 * theory content for a single slot.
 */
export function buildTheoryPrompt(ctx: SlotContentContext): string {
  const lines: string[] = [
    'You are NoteMage, writing the theory section for ONE checkpoint slot inside a Duolingo-style learning path.',
    'Use the `create_theory_section` tool exactly once. Do not produce any text outside the tool call.',
    '',
    'Voice: warm, plain, example-driven. Short sentences. No marketing fluff.',
    'Length: aim for ~300–500 words across introduction + keyPoints + examples (+ summary).',
    'Stay strictly within the slot\'s topic hint — do NOT drift into adjacent topics or other slots.',
    '',
    `Path: "${ctx.pathTitle}" — ${ctx.pathDescription}`,
    `Section: "${ctx.phaseTitle}" — ${ctx.phaseDescription}`,
    `Slot: "${ctx.slotTitle}"`,
    `Topic hint: ${ctx.slotTopicHint}`,
  ];
  if (ctx.reviewOf && ctx.reviewOf.length > 0) {
    lines.push(
      '',
      'This slot reviews prior slots — keep the explanation focused on connecting / reinforcing these:',
      ...ctx.reviewOf.map((s) => `- ${s}`),
    );
  }
  return lines.join('\n');
}

/**
 * Stage B — flashcards prompt. 8–12 cards focused on the slot topic.
 */
export function buildFlashcardsPrompt(ctx: SlotContentContext): string {
  const lines: string[] = [
    'You are NoteMage, generating flashcards for ONE checkpoint slot inside a Duolingo-style learning path.',
    'Use the `create_flashcards_for_slot` tool exactly once. Do not produce any text outside the tool call.',
    '',
    'Aim for 8–12 cards. Vary the angles: definitions, recall prompts, fill-in-the-blank style, and 1–2 "explain why" cards.',
    'Keep each answer focused — 1–3 sentences or a short list. Stay strictly within the slot\'s topic hint.',
    '',
    `Path: "${ctx.pathTitle}" — ${ctx.pathDescription}`,
    `Section: "${ctx.phaseTitle}"`,
    `Slot: "${ctx.slotTitle}"`,
    `Topic hint: ${ctx.slotTopicHint}`,
  ];
  if (ctx.slotKind === 'review' && ctx.reviewOf && ctx.reviewOf.length > 0) {
    lines.push(
      '',
      'This is a REVIEW slot — pull from the following prior slots:',
      ...ctx.reviewOf.map((s) => `- ${s}`),
    );
  }
  return lines.join('\n');
}

/**
 * Stage B — quiz prompt. 5–8 mixed-kind questions, leveraging the v2
 * question kinds (mc / fill_blank / word_bank / match_pairs / …).
 */
export function buildQuizPrompt(ctx: SlotContentContext): string {
  const isFinalExam = ctx.slotKind === 'final_exam';
  const questionRange = isFinalExam ? '12–20 questions' : '5–8 questions';
  const lines: string[] = [
    isFinalExam
      ? 'You are NoteMage, writing the FINAL EXAM for a Duolingo-style learning path. This is the capstone — it should feel like a realistic, comprehensive exam that simulates the high-stakes test the learner is preparing for.'
      : 'You are NoteMage, writing a quiz that tests ONE checkpoint slot inside a Duolingo-style learning path.',
    'Use the `create_quiz_for_slot` tool exactly once. Do not produce any text outside the tool call.',
    '',
    `Generate ${questionRange}. Mix at least two question kinds when the content allows — e.g. mc + fill_blank, or mc + match_pairs.`,
    'Avoid all-MC unless the material is purely factual recall.',
    'Each question must have a clear `correctExplanation` and `wrongExplanation` so learners get useful feedback.',
    isFinalExam
      ? 'Span the WHOLE path — pull questions from every section, vary difficulty (about 1/3 recall, 1/3 application, 1/3 synthesis), and end with the hardest items.'
      : 'Stay strictly within the slot\'s topic hint.',
    '',
    'Reminder on payload shape — server validation rejects drift:',
    '- mc options are plain strings, correctness is on the top-level `correctIndex`. Example payload: {"options":["A","B","C","D"],"correctIndex":2}.',
    '- fill_blank wraps answers inside `blank`: {"blank":{"acceptableAnswers":["answer1","answer2"]}}.',
    '- word_bank requires `template` + `slots` + `wordBank` together; do not omit any.',
  ];
  if (ctx.slotKind === 'assessment') {
    lines.push(
      '',
      'This is the SECTION CHECKPOINT (the assessment slot). It should test the whole section, not just the most recent slot.',
    );
    if (ctx.reviewOf && ctx.reviewOf.length > 0) {
      lines.push('Cover these prior slots from the section:', ...ctx.reviewOf.map((s) => `- ${s}`));
    }
  } else if (ctx.slotKind === 'final_exam') {
    lines.push(
      '',
      'This is the FINAL EXAM — the path-wide capstone. Cover material from every section below, weighted by importance, not by recency.',
    );
    if (ctx.reviewOf && ctx.reviewOf.length > 0) {
      lines.push('Topics covered across the path:', ...ctx.reviewOf.map((s) => `- ${s}`));
    }
  } else if (ctx.slotKind === 'review' && ctx.reviewOf && ctx.reviewOf.length > 0) {
    lines.push('', 'This is a REVIEW slot — pull from:', ...ctx.reviewOf.map((s) => `- ${s}`));
  }
  lines.push(
    '',
    `Path: "${ctx.pathTitle}" — ${ctx.pathDescription}`,
    `Section: "${ctx.phaseTitle}"`,
    `Slot: "${ctx.slotTitle}"`,
    `Topic hint: ${ctx.slotTopicHint}`,
  );
  return lines.join('\n');
}
