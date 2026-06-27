import { describe, it, expect } from 'vitest';
import {
  expandMageContext,
  resolveMageGrounding,
  type MageGroundingLoader,
  type MageOwnershipLookup,
} from './mage-context';
import {
  applyModeGate,
  buildMageSourceManifest,
  deriveAllowedActions,
  deriveAssistancePolicy,
  deriveRevealGate,
  gateVisibility,
  mageContextKey,
  mageModePromptParts,
  resolveCitedSources,
  type MageGroundingSource,
  type MageSource,
} from './mage-types';

/**
 * A fake ownership lookup backed by a set of "owned" ids. Any id NOT in the set
 * (or that throws) is treated as unauthorized — this is the security-critical
 * path the route relies on to drop other users' ids.
 */
function fakeLookup(owned: Set<string>, throwFor: Set<string> = new Set()): MageOwnershipLookup {
  const check = (id: string) => {
    if (throwFor.has(id)) return Promise.reject(new Error('db down'));
    return Promise.resolve(owned.has(id));
  };
  return {
    ownsNotebook: check,
    ownsPath: check,
    ownsExam: check,
    ownsQuizSet: check,
    ownsPage: check,
    ownsSlot: check,
  };
}

describe('expandMageContext — id authorization', () => {
  it('keeps owned ids and drops unauthorized ones', async () => {
    const lookup = fakeLookup(new Set(['nb-mine', 'path-mine']));
    const resolved = await expandMageContext(
      'user-1',
      {
        type: 'path',
        ids: {
          notebookId: 'nb-mine',
          pathId: 'path-mine',
          examId: 'exam-someone-else',
          quizSetId: 'quiz-someone-else',
        },
      },
      { tier: 'PRO', lookup }
    );

    expect(resolved.ids.notebookId).toBe('nb-mine');
    expect(resolved.ids.pathId).toBe('path-mine');
    // Not owned → dropped entirely.
    expect(resolved.ids.examId).toBeUndefined();
    expect(resolved.ids.quizSetId).toBeUndefined();
  });

  it('drops every id when the user owns none', async () => {
    const lookup = fakeLookup(new Set());
    const resolved = await expandMageContext(
      'user-1',
      { type: 'exam', ids: { examId: 'exam-x', notebookId: 'nb-x', slotId: 'slot-x' } },
      { tier: 'PRO', lookup }
    );
    expect(resolved.ids).toEqual({});
  });

  it('fails closed: a throwing lookup drops the id rather than rejecting', async () => {
    const lookup = fakeLookup(new Set(['ok-page']), new Set(['boom-slot']));
    const resolved = await expandMageContext(
      'user-1',
      { type: 'lesson', ids: { pageId: 'ok-page', slotId: 'boom-slot' } },
      { tier: 'FREE', lookup }
    );
    expect(resolved.ids.pageId).toBe('ok-page');
    expect(resolved.ids.slotId).toBeUndefined();
  });

  it('ignores non-string / empty ids without calling the lookup', async () => {
    const lookup = fakeLookup(new Set());
    const resolved = await expandMageContext(
      'user-1',
      // @ts-expect-error — deliberately malformed client input
      { type: 'global', ids: { notebookId: '', pathId: 42, examId: null } },
      { tier: 'PRO', lookup }
    );
    expect(resolved.ids).toEqual({});
  });
});

describe('expandMageContext — normalization', () => {
  it('coerces an unknown type to "global" and an unknown mode to "quick"', async () => {
    const resolved = await expandMageContext(
      'user-1',
      // @ts-expect-error — unknown type/mode from a stale client
      { type: 'bogus', mode: 'turbo' },
      { tier: 'PRO', lookup: fakeLookup(new Set()) }
    );
    expect(resolved.type).toBe('global');
    expect(resolved.mode).toBe('quick');
  });

  it('caps title and selectedText length and trims them', async () => {
    const resolved = await expandMageContext(
      'user-1',
      { type: 'lesson', title: `  ${'t'.repeat(500)}  `, selectedText: 's'.repeat(9000) },
      { tier: 'PRO', lookup: fakeLookup(new Set()) }
    );
    expect(resolved.title).toHaveLength(200);
    expect(resolved.selectedText).toHaveLength(4000);
  });

  it('defaults a missing context to a plain global turn', async () => {
    const resolved = await expandMageContext('user-1', null, {
      tier: 'PRO',
      lookup: fakeLookup(new Set()),
    });
    expect(resolved.type).toBe('global');
    expect(resolved.ids).toEqual({});
    expect(resolved.mode).toBe('quick');
  });
});

describe('deriveAssistancePolicy', () => {
  it('seals answers in an exam', () => {
    expect(deriveAssistancePolicy('exam')).toBe('no-answers');
  });
  it('is hints-first during practice / a live question', () => {
    expect(deriveAssistancePolicy('practice')).toBe('hints-first');
    expect(deriveAssistancePolicy('quiz-question')).toBe('hints-first');
  });
  it('is full everywhere else', () => {
    for (const t of ['global', 'home', 'lesson', 'path', 'my-path', 'study-pack', 'material', 'quiz-result'] as const) {
      expect(deriveAssistancePolicy(t)).toBe('full');
    }
  });

  it('is enforced server-side by expandMageContext (not client-claimed)', async () => {
    const resolved = await expandMageContext(
      'user-1',
      { type: 'exam', ids: {} },
      { tier: 'PRO', lookup: fakeLookup(new Set()) }
    );
    expect(resolved.assistancePolicy).toBe('no-answers');
  });
});

describe('deriveRevealGate', () => {
  it('seals exam answers', () => {
    expect(deriveRevealGate('no-answers')).toBe('sealed');
  });
  it('gates practice / live-question answers behind a reveal', () => {
    expect(deriveRevealGate('hints-first')).toBe('hint_only');
  });
  it('opens everything else', () => {
    expect(deriveRevealGate('full')).toBe('open');
  });

  it('maps each context type the same way as its policy', () => {
    // The gate is a pure function of the policy; spot-check the composition.
    expect(deriveRevealGate(deriveAssistancePolicy('exam'))).toBe('sealed');
    expect(deriveRevealGate(deriveAssistancePolicy('quiz-question'))).toBe('hint_only');
    expect(deriveRevealGate(deriveAssistancePolicy('practice'))).toBe('hint_only');
    expect(deriveRevealGate(deriveAssistancePolicy('lesson'))).toBe('open');
    expect(deriveRevealGate(deriveAssistancePolicy('quiz-result'))).toBe('open');
  });

  it('is set server-side on the resolved context (not client-claimed)', async () => {
    const exam = await expandMageContext(
      'user-1',
      { type: 'exam', ids: {} },
      { tier: 'PRO', lookup: fakeLookup(new Set()) }
    );
    expect(exam.revealGate).toBe('sealed');
    const practice = await expandMageContext(
      'user-1',
      { type: 'quiz-question', ids: {} },
      { tier: 'PRO', lookup: fakeLookup(new Set()) }
    );
    expect(practice.revealGate).toBe('hint_only');
    const lesson = await expandMageContext(
      'user-1',
      { type: 'lesson', ids: {} },
      { tier: 'PRO', lookup: fakeLookup(new Set()) }
    );
    expect(lesson.revealGate).toBe('open');
  });
});

describe('gateVisibility — the client gate', () => {
  it('shows the body when open', () => {
    expect(gateVisibility('open', false)).toEqual({ showBody: true, canReveal: false, sealed: false });
  });

  it('never renders a sealed body — even if somehow marked revealed', () => {
    // The exam guarantee: the answer never renders even if the model leaked one.
    expect(gateVisibility('sealed', false)).toEqual({ showBody: false, canReveal: false, sealed: true });
    expect(gateVisibility('sealed', true)).toEqual({ showBody: false, canReveal: false, sealed: true });
  });

  it('hides a hint_only body behind a reveal until the learner reveals it', () => {
    expect(gateVisibility('hint_only', false)).toEqual({ showBody: false, canReveal: true, sealed: false });
    expect(gateVisibility('hint_only', true)).toEqual({ showBody: true, canReveal: false, sealed: false });
  });
});

describe('applyModeGate — Phase 9 mode tightens the gate', () => {
  it('strict raises an open gate to hint_only', () => {
    expect(applyModeGate('open', 'strict')).toBe('hint_only');
  });

  it('strict never loosens a tighter gate (hint_only / sealed pass through)', () => {
    expect(applyModeGate('hint_only', 'strict')).toBe('hint_only');
    expect(applyModeGate('sealed', 'strict')).toBe('sealed');
  });

  it('quick and deep never touch the gate', () => {
    for (const gate of ['open', 'hint_only', 'sealed'] as const) {
      expect(applyModeGate(gate, 'quick')).toBe(gate);
      expect(applyModeGate(gate, 'deep')).toBe(gate);
    }
  });
});

describe('expandMageContext — mode-tightened reveal gate', () => {
  it('strict mode hint-gates an otherwise-open lesson', async () => {
    const resolved = await expandMageContext(
      'user-1',
      { type: 'lesson', mode: 'strict', ids: {} },
      { tier: 'PRO', lookup: fakeLookup(new Set()) }
    );
    expect(resolved.revealGate).toBe('hint_only');
  });

  it('quick / deep leave an open lesson open', async () => {
    for (const mode of ['quick', 'deep'] as const) {
      const resolved = await expandMageContext(
        'user-1',
        { type: 'lesson', mode, ids: {} },
        { tier: 'PRO', lookup: fakeLookup(new Set()) }
      );
      expect(resolved.revealGate).toBe('open');
    }
  });

  it('strict does not weaken an exam seal', async () => {
    const resolved = await expandMageContext(
      'user-1',
      { type: 'exam', mode: 'strict', ids: {} },
      { tier: 'PRO', lookup: fakeLookup(new Set()) }
    );
    expect(resolved.revealGate).toBe('sealed');
  });
});

describe('mageModePromptParts — Phase 9 prompt depth + grounding', () => {
  it('strict forbids the general-knowledge fallback', () => {
    const parts = mageModePromptParts('strict');
    expect(parts.uncoveredDirective).toMatch(/ONLY their material/);
    expect(parts.uncoveredDirective).not.toMatch(/general knowledge and say so/);
  });

  it('quick and deep allow the general-knowledge fallback', () => {
    for (const mode of ['quick', 'deep'] as const) {
      expect(mageModePromptParts(mode).uncoveredDirective).toMatch(/general knowledge/);
    }
  });

  it('deep steers thorough, quick steers concise', () => {
    expect(mageModePromptParts('deep').depthDirective).toMatch(/deep|thorough|example/i);
    expect(mageModePromptParts('quick').depthDirective).toMatch(/tight|brief|concise|Don’t pad/i);
  });
});

describe('deriveAllowedActions', () => {
  it('offers navigation for owned ids in context', () => {
    const actions = deriveAllowedActions('path', { pathId: 'p1', slotId: 's1' }, false);
    expect(actions).toContain('OPEN_PATH');
    expect(actions).toContain('OPEN_LESSON');
  });

  it('Pro-gates generation actions', () => {
    const free = deriveAllowedActions('path', { pathId: 'p1' }, false);
    const pro = deriveAllowedActions('path', { pathId: 'p1' }, true);
    expect(free).not.toContain('START_WEAK_TOPIC_SESSION');
    expect(free).not.toContain('CREATE_PRACTICE_SET');
    expect(pro).toContain('START_WEAK_TOPIC_SESSION');
    expect(pro).toContain('CREATE_PRACTICE_SET');
  });

  it('never offers generation while answering a live question', () => {
    const actions = deriveAllowedActions('quiz-question', { quizSetId: 'q1', pathId: 'p1' }, true);
    expect(actions).not.toContain('CREATE_PRACTICE_SET');
    expect(actions).not.toContain('START_WEAK_TOPIC_SESSION');
    expect(actions).toContain('OPEN_QUIZ');
  });

  it('exposes exam edit actions (high-risk, opens prefilled UI) for an owned exam', () => {
    const actions = deriveAllowedActions('exam', { examId: 'e1' }, true);
    expect(actions).toEqual(
      expect.arrayContaining(['OPEN_EXAM', 'EDIT_EXAM_SCOPE', 'CHANGE_EXAM_DATE', 'START_EXAM_SIMULATION'])
    );
  });

  it('always allows creating a new path', () => {
    expect(deriveAllowedActions('global', {}, false)).toContain('CREATE_PATH');
  });
});

/**
 * A fake grounding loader that records which loaders fired and returns a canned
 * source per kind. `nulls` makes a loader return null (no usable content);
 * `throws` makes it reject (db error) — both must drop only that source.
 */
function fakeGroundingLoader(opts: { nulls?: Set<string>; throws?: Set<string> } = {}): {
  loader: MageGroundingLoader;
  calls: string[];
} {
  const calls: string[] = [];
  const make =
    (name: string, kind: MageGroundingSource['kind']) =>
    async (id: string): Promise<MageGroundingSource | null> => {
      calls.push(`${name}:${id}`);
      if (opts.throws?.has(name)) throw new Error('db down');
      if (opts.nulls?.has(name)) return null;
      return { kind, title: `${kind}:${id}`, text: `text for ${id}` };
    };
  return {
    calls,
    loader: {
      slotTheory: make('slotTheory', 'theory'),
      page: make('page', 'page'),
      studyPackOutline: make('studyPackOutline', 'study-pack'),
      pathOutline: make('pathOutline', 'path'),
      examSummary: make('examSummary', 'exam'),
      quizOutline: make('quizOutline', 'quiz'),
    },
  };
}

describe('resolveMageGrounding — id → grounding material', () => {
  it('resolves a lesson slot to its theory', async () => {
    const { loader, calls } = fakeGroundingLoader();
    const sources = await resolveMageGrounding({ slotId: 's1' }, loader);
    expect(calls).toEqual(['slotTheory:s1']);
    expect(sources).toEqual([{ kind: 'theory', title: 'theory:s1', text: 'text for s1' }]);
  });

  it('skips the path outline when a lesson is in focus (theory leads instead)', async () => {
    const { loader, calls } = fakeGroundingLoader();
    const sources = await resolveMageGrounding({ pathId: 'p1', slotId: 's1' }, loader);
    expect(calls).toEqual(['slotTheory:s1']);
    expect(sources.map((s) => s.kind)).toEqual(['theory']);
  });

  it('resolves the path outline only when no lesson is open', async () => {
    const { loader, calls } = fakeGroundingLoader();
    const sources = await resolveMageGrounding({ pathId: 'p1' }, loader);
    expect(calls).toEqual(['pathOutline:p1']);
    expect(sources.map((s) => s.kind)).toEqual(['path']);
  });

  it('resolves a study pack outline from a notebook id', async () => {
    const { loader } = fakeGroundingLoader();
    const sources = await resolveMageGrounding({ notebookId: 'nb1' }, loader);
    expect(sources.map((s) => s.kind)).toEqual(['study-pack']);
  });

  it('drops a source whose loader returns null but keeps the rest', async () => {
    const { loader } = fakeGroundingLoader({ nulls: new Set(['page']) });
    const sources = await resolveMageGrounding({ slotId: 's1', pageId: 'pg1' }, loader);
    expect(sources.map((s) => s.kind)).toEqual(['theory']);
  });

  it('fails soft: a throwing loader drops its source rather than rejecting', async () => {
    const { loader } = fakeGroundingLoader({ throws: new Set(['quizOutline']) });
    const sources = await resolveMageGrounding({ slotId: 's1', quizSetId: 'q1' }, loader);
    expect(sources.map((s) => s.kind)).toEqual(['theory']);
  });

  it('resolves nothing for an empty (fully-dropped) id set', async () => {
    const { loader, calls } = fakeGroundingLoader();
    const sources = await resolveMageGrounding({}, loader);
    expect(calls).toEqual([]);
    expect(sources).toEqual([]);
  });
});

describe('buildMageSourceManifest', () => {
  it('numbers sources and frames each with a [S#] (kind) "Title" — Subtitle (page) header', () => {
    const { corpusParts, manifest } = buildMageSourceManifest([
      {
        kind: 'theory',
        title: 'Diffusion',
        text: 'Particles move down a gradient.',
        subtitle: 'Biology 101',
        href: '/lesson/s1',
      },
      {
        kind: 'page',
        title: 'Osmosis notes',
        text: 'Water moves across a membrane.',
        subtitle: 'Bio pack',
        href: '/learn/paths/nb1',
        pageLabel: 'page 7',
      },
    ]);
    expect(corpusParts[0]).toBe('[S1] (lesson) "Diffusion" — Biology 101\nParticles move down a gradient.');
    expect(corpusParts[1]).toBe('[S2] (page) "Osmosis notes" — Bio pack (page 7)\nWater moves across a membrane.');
    expect(manifest).toEqual([
      { n: 1, kind: 'theory', title: 'Diffusion', subtitle: 'Biology 101', href: '/lesson/s1', pageLabel: undefined },
      { n: 2, kind: 'page', title: 'Osmosis notes', subtitle: 'Bio pack', href: '/learn/paths/nb1', pageLabel: 'page 7' },
    ]);
  });

  it('drops empty-text sources BEFORE numbering so [S#] stays contiguous', () => {
    const { corpusParts, manifest } = buildMageSourceManifest([
      { kind: 'quiz', title: 'Quiz', text: '   ' },
      { kind: 'page', title: 'Page 1', text: 'Real content' },
    ]);
    expect(corpusParts).toEqual(['[S1] (page) "Page 1"\nReal content']);
    expect(manifest.map((s) => s.n)).toEqual([1]);
    expect(manifest[0].title).toBe('Page 1');
  });
});

const CITE_MANIFEST: MageSource[] = [
  { n: 1, kind: 'theory', title: 'Diffusion', href: '/lesson/s1' },
  { n: 2, kind: 'page', title: 'Osmosis', href: '/learn/paths/nb1', pageLabel: 'page 7' },
];

describe('resolveCitedSources — [S#] resolution + sourceMode downgrade', () => {
  it('resolves inline [S#] markers to their manifest chips, in manifest order', () => {
    const out = resolveCitedSources('First [S2], then [S1].', CITE_MANIFEST, null);
    expect(out.sources.map((s) => s.n)).toEqual([1, 2]);
    expect(out.sourceMode).toBe('material');
    expect(out.notFoundInMaterial).toBe(false);
  });

  it('drops hallucinated refs that are not in the manifest', () => {
    const out = resolveCitedSources('From [S2] and [S9].', CITE_MANIFEST, {
      sourceMode: 'material',
      usedSources: [2, 9],
    });
    expect(out.sources.map((s) => s.n)).toEqual([2]);
  });

  it('unions the annotate_answer usedSources claim with inline markers', () => {
    const out = resolveCitedSources('See the lesson.', CITE_MANIFEST, {
      sourceMode: 'material',
      usedSources: [1],
    });
    expect(out.sources.map((s) => s.n)).toEqual([1]);
  });

  it('downgrades a "material" claim to "general" when nothing resolvable was cited', () => {
    const out = resolveCitedSources('A general fact.', CITE_MANIFEST, {
      sourceMode: 'material',
      usedSources: [],
    });
    expect(out.sources).toEqual([]);
    expect(out.sourceMode).toBe('general');
    expect(out.notFoundInMaterial).toBe(true);
  });

  it('keeps a self-declared "general" answer general and flags not-found when material existed', () => {
    const out = resolveCitedSources('Outside the notes.', CITE_MANIFEST, { sourceMode: 'general' });
    expect(out.sourceMode).toBe('general');
    expect(out.notFoundInMaterial).toBe(true);
  });

  it('is general (never material) when there is no manifest at all', () => {
    const out = resolveCitedSources('Anything [S1].', [], { sourceMode: 'material', usedSources: [1] });
    expect(out.sources).toEqual([]);
    expect(out.sourceMode).toBe('general');
    expect(out.notFoundInMaterial).toBe(false);
  });

  it('keeps a "mixed" claim with a real citation and honors an explicit notFoundInMaterial', () => {
    const out = resolveCitedSources('Mostly outside [S1].', CITE_MANIFEST, {
      sourceMode: 'mixed',
      usedSources: [1],
      notFoundInMaterial: true,
    });
    expect(out.sources.map((s) => s.n)).toEqual([1]);
    expect(out.sourceMode).toBe('mixed');
    expect(out.notFoundInMaterial).toBe(true);
  });

  it('ignores a garbage sourceMode and falls back to material when sources resolve', () => {
    const out = resolveCitedSources('Grounded [S1].', CITE_MANIFEST, {
      // @ts-expect-error — a stale/garbage claim from the model
      sourceMode: 'bogus',
      usedSources: [1],
    });
    expect(out.sourceMode).toBe('material');
    expect(out.sources.map((s) => s.n)).toEqual([1]);
  });

  // Phase 9 — strict ("use only my material") mode never reports a blended
  // `mixed` answer: it collapses to material (grounded) or general (not).
  it('strict collapses a grounded "mixed" claim to "material"', () => {
    const out = resolveCitedSources(
      'Mostly outside [S1].',
      CITE_MANIFEST,
      { sourceMode: 'mixed', usedSources: [1] },
      { strict: true }
    );
    expect(out.sourceMode).toBe('material');
    expect(out.sources.map((s) => s.n)).toEqual([1]);
  });

  it('strict collapses an ungrounded "mixed" claim to "general" + notFound', () => {
    const out = resolveCitedSources(
      'Mostly general knowledge.',
      CITE_MANIFEST,
      { sourceMode: 'mixed', usedSources: [] },
      { strict: true }
    );
    expect(out.sourceMode).toBe('general');
    expect(out.notFoundInMaterial).toBe(true);
  });

  it('non-strict still reports a grounded "mixed" answer as mixed', () => {
    const out = resolveCitedSources('Mostly outside [S1].', CITE_MANIFEST, {
      sourceMode: 'mixed',
      usedSources: [1],
    });
    expect(out.sourceMode).toBe('mixed');
  });
});

describe('mageContextKey — Phase 10 per-context thread key', () => {
  it('picks the most specific id: exam > path > notebook > global', () => {
    // All four present → exam wins.
    expect(
      mageContextKey({ ids: { examId: 'e1', pathId: 'p1', notebookId: 'n1' } })
    ).toBe('exam:e1');
    // No exam → path wins.
    expect(mageContextKey({ ids: { pathId: 'p1', notebookId: 'n1' } })).toBe('path:p1');
    // Only a notebook → matches the migration backfill arm.
    expect(mageContextKey({ ids: { notebookId: 'n1' } })).toBe('notebook:n1');
  });

  it('falls back to "global" with no ids (matches the backfill default)', () => {
    expect(mageContextKey({ ids: {} })).toBe('global');
    expect(mageContextKey({})).toBe('global');
    expect(mageContextKey(null)).toBe('global');
    expect(mageContextKey(undefined)).toBe('global');
  });

  it('is consistent for the same surface so a send appends to the resumed thread', () => {
    const a = mageContextKey({ ids: { pathId: 'p1', slotId: 's9' } });
    const b = mageContextKey({ ids: { pathId: 'p1', slotId: 's42' } });
    // Different lessons in the same path share one thread (path-scoped key).
    expect(a).toBe('path:p1');
    expect(b).toBe('path:p1');
  });
});
