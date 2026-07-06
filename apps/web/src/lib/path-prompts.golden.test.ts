// Golden / regression tests for the Stage-A + Stage-B path prompt builders in
// path-prompts.ts (audit plan M7, pulled into Phase 4 as its flip gate). These
// are CI-safe: pure string builders, no LLM calls, no network, no clock — the
// builders never read Date.now/Math.random, so every output is fully
// deterministic from its fixture context.
//
// Three layers of protection:
//   1. toMatchSnapshot() on each builder's `system` and `tail` halves — a full
//      diff surfaces on any wording change (review the diff, then `-u` if intended).
//   2. Invariant asserts that don't depend on the exact wording:
//        - cache-prefix stability: the `system` half is byte-identical across
//          two contexts that differ only in per-slot dynamic values.
//        - static-size tripwires: chars/4 token estimate of each `system` half
//          stays under a ceiling (~20% over current — a tripwire, not a budget).
//        - quiz payload-catalog appears exactly once in the combined prompt.
//   3. Version-hash lock (see VERSION_HASH_LOCK below).
//
// ── VERSION_HASH_LOCK ──────────────────────────────────────────────────────
// Each builder's full output on a FIXED fixture is sha256'd and compared to a
// literal row keyed by that builder's version constant. Editing a prompt is a
// TWO-STEP change on purpose:
//   (1) bump the version constant in path-prompts.ts, AND
//   (2) update that builder's hash row below (re-run to read the new digest
//       from the failure message, paste it in).
// The friction is deliberate: it makes every prompt edit show up in review as a
// version bump + a hash change, so a silent prompt drift can't slip through. A
// hash mismatch with NO version bump means someone changed a prompt without
// stamping it — that's the failure this lock is here to catch.
// ────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildFlashcardsPrompt,
  buildLearningBatchPrompt,
  buildPathStructurePrompt,
  buildQuizPrompt,
  buildTheoryPrompt,
  PATH_QUIZ_PROMPT_VERSION,
  PATH_STRUCTURE_PROMPT_VERSION,
  PATH_THEORY_PROMPT_VERSION,
  type PathStructureContext,
  type SlotContentContext,
  type SplitPrompt,
} from './path-prompts';
import { quizPayloadCatalogFor } from './ai-tools';
import { allowedKindsForSubjects, type SubjectId } from './path-subjects';

const est = (s: string) => Math.ceil(s.length / 4);
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const combined = (p: SplitPrompt) => `${p.system}\n\n=====TAIL=====\n\n${p.tail}`;

// ── Fixtures ────────────────────────────────────────────────────────────────
// Two subject families so subject-conditional fragments (guidance, tone,
// diagram hints, allowed-kind menu) actually differ across cases: a LANGUAGE
// path (no corpus) and a STEM path (coding+math, with corpus). Every field is a
// fixed literal — no Date, no randomness — so the hashes below are stable.

const LANGUAGE: SubjectId[] = ['language'];
const STEM: SubjectId[] = ['coding', 'math'];
const evenWeights = (s: SubjectId[]) => s.map(() => 1 / s.length);

const structLang: PathStructureContext = {
  title: 'Conversational Spanish for Travel',
  brief: 'Focus on ordering food and asking for directions. Casual tone.',
  hasSourceMaterials: false,
  subjects: LANGUAGE,
  subjectWeights: evenWeights(LANGUAGE),
};

const structStemCorpus: PathStructureContext = {
  title: 'Intro to Recursion and Big-O',
  brief: 'Ground everything in the uploaded lecture notes.',
  hasSourceMaterials: true,
  subjects: STEM,
  subjectWeights: evenWeights(STEM),
};

// Base Stage-B slot context. Individual tests spread over this and change only
// the fields relevant to that builder (slotKind, theoryText, catalogs, …).
const slotBase: SlotContentContext = {
  pathTitle: 'Intro to Recursion and Big-O',
  pathDescription: 'A short path on recursive thinking and complexity analysis.',
  learnerBrief: 'Prefer worked examples over definitions. I get lost in abstraction.',
  phaseTitle: 'Section 1: Thinking Recursively',
  phaseDescription: 'Base cases, recursive cases, and the call stack.',
  slotTitle: 'The Base Case',
  slotKind: 'learning',
  slotTopicHint: 'Why every recursion needs a terminating base case, with a factorial example.',
  slotObjective: 'Identify the base case in a recursive function and explain what happens without one.',
  hasSourceMaterials: true,
  subjects: STEM,
  subjectWeights: evenWeights(STEM),
};

const theoryLang: SlotContentContext = {
  ...slotBase,
  pathTitle: 'Conversational Spanish for Travel',
  pathDescription: 'Order food and ask for directions in casual Spanish.',
  phaseTitle: 'Section 1: At the Restaurant',
  phaseDescription: 'Vocabulary and phrases for ordering a meal.',
  slotTitle: 'Ordering a Meal',
  slotTopicHint: 'Core phrases for ordering food and drink politely in a restaurant.',
  slotObjective: 'Order a meal in Spanish using polite request phrases.',
  hasSourceMaterials: false,
  subjects: LANGUAGE,
  subjectWeights: evenWeights(LANGUAGE),
};

const quizAssessment: SlotContentContext = {
  ...slotBase,
  slotTitle: 'Section 1 Checkpoint',
  slotKind: 'assessment',
  reviewOf: ['The Base Case — terminating condition', 'The Recursive Case — reducing the problem'],
  assessmentSpec: {
    knowledgeType: 'procedural',
    learnerAction: 'Trace a recursive call to its base case.',
    evidence: 'Lists each frame and the returned value.',
    difficulty: 'standard',
    transfer: 'near',
    commonErrors: ['Forgetting the base case', 'Off-by-one in the reduction'],
  },
  knownMisconceptions: ['Thinks recursion always needs a loop'],
};

// ── VERSION_HASH_LOCK table ─────────────────────────────────────────────────
// sha256 of each builder's combined (system + tail) output on the FIXED fixture
// named alongside it. Keyed by the version constant so the row and the constant
// move together. Update BOTH when a prompt changes (see header). Digests are
// filled from the current builder output — a mismatch is either an intended
// edit (bump version + repaste) or an unstamped drift (the bug this catches).
const VERSION_HASH_LOCK: Array<{ version: string; fixture: () => SplitPrompt; hash: string }> = [
  {
    version: PATH_STRUCTURE_PROMPT_VERSION,
    fixture: () => buildPathStructurePrompt(structStemCorpus),
    hash: '94cb64aca2e613e72e074d79969dbbb210753b7ce6082be6ba27cb9e44ae03ee',
  },
  {
    version: PATH_THEORY_PROMPT_VERSION,
    fixture: () => buildTheoryPrompt(slotBase),
    hash: '23619fd6ef727d7d3efb07a3b3c7d1af94f3002db7eacaa892ef70cf49b07497',
  },
  {
    version: PATH_QUIZ_PROMPT_VERSION,
    fixture: () => buildQuizPrompt(quizAssessment),
    hash: 'd22b8197b91173c71adad94e0d46903033b9a31000488bca6bfb11dc71d29c4a',
  },
];

// Static-part size tripwires. Measured current chars/4 estimate, rounded UP to a
// round number ~20% above current. These guard against a prompt ballooning the
// cached prefix (which is billed per path); they are NOT a token budget — bump
// deliberately if a real addition pushes past one.
const STATIC_TOKEN_CEILING = {
  structure: 1400, // current ~1140 (STEM + corpus)
  theory: 1450, // current ~1184
  flashcards: 1150, // current ~942
  quiz: 3000, // current ~2480
  learningBatch: 2700, // current ~2241 (theory.system + flashcards.system)
} as const;

describe('path-prompts golden — snapshots', () => {
  it('buildPathStructurePrompt — language, no corpus', () => {
    const p = buildPathStructurePrompt(structLang);
    expect(p.system).toMatchSnapshot('system');
    expect(p.tail).toMatchSnapshot('tail');
  });

  it('buildPathStructurePrompt — STEM, with corpus', () => {
    const p = buildPathStructurePrompt(structStemCorpus);
    expect(p.system).toMatchSnapshot('system');
    expect(p.tail).toMatchSnapshot('tail');
  });

  it('buildTheoryPrompt — STEM, with corpus', () => {
    const p = buildTheoryPrompt(slotBase);
    expect(p.system).toMatchSnapshot('system');
    expect(p.tail).toMatchSnapshot('tail');
  });

  it('buildTheoryPrompt — language, no corpus', () => {
    const p = buildTheoryPrompt(theoryLang);
    expect(p.system).toMatchSnapshot('system');
    expect(p.tail).toMatchSnapshot('tail');
  });

  it('buildFlashcardsPrompt — STEM learning slot', () => {
    const p = buildFlashcardsPrompt(slotBase);
    expect(p.system).toMatchSnapshot('system');
    expect(p.tail).toMatchSnapshot('tail');
  });

  it('buildFlashcardsPrompt — language review slot', () => {
    const p = buildFlashcardsPrompt({
      ...theoryLang,
      slotKind: 'review',
      reviewOf: ['Ordering a Meal — polite request phrases', 'Greetings — formal vs casual'],
    });
    expect(p.system).toMatchSnapshot('system');
    expect(p.tail).toMatchSnapshot('tail');
  });

  it('buildQuizPrompt — STEM assessment', () => {
    const p = buildQuizPrompt(quizAssessment);
    expect(p.system).toMatchSnapshot('system');
    expect(p.tail).toMatchSnapshot('tail');
  });

  it('buildQuizPrompt — language review slot', () => {
    const p = buildQuizPrompt({
      ...theoryLang,
      slotKind: 'review',
      reviewOf: ['Ordering a Meal — polite request phrases'],
    });
    expect(p.system).toMatchSnapshot('system');
    expect(p.tail).toMatchSnapshot('tail');
  });

  it('buildLearningBatchPrompt — STEM learning slot', () => {
    const p = buildLearningBatchPrompt(slotBase);
    expect(p.system).toMatchSnapshot('system');
    expect(p.tail).toMatchSnapshot('tail');
  });
});

describe('path-prompts golden — cache-prefix stability', () => {
  // The `system` half is the cached prefix. It must be byte-identical across two
  // contexts that differ ONLY in per-slot dynamic values (title/hint/objective),
  // or every slot in a path pays for a fresh prefix.
  const bump = (ctx: SlotContentContext): SlotContentContext => ({
    ...ctx,
    slotTitle: 'A COMPLETELY DIFFERENT TITLE',
    slotTopicHint: 'an entirely different topic hint, longer and unrelated to the first',
    slotObjective: 'Do some other measurable thing after this slot.',
  });

  it('theory system prefix ignores per-slot values', () => {
    expect(buildTheoryPrompt(slotBase).system).toBe(buildTheoryPrompt(bump(slotBase)).system);
  });
  it('flashcards system prefix ignores per-slot values', () => {
    expect(buildFlashcardsPrompt(slotBase).system).toBe(buildFlashcardsPrompt(bump(slotBase)).system);
  });
  it('quiz system prefix ignores per-slot values', () => {
    expect(buildQuizPrompt(quizAssessment).system).toBe(buildQuizPrompt(bump(quizAssessment)).system);
  });
  it('learning-batch system prefix ignores per-slot values', () => {
    expect(buildLearningBatchPrompt(slotBase).system).toBe(
      buildLearningBatchPrompt(bump(slotBase)).system,
    );
  });
  it('structure system prefix ignores the path title', () => {
    const a = buildPathStructurePrompt(structLang);
    const b = buildPathStructurePrompt({ ...structLang, title: 'Some Other Title', brief: 'other' });
    expect(a.system).toBe(b.system);
    // …and the title lives in the tail, so the tail DOES change.
    expect(a.tail).not.toBe(b.tail);
  });
});

describe('path-prompts golden — static-size tripwires', () => {
  it('each builder static part stays under its ceiling', () => {
    expect(est(buildPathStructurePrompt(structStemCorpus).system)).toBeLessThan(
      STATIC_TOKEN_CEILING.structure,
    );
    expect(est(buildTheoryPrompt(slotBase).system)).toBeLessThan(STATIC_TOKEN_CEILING.theory);
    expect(est(buildFlashcardsPrompt(slotBase).system)).toBeLessThan(
      STATIC_TOKEN_CEILING.flashcards,
    );
    expect(est(buildQuizPrompt(quizAssessment).system)).toBeLessThan(STATIC_TOKEN_CEILING.quiz);
    expect(est(buildLearningBatchPrompt(slotBase).system)).toBeLessThan(
      STATIC_TOKEN_CEILING.learningBatch,
    );
  });
});

describe('path-prompts golden — quiz payload catalog appears exactly once', () => {
  it('the payload-catalog header shows up once in the combined prompt', () => {
    const p = buildQuizPrompt(quizAssessment);
    const marker = 'Payload shapes'; // header emitted by quizPayloadCatalogFor
    // sanity: the fixture's allowed kinds do produce a catalog with the header
    expect(quizPayloadCatalogFor(allowedKindsForSubjects(STEM))).toContain(marker);
    const hits = combined(p).split(marker).length - 1;
    expect(hits).toBe(1);
  });
});

describe('path-prompts golden — VERSION_HASH_LOCK', () => {
  for (const row of VERSION_HASH_LOCK) {
    it(`${row.version} — output hash is locked`, () => {
      // If this fails: either you edited the prompt (bump the version constant in
      // path-prompts.ts AND paste the digest below into this row), or a prompt
      // drifted without a version bump (the bug this lock exists to catch).
      expect(sha256(combined(row.fixture()))).toBe(row.hash);
    });
  }
});
