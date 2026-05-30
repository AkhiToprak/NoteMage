// Phase 10.2 — System prompts for the guided path generator.
//
// Stage A builds the curriculum skeleton. Stage B fills each slot's
// activities (theory / flashcards / quiz). Each builder returns a
// `{ system, tail }` split: `system` is the per-path-constant rule text
// (cached via `buildCachedSystem`), `tail` is the per-slot dynamic text the
// caller may extend with retry notices. The orchestrator (`path-generator.ts`)
// forces the relevant tool via `tool_choice` so the AI is constrained to a
// single structured output.

import type Anthropic from '@anthropic-ai/sdk';
import type { PathSlotKind } from './ai-tools';
import { pathLanguageName, type PathLanguageCode } from './path-languages';
import {
  subjectGuidanceFragment,
  subjectQuizGuidanceFragment,
  subjectTheoryToneFragment,
  type SubjectId,
} from './path-subjects';

/**
 * Leading instruction that forces the model to write every human-readable
 * value in the path's content language. Returns `null` for English (the
 * default) so English paths keep their exact original prompt — only
 * non-English paths get the extra directive. Scoped to VALUES only: the JSON
 * keys must stay English camelCase or the structured-output parsers reject
 * the result.
 */
function languageDirective(language: PathLanguageCode | undefined): string | null {
  const code = language ?? 'en';
  if (code === 'en') return null;
  const name = pathLanguageName(code);
  return (
    `WRITE EVERYTHING IN ${name.toUpperCase()}. Every human-readable value you output — ` +
    'titles, descriptions, prose, bullet points, examples, questions, answer options, hints, ' +
    `and explanations — MUST be written in ${name}, never in English. Keep the JSON KEYS exactly ` +
    'as specified (English, camelCase) and leave code, math, and proper nouns that are normally ' +
    'left untranslated as-is.'
  );
}

/**
 * A prompt line carrying the learner's own goals / intent for the path (the
 * "Study goals" brief). Shared by every Stage B builder so the learner's
 * requested tone, emphasis, focus, and difficulty steer the actual content —
 * not just the Stage A structure. Returns null when no brief was provided.
 */
function learnerBriefLine(ctx: SlotContentContext): string | null {
  const brief = ctx.learnerBrief?.trim();
  if (!brief) return null;
  return (
    "LEARNER'S GOALS for this path — honor any style, emphasis, focus, or " +
    `difficulty level they ask for here: ${brief}`
  );
}

export interface PathStructureContext {
  /** Path title the user requested. May be refined by the AI. */
  title: string;
  /** Optional brief from the user (notebook scope, learning goals, …). */
  brief?: string;
  /**
   * Whether a SOURCE MATERIALS corpus block accompanies this prompt. When
   * true, the prompt instructs the AI to anchor the path to that content.
   */
  hasSourceMaterials: boolean;
  /** Subject buckets returned by the classifier, sorted by weight. */
  subjects: SubjectId[];
  /** Per-subject weights aligned with `subjects`. Sums to ≤ 1.0. */
  subjectWeights: number[];
  /** Content language the path is generated in. Defaults to English. */
  language?: PathLanguageCode;
}

export interface SlotContentContext {
  pathTitle: string;
  pathDescription: string;
  /**
   * The learner's own goals / intent message for the whole path (the "Study
   * goals" brief). Steers HOW content is written — tone, emphasis, focus,
   * difficulty — across every slot. Optional.
   */
  learnerBrief?: string;
  /** The section ("phase") this slot belongs to. */
  phaseTitle: string;
  phaseDescription: string;
  slotTitle: string;
  slotKind: PathSlotKind;
  slotTopicHint: string;
  /**
   * Stage A's measurable objective for this slot — the verb-first capability
   * the learner reaches ("conjugate regular -ar verbs in the present tense").
   * Theory orients toward it; the quiz is written to test it. Optional —
   * absent for legacy slots and the synthetic final exam.
   */
  slotObjective?: string;
  /** Whether a SOURCE MATERIALS corpus block accompanies this prompt. */
  hasSourceMaterials: boolean;
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
  /** Content language the slot is generated in. Defaults to English. */
  language?: PathLanguageCode;
  /**
   * For `flashcards` on a `learning` slot: the plain text of the theory the
   * learner just read in the same slot. When present, cards are built from
   * THIS instead of the topic hint, so they cover exactly what was taught
   * (and only as many cards as the material supports).
   */
  theoryText?: string;
}

/**
 * Build just the source-materials block text (preamble + corpus). Pulled
 * out so both providers can use the byte-identical string — Anthropic
 * wraps it in a `cache_control: ephemeral` block, Gemini concatenates it
 * into the flat `systemInstruction` for implicit caching.
 */
export function buildSourceMaterialsBlock(corpus: string): string {
  return (
    '# SOURCE MATERIALS\n\n' +
    'The learner selected the materials below as the basis for this learning path. ' +
    'Treat them as the single source of truth: ground every section, topic, ' +
    'explanation, example, and question in this content, and prefer its facts, ' +
    'terminology, and emphasis over generic knowledge. You may supplement when the ' +
    'materials leave a gap, but never contradict them.\n\n' +
    corpus
  );
}

/**
 * The output of every path-prompt builder, split into a cacheable prefix and
 * a per-call tail. `system` is per-path-constant (role, JSON-shape spec, rule
 * catalogs, voice/math rules, subject fragment, language directive) so it is
 * billed ~once per path instead of on every one of the ~50 calls. `tail` is
 * the per-slot/per-phase dynamic text (titles, objective, learner brief,
 * reviewOf) plus any retry/corrective notices the caller appends.
 */
export interface SplitPrompt {
  system: string;
  tail: string;
}

/**
 * Assemble the `system` payload for a path-generation call as discrete text
 * blocks: an optional source-materials corpus, the per-path-constant static
 * instructions, and the per-call dynamic tail. The corpus and static blocks
 * are tagged `cache_control: ephemeral` so Anthropic caches them across the
 * ~50-call run (and across an activity's 2–3 retries, since only the tail
 * changes between attempts); the tail is left uncached. Always returns blocks
 * — with no corpus it is `[static(cached), tail(uncached)]`, which is what
 * makes even title-only paths cache their rule catalog. Empty `static` or
 * `tail` blocks are skipped, so a caller wanting corpus-only caching can pass
 * an empty `static` and put everything in `tail`.
 */
export function buildCachedSystem(
  corpus: string | null | undefined,
  staticInstructions: string,
  dynamicTail: string,
): Anthropic.Messages.TextBlockParam[] {
  const blocks: Anthropic.Messages.TextBlockParam[] = [];
  if (corpus && corpus.trim().length > 0) {
    blocks.push({
      type: 'text',
      text: buildSourceMaterialsBlock(corpus),
      cache_control: { type: 'ephemeral' },
    });
  }
  if (staticInstructions.length > 0) {
    blocks.push({
      type: 'text',
      text: staticInstructions,
      cache_control: { type: 'ephemeral' },
    });
  }
  if (dynamicTail.length > 0) {
    blocks.push({ type: 'text', text: dynamicTail });
  }
  return blocks;
}

/**
 * Stage A — system prompt for `create_path_structure`. The AI returns the
 * full phase / slot skeleton in one tool call.
 */
export function buildPathStructurePrompt(ctx: PathStructureContext): SplitPrompt {
  const systemLines: string[] = [
    'You are NoteMage, an AI tutor that designs guided learning paths.',
    'Your job is to plan the SHAPE of the path — sections and slots — not the lesson content itself.',
    '',
    'Output ONLY a single JSON object matching the shape below. No prose, no markdown fences (no ```json), no `tool_code` / `tool_name` / `tool_code_args` wrappers.',
    '',
    'JSON shape (keys MUST match EXACTLY — `phases` NOT `sections`, camelCase):',
    '{ "title": string, "description": string, "phases": [ { "title": string, "description": string, "slots": [ { "title": string, "kind": "learning"|"review"|"assessment", "topicHint": string, "objective": string } ] } ] }',
    'The UI renders each phase as a "Section" — but the JSON key stays `phases`. All titles MUST be non-empty strings.',
    '',
    'Scale to the material:',
    '- Output 3–6 sections with 3–6 slots each — but only as many as the subject matter genuinely supports. Do NOT pad to hit a number; a tight 3-section path beats a bloated 6-section one full of filler slots.',
    '- When the material is thin, make fewer, denser slots. When it is rich, spread it across more slots so each stays focused on one idea.',
    '',
    'Coherence — this is the ONLY step that sees the whole path, so get the structure right here:',
    '- Every slot teaches a DISTINCT concept. No two slots may overlap or repeat. If two ideas are small, merge them into one slot rather than splitting hairs.',
    '- Order the slots so each builds on the ones before it — prerequisites first, then the concepts that depend on them.',
    '',
    'Per-slot fields:',
    '- `title`: one short line (≤ 6 words), shown on the path node.',
    '- `topicHint`: 1–2 sentences naming the SPECIFIC concepts/skills this slot teaches — not a vague label. Drives the theory + flashcards.',
    '- `objective`: ONE line — the concrete, testable thing the learner can DO after this slot, phrased verb-first (e.g. "Conjugate regular -ar verbs in the present tense"). The slot\'s quiz is written to test exactly this, so make it sharp and measurable.',
    '',
    'Slot kinds — build in spaced repetition; NEVER output a section that is just learning slots plus one assessment:',
    '- `learning`: teaches ONE new concept (becomes theory + flashcards).',
    '- `review`: consolidates and quizzes earlier slots (flashcards + quiz, no new theory). Add a `review` slot after about every 2 `learning` slots so the learner practices before taking on more.',
    '- `assessment`: the LAST slot of every section MUST have `kind: "assessment"` — the graded checkpoint that gates the next section.',
    '- A healthy section reads like: learning, learning, review, learning, learning, review, assessment. Adapt the rhythm to the material, but always interleave reviews — do not stack all the learning first.',
    '- Section titles should read like "Section N: Topic" or similar — the UI renders them as banners.',
  ];
  if (ctx.hasSourceMaterials) {
    systemLines.push(
      '- A SOURCE MATERIALS section is provided above. Ground the whole path in it: every section and slot must cover a topic the materials actually teach, sequenced to follow how the material builds up, and TOGETHER the slots should cover the material\'s important topics without leaving big gaps. Do not pad with generic subject topics the materials do not cover. Make each `topicHint` and `objective` point at the specific concepts and skills from those materials.',
    );
  }
  const subjectFragment = subjectGuidanceFragment(ctx.subjects, ctx.subjectWeights);
  if (subjectFragment.length > 0) {
    systemLines.push(subjectFragment);
  }
  const dir = languageDirective(ctx.language);
  if (dir) systemLines.unshift(dir, '');

  const tailLines: string[] = [
    `Path title (user-provided, you may refine): "${ctx.title}"`,
  ];
  if (ctx.brief) {
    tailLines.push(`Learner brief: ${ctx.brief}`);
  }
  return { system: systemLines.join('\n'), tail: tailLines.join('\n') };
}

/**
 * Stage B — theory section prompt. Returns ~300–500 words of structured
 * theory content for a single slot.
 */
export function buildTheoryPrompt(ctx: SlotContentContext): SplitPrompt {
  const systemLines: string[] = [
    'You are NoteMage, writing the theory section for ONE checkpoint slot inside a guided learning path.',
    'Output ONLY a single JSON object matching the shape below. No prose, no markdown fences (no ```json), no `tool_code` / `tool_name` / `tool_code_args` wrappers.',
    '',
    'JSON shape (keys MUST match EXACTLY — camelCase, no snake_case):',
    '{ "title": string, "introduction": string, "keyPoints": string[], "examples": [ { "label": string, "explanation": string } ], "summary": string? }',
    '`title` MUST be a non-empty string — reuse or refine the slot title (e.g. "Ablauf eines externen Projekts"). NEVER leave it empty, NEVER omit it. `keyPoints` MUST be a real JSON array of plain strings (never an object keyed by index, never stringified). `examples` MUST be a real array of `{label, explanation}` objects.',
    '',
    'Voice: warm, plain, example-driven. Short sentences. No marketing fluff.',
    'Length: aim for ~300–500 words across introduction + keyPoints + examples (+ summary).',
    'Stay strictly within the slot\'s topic hint — do NOT drift into adjacent topics or other slots.',
    'For math/science topics: wrap every mathematical expression in `$...$` for inline use (e.g. "the formula $E = mc^2$ tells us…") and `$$...$$` for standalone display equations on their own line. The viewer renders these via KaTeX — never write math as plain text like "E = mc^2".',
    ...(ctx.hasSourceMaterials
      ? [
          'Ground this section in the SOURCE MATERIALS above — explain the actual facts, definitions, terminology, and examples found there. Do not write a generic version of the topic; teach what the provided material covers.',
        ]
      : []),
  ];
  const subjectFragment = subjectTheoryToneFragment(ctx.subjects);
  if (subjectFragment.length > 0) {
    systemLines.push(subjectFragment);
  }
  const dir = languageDirective(ctx.language);
  if (dir) systemLines.unshift(dir, '');

  const tailLines: string[] = [
    `Path: "${ctx.pathTitle}" — ${ctx.pathDescription}`,
    `Section: "${ctx.phaseTitle}" — ${ctx.phaseDescription}`,
    `Slot: "${ctx.slotTitle}"`,
    `Topic hint: ${ctx.slotTopicHint}`,
  ];
  if (ctx.slotObjective && ctx.slotObjective.trim().length > 0) {
    tailLines.push(
      `Learning objective — orient the whole explanation toward enabling this: ${ctx.slotObjective.trim()}`,
    );
  }
  const briefLine = learnerBriefLine(ctx);
  if (briefLine) tailLines.push('', briefLine);
  if (ctx.reviewOf && ctx.reviewOf.length > 0) {
    tailLines.push(
      '',
      'This slot reviews earlier slots — keep the explanation focused on connecting / reinforcing them. Each line below shows a slot and what it taught:',
      ...ctx.reviewOf.map((s) => `- ${s}`),
    );
  }
  return { system: systemLines.join('\n'), tail: tailLines.join('\n') };
}

/**
 * Stage B — flashcards prompt. Only as many cards as the slot material
 * genuinely supports — no forced minimum, no padding.
 */
export function buildFlashcardsPrompt(ctx: SlotContentContext): SplitPrompt {
  const systemLines: string[] = [
    'You are NoteMage, generating flashcards for ONE checkpoint slot inside a guided learning path.',
    'Output ONLY a single JSON object matching the shape below. No prose, no markdown fences (no ```json), no `tool_code` / `tool_name` / `tool_code_args` / `parameters` wrappers — emit the JSON object directly.',
    '',
    'JSON shape (keys MUST match EXACTLY — camelCase, no snake_case):',
    '{ "title": string, "flashcards": [ { "question": string, "answer": string } ] }',
    'Card keys are LITERALLY `question` and `answer` — NEVER `front`/`back`, NEVER `prompt`/`response`, NEVER `q`/`a`. `title` MUST be a non-empty string. `flashcards` MUST be a non-empty JSON array of `{question, answer}` objects (make only as many as the material supports). Never stringified, never keyed by index, never wrapped in a tool envelope.',
    '',
    'Make ONLY as many cards as the material genuinely supports — usually 3–6, sometimes as few as 2. NEVER pad to reach a number and NEVER repeat the same idea across cards; a tight set of 3 good cards beats 10 padded ones.',
    'Vary the angles: definitions, recall prompts, comparisons, and 1–2 "explain why" cards.',
    'Keep each card a plain question → answer pair. Do NOT write blanks ("___") or fake quiz phrasing on the front — flashcards are flat Q→A; interactive question types live in review/assessment slot quizzes, not here.',
    'Keep each answer focused — 1–3 sentences or a short list. Stay strictly within the slot\'s topic hint.',
    ...(ctx.hasSourceMaterials
      ? [
          'Build these cards from the SOURCE MATERIALS above — turn the actual facts, definitions, and details in that content into cards. Do not invent generic cards the materials do not support.',
        ]
      : []),
  ];
  const subjectFragment = subjectTheoryToneFragment(ctx.subjects);
  if (subjectFragment.length > 0) {
    systemLines.push(subjectFragment);
  }
  const dir = languageDirective(ctx.language);
  if (dir) systemLines.unshift(dir, '');

  const tailLines: string[] = [
    `Path: "${ctx.pathTitle}" — ${ctx.pathDescription}`,
    `Section: "${ctx.phaseTitle}"`,
    `Slot: "${ctx.slotTitle}"`,
    `Topic hint: ${ctx.slotTopicHint}`,
  ];
  const briefLine = learnerBriefLine(ctx);
  if (briefLine) tailLines.push('', briefLine);
  if (ctx.theoryText && ctx.theoryText.trim().length > 0) {
    tailLines.push(
      '',
      'THEORY THE LEARNER JUST READ — build every card from THIS and nothing else. Make one card per distinct idea actually covered below; if only 2–3 ideas are here, make only 2–3 cards. Do NOT introduce facts that are not in this theory and do NOT repeat an idea to inflate the count:',
      ctx.theoryText.trim(),
    );
  }
  if (ctx.slotKind === 'review' && ctx.reviewOf && ctx.reviewOf.length > 0) {
    tailLines.push(
      '',
      'This is a REVIEW slot — pull cards from the following earlier slots. Each line shows a slot and what it taught:',
      ...ctx.reviewOf.map((s) => `- ${s}`),
    );
  }
  return { system: systemLines.join('\n'), tail: tailLines.join('\n') };
}

/**
 * Stage B — quiz prompt. 5–8 mixed-kind questions, leveraging the v2
 * question kinds, restricted to the subjects' allowed palette.
 */
export function buildQuizPrompt(ctx: SlotContentContext): SplitPrompt {
  const isFinalExam = ctx.slotKind === 'final_exam';
  const questionRange = isFinalExam ? '12–20 questions' : '5–8 questions';
  const systemLines: string[] = [
    isFinalExam
      ? 'You are NoteMage, writing the FINAL EXAM for a guided learning path. This is the capstone — it should feel like a realistic, comprehensive exam that simulates the high-stakes test the learner is preparing for.'
      : 'You are NoteMage, writing a quiz that tests ONE checkpoint slot inside a guided learning path.',
    'Output ONLY a single JSON object matching the shape below. No prose, no markdown fences (no ```json), no `tool_code` / `tool_name` / `tool_code_args` / `parameters` / `activity` / `quiz` envelopes — emit the JSON object directly.',
    '',
    'JSON shape (top-level keys MUST match EXACTLY — camelCase, no snake_case):',
    '{ "title": string, "questions": [ { "kind": <one of the 11 enum values below>, "prompt": string, "hint": string?, "correctExplanation": string?, "wrongExplanation": string?, "payload": <kind-specific NESTED object> } ] }',
    '`payload` is a NESTED OBJECT. Every kind-specific key (options, correctIndex, correct, blank, pairs, template, slots, wordBank, expectedExpression, code, events, starterCode, tests, …) MUST live INSIDE the `payload` object — NEVER at the question top level next to `kind`/`prompt`.',
    'CORRECT shape:   `{"kind":"mc","prompt":"…","payload":{"options":["a","b","c","d"],"correctIndex":0}}`',
    'WRONG (rejected): `{"kind":"mc","prompt":"…","options":["a","b","c","d"],"correctIndex":0}`',
    'The list key is `questions` — NEVER `quiz` or `items`. Use `correctExplanation` / `wrongExplanation` — NEVER `correct_explanation` / `wrong_explanation`. Use `correctIndex` — NEVER `correct_index`. Use `acceptableAnswers` — NEVER `acceptable_answers`. ALL keys are camelCase.',
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
    '- code_write — the learner writes code in an editor; the server runs it against test cases. Reserve for coding subjects.',
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
    '- code_output → {"language":"python","code":"print(2 + 2)","blank":{"acceptableAnswers":["4"]}}. `code` may contain newlines. The `prompt` is a short lead-in like "What does this print?" — never paste the code into the prompt; the renderer displays it as a syntax-highlighted block. Provide 2–4 `acceptableAnswers` covering common variants (e.g. trailing newline, quoted vs unquoted output). Languages: python, javascript, typescript, java, cpp, sql, plaintext.',
    '- code_write → {"language":"python","starterCode":"def reverse_string(s):\\n    # your code here\\n    pass\\n","tests":[{"name":"hello","stdin":"hello","expectedStdout":"olleh\\n"}],"runTimeoutMs":5000}. The learner edits `starterCode` and the server runs the final program once per test case, piping `stdin` (optional) and comparing the program\'s stdout to `expectedStdout` exactly (whitespace-sensitive). 1–6 tests. Always set `starterCode` so the learner has a scaffold — a function signature with a `# your code here` body for Python, an empty `function ...` for JS, etc. The `prompt` describes the task in plain English ("Write a function that returns the reverse of a string."). Languages: python, javascript, typescript, java, cpp, sql, go, rust.',
    '- timeline → {"events":[{"year":"1914","label":"Outbreak of WWI"}, …]}. 3–8 distinct events with their canonical year. Years are plain strings (e.g. "1914" or "300 BCE"). The `prompt` is a short framing line like "Place each event on the timeline." — do NOT list the events in the prompt.',
    ...(ctx.hasSourceMaterials
      ? [
          'Write every question FROM the SOURCE MATERIALS above — test what that content actually states. Ground each prompt, answer, and explanation in the material rather than generic subject knowledge.',
        ]
      : []),
  ];
  const subjectFragment = subjectQuizGuidanceFragment(ctx.subjects, ctx.subjectWeights);
  if (subjectFragment.length > 0) {
    systemLines.push(subjectFragment);
  }
  const dir = languageDirective(ctx.language);
  if (dir) systemLines.unshift(dir, '');

  const tailLines: string[] = [];
  if (ctx.slotKind === 'assessment') {
    tailLines.push(
      'This is the SECTION CHECKPOINT (the assessment slot). It should test the whole section, not just the most recent slot.',
    );
    if (ctx.reviewOf && ctx.reviewOf.length > 0) {
      tailLines.push(
        'Cover these earlier slots from the section. Each line shows a slot and what it taught:',
        ...ctx.reviewOf.map((s) => `- ${s}`),
      );
    }
  } else if (ctx.slotKind === 'final_exam') {
    tailLines.push(
      'This is the FINAL EXAM — the path-wide capstone. Cover material from every section below, weighted by importance, not by recency.',
    );
    if (ctx.reviewOf && ctx.reviewOf.length > 0) {
      tailLines.push(
        'Topics covered across the path. Each line shows a slot and what it taught:',
        ...ctx.reviewOf.map((s) => `- ${s}`),
      );
    }
  } else if (ctx.slotKind === 'review' && ctx.reviewOf && ctx.reviewOf.length > 0) {
    tailLines.push(
      'This is a REVIEW slot — pull questions from these earlier slots. Each line shows a slot and what it taught:',
      ...ctx.reviewOf.map((s) => `- ${s}`),
    );
  }
  if (tailLines.length > 0) tailLines.push('');
  tailLines.push(
    `Path: "${ctx.pathTitle}" — ${ctx.pathDescription}`,
    `Section: "${ctx.phaseTitle}"`,
    `Slot: "${ctx.slotTitle}"`,
    `Topic hint: ${ctx.slotTopicHint}`,
  );
  if (!isFinalExam && ctx.slotObjective && ctx.slotObjective.trim().length > 0) {
    tailLines.push(
      `Objective to test — write questions that verify the learner can do this: ${ctx.slotObjective.trim()}`,
    );
  }
  const briefLine = learnerBriefLine(ctx);
  if (briefLine) tailLines.push('', briefLine);
  return { system: systemLines.join('\n'), tail: tailLines.join('\n') };
}
