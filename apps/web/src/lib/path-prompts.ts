// Phase 10.2 — System prompts for the Duolingo-style path generator.
//
// Stage A builds the curriculum skeleton. Stage B fills each slot's
// activities (theory / flashcards / quiz). Each builder returns a string
// suitable as the `system` field on an Anthropic messages call. The
// orchestrator (`path-generator.ts`) forces the relevant tool via
// `tool_choice` so the AI is constrained to a single structured output.

import type { PathSlotKind } from './ai-tools';
import {
  subjectGuidanceFragment,
  subjectQuizGuidanceFragment,
  subjectTheoryToneFragment,
  type SubjectId,
} from './path-subjects';

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
  /** Subject buckets returned by the classifier, sorted by weight. */
  subjects: SubjectId[];
  /** Per-subject weights aligned with `subjects`. Sums to ≤ 1.0. */
  subjectWeights: number[];
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
  /** Subject buckets returned by the classifier, sorted by weight. */
  subjects: SubjectId[];
  /** Per-subject weights aligned with `subjects`. Sums to ≤ 1.0. */
  subjectWeights: number[];
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
  const subjectFragment = subjectGuidanceFragment(ctx.subjects, ctx.subjectWeights);
  if (subjectFragment.length > 0) {
    lines.push(subjectFragment);
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
  const subjectFragment = subjectTheoryToneFragment(ctx.subjects);
  if (subjectFragment.length > 0) {
    lines.push(subjectFragment);
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
    'Aim for 8–12 cards. Vary the angles: definitions, recall prompts, comparisons, and 1–2 "explain why" cards.',
    'Keep each card a plain question → answer pair. Do NOT write blanks ("___") or fake quiz phrasing on the front — flashcards are flat Q→A; interactive question types live in review/assessment slot quizzes, not here.',
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
  const subjectFragment = subjectTheoryToneFragment(ctx.subjects);
  if (subjectFragment.length > 0) {
    lines.push(subjectFragment);
  }
  return lines.join('\n');
}

/**
 * Stage B — quiz prompt. 5–8 mixed-kind questions, leveraging the v2
 * question kinds, restricted to the subjects' allowed palette.
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
    `Generate ${questionRange}. Use AT LEAST 3 different question kinds across the set; an all-MC quiz is never acceptable. Pick the kind that genuinely fits each item:`,
    '- mc — factual recall with 4 plausible options.',
    '- true_false — a single declarative claim the learner judges. The prompt IS the statement.',
    '- fill_blank — short typed answer (single word / short phrase) where Levenshtein fuzzy-match is fine.',
    '- word_bank — drag tokens into a template with {{0}}, {{1}} blanks. Great for grammar, definitions where ordering matters, or partial-sentence builds.',
    '- match_pairs — terms ↔ definitions, causes ↔ effects, symbols ↔ meanings. 2–8 pairs.',
    '- translation — language items. Same shape as fill_blank plus targetLanguage.',
    '- sentence_reorder — syntax, chronology, process steps. Tokens shuffled into the correct order.',
    '- equation — math input; the grader evaluates algebraic equivalence via mathjs.',
    '- code_output — show a real code snippet and ask for its printed output. Reserve for coding subjects.',
    '- timeline — 3–8 dated events; the learner drags labels onto a year axis. Reserve for history/humanities.',
    'Each question must have a clear `correctExplanation` and `wrongExplanation` so learners get useful feedback.',
    isFinalExam
      ? 'Span the WHOLE path — pull questions from every section, vary difficulty (about 1/3 recall, 1/3 application, 1/3 synthesis), and end with the hardest items.'
      : 'Stay strictly within the slot\'s topic hint.',
    '',
    'Payload shapes — the server rejects drift, so match these exactly:',
    '- mc → {"options":["A","B","C","D"],"correctIndex":0..3}. Plain strings only; no {text,isCorrect} objects.',
    '- true_false → {"correct": true|false}. The prompt itself is the statement to judge; payload only carries the answer key.',
    '- fill_blank → {"blank":{"acceptableAnswers":["answer","alt-spelling"]}}. Provide 2–4 acceptable variants. In the `prompt`, mark the blank with a run of plain underscores (e.g. "In 1894, France and ____ formed an alliance"). NEVER use placeholder syntax like "{{BLANK}}", "{BLANK}", or "[BLANK]" — the learner will see it literally.',
    '- word_bank → {"template":"... {{0}} ... {{1}} ...","slots":[{"correctAnswer":"x"},…],"wordBank":["x","y","distractor"]}. All three keys required. The `prompt` is a SHORT lead-in (e.g. "Complete the statement:") — do NOT paste the template into the prompt; the renderer shows the template separately and you\'ll get "{{0}}" rendered literally. `wordBank` must contain EVERY slot answer including duplicates: if the same word fills two slots, list it twice. Add 2–4 distractor tokens on top of the answer set.',
    '- match_pairs → {"pairs":[{"left":"X","right":"Y"}]}. Keys are exactly `left` and `right`.',
    '- translation → {"targetLanguage":"Spanish","blank":{"acceptableAnswers":["el libro rojo"]}}.',
    '- sentence_reorder → {"correctOrder":["I","want","to","learn"]}. 2–12 tokens.',
    '- equation → {"expectedExpression":"2*x + 3","variables":["x"],"tolerance":0.001}. Set `variables` when the expression contains them. Render math expressions inside the `prompt` with `$...$` (inline) or `$$...$$` (block) — the renderer parses these as LaTeX.',
    '- code_output → {"language":"python","code":"print(2 + 2)","blank":{"acceptableAnswers":["4"]}}. `code` may contain newlines. The `prompt` is a short lead-in like "What does this print?" — never paste the code into the prompt; the renderer displays it as a syntax-highlighted block. Provide 2–4 `acceptableAnswers` covering common variants (e.g. trailing newline, quoted vs unquoted output).',
    '- timeline → {"events":[{"year":"1914","label":"Outbreak of WWI"}, …]}. 3–8 distinct events with their canonical year. Years are plain strings (e.g. "1914" or "300 BCE"). The `prompt` is a short framing line like "Place each event on the timeline." — do NOT list the events in the prompt.',
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
  const subjectFragment = subjectQuizGuidanceFragment(ctx.subjects, ctx.subjectWeights);
  if (subjectFragment.length > 0) {
    lines.push(subjectFragment);
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
