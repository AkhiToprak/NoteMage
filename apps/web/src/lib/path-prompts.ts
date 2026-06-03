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
import type { QuestionKind } from '@notemage/shared';
import { quizPayloadCatalogFor, type PathSlotKind } from './ai-tools';
import { pathLanguageName, type PathLanguageCode } from './path-languages';
import {
  allowedKindsForSubjects,
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
  /**
   * For `theory`: a deterministic catalog of source images the slot MAY embed
   * (one line per image: `imageRef` + caption + source page). Present only on
   * ultra paths whose materials carried captioned images. When set,
   * `buildTheoryPrompt` adds figure guidance + the catalog to the cached
   * system block; absent → the model is never told figures exist.
   */
  imageCatalog?: string | null;
  /**
   * For `theory`: whether structured diagrams (timeline/steps/comparison/cycle)
   * are offered. Defaults to true. The generator sets it false when
   * `PATH_THEORY_DIAGRAMS_DISABLED` is on so the prose never solicits diagrams
   * we would only drop.
   */
  diagramsEnabled?: boolean;
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
      // 1h TTL: a long/ultra path run fires ~50 sequential calls that can
      // exceed the 5-minute default; when it lapses the (large) corpus is
      // re-billed mid-run. 1h spans the whole run.
      cache_control: { type: 'ephemeral', ttl: '1h' },
    });
  }
  if (staticInstructions.length > 0) {
    blocks.push({
      type: 'text',
      text: staticInstructions,
      cache_control: { type: 'ephemeral', ttl: '1h' },
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
      '- Size the path to the material\'s ACTUAL extent. A short or narrow source means a short path — even a single section with a handful of slots is correct. Never inflate to hit a section/slot count when the material does not carry it; a tight path that covers the source beats a padded one with thin, unsupportable slots.',
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
    'For math/science topics: wrap genuine mathematical notation in `$...$` (inline, e.g. "the formula $E = mc^2$ tells us…") or `$$...$$` (standalone display equation on its own line). The viewer renders these via KaTeX — never write real math as plain text. For simple chemistry formulae and sub/superscripts, PREFER Unicode (e.g. C₆H₁₂O₆, 6 CO₂ + 6 H₂O → C₆H₁₂O₆ + 6 O₂, E = mc²): it renders directly and avoids escaping pitfalls. Reserve LaTeX for notation Unicode cannot express (fractions, integrals, roots, matrices).',
    ...(ctx.hasSourceMaterials
      ? [
          'Ground this section in the SOURCE MATERIALS above — explain the actual facts, definitions, terminology, and examples found there. Do not write a generic version of the topic; teach what the provided material covers.',
        ]
      : []),
  ];
  // Optional visuals — diagrams (all tiers) and source-image figures (only when
  // a catalog is supplied). Both keys are optional in the JSON shape so the
  // model omits them freely; we add the guidance only when each is active.
  const diagramsEnabled = ctx.diagramsEnabled !== false;
  if (diagramsEnabled) {
    systemLines.push(
      '',
      'OPTIONAL DIAGRAMS — you may add a `"diagrams"` array (0–2 entries) when a structured graphic genuinely clarifies the topic; omit it otherwise. Each entry is an object with a `"kind"` and ONLY that kind\'s fields:',
      '- "timeline": { "kind":"timeline", "title"?: string, "events": [ { "date": string, "label": string } ] } — 3–8 dated events in order. Best for history / chronological topics.',
      '- "steps": { "kind":"steps", "title"?: string, "steps": [ { "title": string, "detail"?: string } ] } — 3–8 ordered steps. Best for a process or how-to.',
      '- "comparison": { "kind":"comparison", "title"?: string, "columns": [string], "rows": [ { "label": string, "cells": [string] } ] } — `columns` are the 2–4 things compared; each row is one aspect with one cell per column, in column order.',
      '- "cycle": { "kind":"cycle", "title"?: string, "nodes": [string] } — 3–6 stages in a repeating loop.',
      'Pick the kind that fits; never include empty or filler diagrams.',
    );
  }
  const catalog = ctx.imageCatalog?.trim();
  if (catalog) {
    systemLines.push(
      '',
      'OPTIONAL FIGURES — you may add a `"figures"` array (0–3 entries) of the form `{ "imageRef": string, "caption": string }`, embedding images from the SOURCE FIGURES list below. Rules: copy each `imageRef` VERBATIM from that list (never invent one); include a figure ONLY when it genuinely illustrates THIS slot; prefer one strong figure over several weak ones; omit `figures` entirely if none fit.',
      '',
      catalog,
    );
  }
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
    'Make a card for each distinct idea the material teaches — aim for 3–6 when the material supports it, more when it is rich. Do NOT pad with repeats or filler to hit a number and do NOT split one idea across cards; but DO cover every genuinely distinct point. A focused set that covers the material beats both a padded set and a sparse one.',
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
      'THEORY THE LEARNER JUST READ — build every card from THIS and nothing else. Make a card for each distinct idea taught below and aim to cover them all. Do NOT introduce facts that are not in this theory and do NOT repeat an idea to inflate the count:',
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

// Per-kind one-line menu shown in the quiz prompt. Keyed so buildQuizPrompt can
// list ONLY the kinds a subject allows — offering forbidden kinds is what makes
// weaker models emit them and trip the kind-filter regeneration (Phase 7,
// plans/path-generation-reliability.md).
const QUIZ_KIND_MENU: Record<QuestionKind, string> = {
  mc: '- mc — factual recall with 4 plausible options.',
  true_false: '- true_false — a single declarative claim the learner judges. The prompt IS the statement.',
  fill_blank: '- fill_blank — short typed answer (single word / short phrase) where Levenshtein fuzzy-match is fine.',
  word_bank: '- word_bank — drag tokens into a template with {{0}}, {{1}} blanks. Great for grammar, definitions where ordering matters, or partial-sentence builds.',
  match_pairs: '- match_pairs — terms ↔ definitions, causes ↔ effects, symbols ↔ meanings. 2–8 pairs.',
  translation: '- translation — language items. Same shape as fill_blank plus targetLanguage.',
  sentence_reorder: '- sentence_reorder — syntax, chronology, process steps. Tokens shuffled into the correct order.',
  equation: '- equation — math input; the grader evaluates algebraic equivalence via mathjs.',
  code_output: '- code_output — show a real code snippet and ask for its printed output. Reserve for coding subjects.',
  code_write: '- code_write — the learner writes code in an editor; the server runs it against test cases. Reserve for coding subjects.',
  timeline: '- timeline — 3–8 dated events; the learner drags labels onto a year axis. Reserve for history/humanities.',
};

/**
 * Stage B — quiz prompt. 5–8 mixed-kind questions, leveraging the v2
 * question kinds, restricted to the subjects' allowed palette.
 */
export function buildQuizPrompt(ctx: SlotContentContext): SplitPrompt {
  const isFinalExam = ctx.slotKind === 'final_exam';
  const questionRange = isFinalExam ? '12–20 questions' : '5–8 questions';
  // Show the model ONLY the kinds this subject permits (Phase 7) — falls back
  // to every kind if the subject yielded none.
  const allowed = allowedKindsForSubjects(ctx.subjects);
  const menuKinds: QuestionKind[] =
    allowed.length > 0 ? allowed : (Object.keys(QUIZ_KIND_MENU) as QuestionKind[]);
  const minKinds = Math.min(3, menuKinds.length);
  const systemLines: string[] = [
    isFinalExam
      ? 'You are NoteMage, writing the FINAL EXAM for a guided learning path. This is the capstone — it should feel like a realistic, comprehensive exam that simulates the high-stakes test the learner is preparing for.'
      : 'You are NoteMage, writing a quiz that tests ONE checkpoint slot inside a guided learning path.',
    'Output ONLY a single JSON object matching the shape below. No prose, no markdown fences (no ```json), no `tool_code` / `tool_name` / `tool_code_args` / `parameters` / `activity` / `quiz` envelopes — emit the JSON object directly.',
    '',
    'JSON shape (top-level keys MUST match EXACTLY — camelCase, no snake_case):',
    '{ "title": string, "questions": [ { "kind": <one of the allowed kinds listed below>, "prompt": string, "hint": string?, "correctExplanation": string?, "wrongExplanation": string?, "payload": <kind-specific NESTED object> } ] }',
    '`payload` is a NESTED OBJECT. Every kind-specific key (options, correctIndex, correct, blank, pairs, template, slots, wordBank, expectedExpression, code, events, starterCode, tests, …) MUST live INSIDE the `payload` object — NEVER at the question top level next to `kind`/`prompt`.',
    'CORRECT shape:   `{"kind":"mc","prompt":"…","payload":{"options":["a","b","c","d"],"correctIndex":0}}`',
    'WRONG (rejected): `{"kind":"mc","prompt":"…","options":["a","b","c","d"],"correctIndex":0}`',
    'The list key is `questions` — NEVER `quiz` or `items`. Use `correctExplanation` / `wrongExplanation` — NEVER `correct_explanation` / `wrong_explanation`. Use `correctIndex` — NEVER `correct_index`. Use `acceptableAnswers` — NEVER `acceptable_answers`. ALL keys are camelCase.',
    '',
    `Generate ${questionRange}. Use AT LEAST ${minKinds} different question kind${
      minKinds === 1 ? '' : 's'
    } across the set${
      menuKinds.length > 1 ? '; an all-MC quiz is never acceptable' : ''
    }. Pick the kind that genuinely fits each item — use ONLY the kinds listed here:`,
    ...menuKinds.map((k) => QUIZ_KIND_MENU[k]),
    'Each question must have a clear `correctExplanation` and `wrongExplanation` so learners get useful feedback.',
    isFinalExam
      ? 'Span the WHOLE path — pull questions from every section, vary difficulty (about 1/3 recall, 1/3 application, 1/3 synthesis), and end with the hardest items.'
      : 'Stay strictly within the slot\'s topic hint.',
    '',
    quizPayloadCatalogFor(menuKinds),
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
