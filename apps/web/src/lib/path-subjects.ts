import type { QuestionKind } from '@notemage/shared';

export const SUBJECT_IDS = [
  'coding',
  'math',
  'science_natural',
  'history_humanities',
  'language',
  'social_studies',
  'general',
] as const;
export type SubjectId = (typeof SUBJECT_IDS)[number];

interface SubjectDef {
  /** Human-readable name shown in prompts to the LLM. */
  name: string;
  /** Short display label for chips / filters in the UI. */
  shortLabel: string;
  /** Material Symbols Outlined icon name to pair with the chip. */
  icon: string;
  /** Short blurb the classifier uses to disambiguate. */
  classifierHint: string;
  /** Question kinds allowed in quizzes for this subject. */
  allowedKinds: ReadonlyArray<QuestionKind>;
  /** Subset of allowed kinds the generator should prefer. */
  preferredKinds: ReadonlyArray<QuestionKind>;
  /** One-line tone hint for theory generation. */
  theoryTone: string;
  /** Structure-level steer for Stage A. */
  curriculumGuidance: string;
  /** Quiz-level steer appended to the kind list. */
  quizGuidance: string;
}

export const SUBJECT_REGISTRY: Record<SubjectId, SubjectDef> = {
  coding: {
    name: 'Programming / Computer Science',
    shortLabel: 'Coding',
    icon: 'code',
    classifierHint:
      'Programming languages, software engineering, algorithms, data structures, web/mobile dev, databases, operating systems, CS theory.',
    allowedKinds: ['code_output', 'code_write', 'mc', 'fill_blank', 'sentence_reorder'],
    preferredKinds: ['code_write', 'code_output', 'mc', 'sentence_reorder'],
    theoryTone:
      'Show real code in fenced triple-backtick blocks with a language tag. Concrete, example-led, no marketing prose.',
    curriculumGuidance:
      'Sequence by concept dependency (variables before control flow, control flow before functions, etc.). Slots should build on each other. Avoid bundling unrelated languages into one slot.',
    quizGuidance:
      'Prefer `code_write` for application-level slots (the learner writes a small program against test cases). Use `code_output` for trace/predict-the-output questions. Use `sentence_reorder` to reorder lines into the right execution order. Use `mc` for conceptual recall. Avoid `equation`, `translation`, `word_bank`.',
  },
  math: {
    name: 'Mathematics',
    shortLabel: 'Math',
    icon: 'function',
    classifierHint:
      'Algebra, calculus, statistics, probability, linear algebra, discrete math, geometry, trigonometry, number theory.',
    allowedKinds: ['equation', 'fill_blank', 'word_bank', 'mc'],
    preferredKinds: ['equation', 'fill_blank', 'mc'],
    theoryTone:
      'Formal, precise, equation-led. Wrap math expressions in `$...$` for inline and `$$...$$` for display. State definitions before applying them.',
    curriculumGuidance:
      'Build prerequisites bottom-up — a slot must not reference a concept the learner has not seen yet in this path. Reserve at least one slot per section for worked examples.',
    quizGuidance:
      'Prefer `equation` questions whenever the learner should produce a symbolic answer (use `variables` when the expression has free variables). Use `fill_blank` for short numeric or named-formula answers. Use LaTeX between `$...$` (inline) or `$$...$$` (block) inside prompts. Avoid `code_output`, `timeline`, `translation`.',
  },
  science_natural: {
    name: 'Natural Sciences (physics, chemistry, biology, earth science)',
    shortLabel: 'Science',
    icon: 'science',
    classifierHint:
      'Physics, chemistry, biology, anatomy, ecology, geology, astronomy, earth science. Mix of theory, calculation, and memorization.',
    allowedKinds: ['mc', 'fill_blank', 'match_pairs', 'true_false', 'equation', 'sentence_reorder'],
    preferredKinds: ['match_pairs', 'mc', 'equation'],
    theoryTone:
      'Plain, example-driven. Use diagrams in prose ("imagine a circuit with…"). Wrap formulas in `$...$` when relevant.',
    curriculumGuidance:
      'Pair each definitional slot with one applied / experiment-flavored slot. Sequence vocabulary before mechanisms.',
    quizGuidance:
      'Mix `match_pairs` for term ↔ definition, `mc` for factual recall, `equation` for quantitative items, `sentence_reorder` for ordered processes (e.g., mitosis stages). Use `$...$` LaTeX for any formula. Avoid `code_output`, `timeline`, `translation`, `word_bank`.',
  },
  history_humanities: {
    name: 'History & Humanities',
    shortLabel: 'History',
    icon: 'history_edu',
    classifierHint:
      'History, geography, art history, philosophy, religious studies, classics. Heavy on chronology, causes/effects, and named figures.',
    allowedKinds: ['timeline', 'mc', 'fill_blank', 'true_false', 'match_pairs', 'sentence_reorder'],
    preferredKinds: ['timeline', 'sentence_reorder', 'mc'],
    theoryTone:
      'Narrative, chronological. Anchor every section in dates and named figures. Short paragraphs, no equations.',
    curriculumGuidance:
      'Order slots chronologically within each section. Each section should cover one coherent era or theme.',
    quizGuidance:
      'Use `timeline` whenever the slot involves multiple dated events (3–8 events, real years). Use `sentence_reorder` for ordering causal chains or stages. Use `match_pairs` for figure ↔ contribution. Avoid `equation`, `code_output`, `translation`, `word_bank`.',
  },
  language: {
    name: 'Foreign Language',
    shortLabel: 'Language',
    icon: 'translate',
    classifierHint:
      'Learning a foreign language — vocabulary, grammar, conjugation, translation, listening. NOT linguistics or programming languages.',
    allowedKinds: ['translation', 'fill_blank', 'word_bank', 'sentence_reorder', 'match_pairs'],
    preferredKinds: ['translation', 'word_bank', 'sentence_reorder'],
    theoryTone:
      'Conversational, bilingual where helpful. Show example sentences in both source and target language.',
    curriculumGuidance:
      'Sequence by tense / grammatical structure. Reuse vocabulary across slots so review slots reinforce earlier words.',
    quizGuidance:
      'Use `translation` (set `targetLanguage`) for full-sentence translation items. Use `word_bank` for grammar-fill exercises. Use `sentence_reorder` for syntax drills. Avoid `equation`, `code_output`, `timeline`.',
  },
  social_studies: {
    name: 'Social Studies (law, economics, business, psychology, medicine)',
    shortLabel: 'Social studies',
    icon: 'gavel',
    classifierHint:
      'Law, economics, finance, business, marketing, psychology, sociology, political science, medicine, public health.',
    allowedKinds: ['mc', 'fill_blank', 'true_false', 'match_pairs', 'word_bank'],
    preferredKinds: ['mc', 'match_pairs', 'word_bank'],
    theoryTone:
      'Plain, case-driven. Define jargon on first use. Use short example scenarios when helpful.',
    curriculumGuidance:
      'Define core terms in early slots; reserve later slots for application / case studies. Each section ends with a synthesis assessment.',
    quizGuidance:
      'Use `mc` for case-based items with plausible distractors. Use `match_pairs` for term ↔ definition, statute ↔ jurisdiction, etc. Avoid `equation`, `code_output`, `timeline`, `translation`.',
  },
  general: {
    name: 'General / Mixed',
    shortLabel: 'General',
    icon: 'category',
    classifierHint:
      'Topic does not clearly fit any specific subject, or spans many subjects without one dominating.',
    allowedKinds: [
      'mc',
      'true_false',
      'fill_blank',
      'word_bank',
      'match_pairs',
      'sentence_reorder',
      'equation',
      'translation',
      'code_output',
      'timeline',
    ],
    preferredKinds: ['mc', 'fill_blank', 'match_pairs'],
    theoryTone: 'Warm, plain, example-driven. Match the source material\'s register.',
    curriculumGuidance:
      'Build a balanced curriculum that mirrors the material. Lean on the kinds of activities each section calls for.',
    quizGuidance:
      'Pick whichever kinds genuinely fit each item. Avoid an all-MC quiz — vary the kinds across the set.',
  },
};

/** Minimum subject weight below which a candidate is dropped. */
export const SUBJECT_WEIGHT_FLOOR = 0.15;

/** Union of allowed kinds across the provided subjects. */
export function allowedKindsForSubjects(subjects: SubjectId[]): QuestionKind[] {
  if (subjects.length === 0) return [...SUBJECT_REGISTRY.general.allowedKinds];
  const set = new Set<QuestionKind>();
  for (const id of subjects) {
    const def = SUBJECT_REGISTRY[id] ?? SUBJECT_REGISTRY.general;
    for (const k of def.allowedKinds) set.add(k);
  }
  return Array.from(set);
}

/** Preferred kinds across the provided subjects, ordered by their weight. */
export function preferredKindsForSubjects(
  subjects: SubjectId[],
  weights: number[]
): QuestionKind[] {
  if (subjects.length === 0) return [...SUBJECT_REGISTRY.general.preferredKinds];
  const score = new Map<QuestionKind, number>();
  subjects.forEach((id, i) => {
    const def = SUBJECT_REGISTRY[id] ?? SUBJECT_REGISTRY.general;
    const w = weights[i] ?? 0.5;
    def.preferredKinds.forEach((k, j) => {
      const positional = 1 - j * 0.15;
      const prior = score.get(k) ?? 0;
      score.set(k, prior + w * positional);
    });
  });
  return Array.from(score.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
}

/** Prompt fragment injected into the Stage A structure prompt. */
export function subjectGuidanceFragment(
  subjects: SubjectId[],
  weights: number[]
): string {
  if (subjects.length === 0) return '';
  const lines: string[] = [''];
  if (subjects.length === 1) {
    const def = SUBJECT_REGISTRY[subjects[0]] ?? SUBJECT_REGISTRY.general;
    lines.push(`Subject: ${def.name}.`);
    lines.push(`Subject guidance: ${def.curriculumGuidance}`);
  } else {
    lines.push('Detected subjects (in weight order):');
    subjects.forEach((id, i) => {
      const def = SUBJECT_REGISTRY[id] ?? SUBJECT_REGISTRY.general;
      const pct = Math.round(((weights[i] ?? 0) * 100));
      lines.push(`- ${def.name} (~${pct}%): ${def.curriculumGuidance}`);
    });
    lines.push(
      'The path covers multiple subjects — distribute sections so each detected subject is represented in proportion to its weight, and design slots that respect each subject\'s pedagogy.'
    );
  }
  return lines.join('\n');
}

/** Prompt fragment injected into the Stage B theory prompt. */
export function subjectTheoryToneFragment(subjects: SubjectId[]): string {
  if (subjects.length === 0) return '';
  const lines: string[] = [''];
  if (subjects.length === 1) {
    const def = SUBJECT_REGISTRY[subjects[0]] ?? SUBJECT_REGISTRY.general;
    lines.push(`Voice for this subject (${def.name}): ${def.theoryTone}`);
  } else {
    lines.push('Subject voices (apply whichever matches the slot topic):');
    subjects.forEach((id) => {
      const def = SUBJECT_REGISTRY[id] ?? SUBJECT_REGISTRY.general;
      lines.push(`- ${def.name}: ${def.theoryTone}`);
    });
  }
  return lines.join('\n');
}

/** Prompt fragment injected into the Stage B quiz prompt. Replaces the static kind list. */
export function subjectQuizGuidanceFragment(
  subjects: SubjectId[],
  weights: number[]
): string {
  const allowed = allowedKindsForSubjects(subjects);
  const preferred = preferredKindsForSubjects(subjects, weights);
  const lines: string[] = [''];
  lines.push(
    `Allowed question kinds for this quiz: ${allowed.join(', ')}. NEVER produce a question whose \`kind\` is outside this list — the server rejects it.`
  );
  if (preferred.length > 0) {
    lines.push(
      `Preferred kinds (lead with these when content fits): ${preferred.slice(0, 4).join(', ')}.`
    );
  }
  if (subjects.length === 1) {
    const def = SUBJECT_REGISTRY[subjects[0]] ?? SUBJECT_REGISTRY.general;
    lines.push(`Subject style (${def.name}): ${def.quizGuidance}`);
  } else if (subjects.length > 1) {
    lines.push('Subject styles (distribute questions in proportion to weight):');
    subjects.forEach((id, i) => {
      const def = SUBJECT_REGISTRY[id] ?? SUBJECT_REGISTRY.general;
      const pct = Math.round(((weights[i] ?? 0) * 100));
      lines.push(`- ${def.name} (~${pct}%): ${def.quizGuidance}`);
    });
  }
  return lines.join('\n');
}

/** Sanitize possibly-untrusted classifier output into known SubjectIds. */
export function coerceSubjectIds(raw: unknown): SubjectId[] {
  if (!Array.isArray(raw)) return [];
  const out: SubjectId[] = [];
  const seen = new Set<SubjectId>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!isSubjectId(trimmed)) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function isSubjectId(value: string): value is SubjectId {
  return (SUBJECT_IDS as readonly string[]).includes(value);
}

/** Normalize weights to sum ≤ 1.0 and drop entries below the floor. */
export function normalizeSubjectWeights(
  subjects: SubjectId[],
  rawWeights: unknown
): { subjects: SubjectId[]; weights: number[] } {
  const inWeights = Array.isArray(rawWeights)
    ? rawWeights.map((w) => (typeof w === 'number' && Number.isFinite(w) && w > 0 ? w : 0))
    : subjects.map(() => 1 / Math.max(1, subjects.length));

  const paired = subjects.map((s, i) => ({ s, w: inWeights[i] ?? 0 }));
  const total = paired.reduce((sum, p) => sum + p.w, 0);
  const normalized =
    total > 0 ? paired.map((p) => ({ ...p, w: p.w / total })) : paired.map((p) => ({ ...p, w: 1 / paired.length }));
  const filtered = normalized.filter((p) => p.w >= SUBJECT_WEIGHT_FLOOR).slice(0, 3);
  if (filtered.length === 0) {
    return { subjects: ['general'], weights: [1] };
  }
  const filteredTotal = filtered.reduce((sum, p) => sum + p.w, 0);
  return {
    subjects: filtered.map((p) => p.s),
    weights: filtered.map((p) => Number((p.w / filteredTotal).toFixed(3))),
  };
}
