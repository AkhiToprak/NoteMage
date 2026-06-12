// Diagram cloze (Phase 5) — the deterministic "what's missing in this diagram?"
// question built in CODE from a quiz set's structured diagrams. These tests pin
// the builder's masking rules (never a timeline date / comparison header / row
// label), the skip rule (< 3 unique distractors → null), correctIndex
// correctness, determinism, mask-marker presence, the payload schema's
// accept/reject behaviour, and the translation slot extraction (mask marker
// never collected).

import { describe, it, expect } from 'vitest';
import {
  DiagramClozePayloadSchema,
  DIAGRAM_CLOZE_MASK,
  type PathDiagram,
} from '@notemage/shared';
import { buildDiagramClozeQuestion } from '@/lib/path-generator';
import { questionSlots } from '@/lib/path-translator';

// ── Fixtures ───────────────────────────────────────────────────────────

// 4 events → 3 sibling labels available as distractors (meets the ≥3 rule).
const TIMELINE_4: PathDiagram = {
  kind: 'timeline',
  title: 'Revolution',
  events: [
    { date: '1789', label: 'Estates-General' },
    { date: '1791', label: 'Constitution' },
    { date: '1793', label: 'Reign of Terror' },
    { date: '1799', label: 'Coup of Brumaire' },
  ],
};

// 3 events → only 2 sibling labels → too few distractors on its own.
const TIMELINE_3: PathDiagram = {
  kind: 'timeline',
  title: 'Short',
  events: [
    { date: '1789', label: 'Estates-General' },
    { date: '1799', label: 'Coup of Brumaire' },
    { date: '1804', label: 'Empire declared' },
  ],
};

const STEPS_4: PathDiagram = {
  kind: 'steps',
  steps: [{ title: 'Mix' }, { title: 'Heat' }, { title: 'Cool' }, { title: 'Serve' }],
};

const COMPARISON: PathDiagram = {
  kind: 'comparison',
  columns: ['Mitosis', 'Meiosis'],
  rows: [
    { label: 'Divisions', cells: ['1', '2'] },
    { label: 'Daughter cells', cells: ['Two', 'Four'] },
  ],
};

const CYCLE_4: PathDiagram = {
  kind: 'cycle',
  nodes: ['Evaporation', 'Condensation', 'Precipitation', 'Collection'],
};

// Helper: how many of `diagram`'s labels carry the mask marker.
function countMasked(diagram: PathDiagram): number {
  let n = 0;
  const hit = (s: string) => {
    if (s === DIAGRAM_CLOZE_MASK) n += 1;
  };
  switch (diagram.kind) {
    case 'timeline':
      diagram.events.forEach((e) => hit(e.label));
      break;
    case 'steps':
      diagram.steps.forEach((s) => hit(s.title));
      break;
    case 'comparison':
      diagram.rows.forEach((r) => r.cells.forEach(hit));
      break;
    case 'cycle':
      diagram.nodes.forEach(hit);
      break;
  }
  return n;
}

// ── Builder ────────────────────────────────────────────────────────────

describe('buildDiagramClozeQuestion — masking rules', () => {
  it('masks exactly ONE event label and never the dates (timeline)', () => {
    const q = buildDiagramClozeQuestion([TIMELINE_4], 'en');
    expect(q).not.toBeNull();
    const d = q!.payload.diagram;
    expect(d.kind).toBe('timeline');
    expect(countMasked(d)).toBe(1);
    if (d.kind === 'timeline') {
      // Every date is untouched (dates are the cue, never masked).
      for (const ev of d.events) expect(ev.date).not.toBe(DIAGRAM_CLOZE_MASK);
      expect(d.events.map((e) => e.date)).toEqual(['1789', '1791', '1793', '1799']);
    }
  });

  it('the correct option is the removed label, at correctIndex', () => {
    const q = buildDiagramClozeQuestion([TIMELINE_4], 'en')!;
    // Middle maskable element of 4 = index floor(4/2) = 2 → 'Reign of Terror'.
    expect(q.payload.options[q.payload.correctIndex]).toBe('Reign of Terror');
    // The masked diagram no longer contains the answer as a real label.
    const d = q.payload.diagram;
    if (d.kind === 'timeline') {
      expect(d.events.map((e) => e.label)).not.toContain('Reign of Terror');
    }
  });

  it('produces 4 distinct non-empty options', () => {
    const q = buildDiagramClozeQuestion([TIMELINE_4], 'en')!;
    expect(q.payload.options).toHaveLength(4);
    expect(new Set(q.payload.options.map((o) => o.toLowerCase())).size).toBe(4);
    for (const o of q.payload.options) expect(o.trim().length).toBeGreaterThan(0);
    // Validates against the schema (length 4, correctIndex 0..3).
    expect(DiagramClozePayloadSchema.safeParse(q.payload).success).toBe(true);
  });

  it('masks a step title (steps)', () => {
    const q = buildDiagramClozeQuestion([STEPS_4], 'en')!;
    const d = q.payload.diagram;
    expect(d.kind).toBe('steps');
    expect(countMasked(d)).toBe(1);
    // floor(4/2) = 2 → 'Cool'.
    expect(q.payload.options[q.payload.correctIndex]).toBe('Cool');
  });

  it('masks a body CELL only — never a column header or row label (comparison)', () => {
    const q = buildDiagramClozeQuestion([COMPARISON], 'en')!;
    const d = q.payload.diagram;
    expect(d.kind).toBe('comparison');
    expect(countMasked(d)).toBe(1);
    if (d.kind === 'comparison') {
      // Headers + row labels are NEVER the marker.
      expect(d.columns).not.toContain(DIAGRAM_CLOZE_MASK);
      for (const r of d.rows) expect(r.label).not.toBe(DIAGRAM_CLOZE_MASK);
    }
    // 4 cells → middle = index 2 → row 1 ('Daughter cells') cell 0 = 'Two'.
    expect(q.payload.options[q.payload.correctIndex]).toBe('Two');
  });

  it('masks a node (cycle)', () => {
    const q = buildDiagramClozeQuestion([CYCLE_4], 'en')!;
    const d = q.payload.diagram;
    expect(d.kind).toBe('cycle');
    expect(countMasked(d)).toBe(1);
    expect(q.payload.options[q.payload.correctIndex]).toBe('Precipitation'); // floor(4/2)=2
  });
});

describe('buildDiagramClozeQuestion — skip rule (< 3 unique distractors)', () => {
  it('returns null for a lone 3-element timeline (only 2 distractors)', () => {
    expect(buildDiagramClozeQuestion([TIMELINE_3], 'en')).toBeNull();
  });

  it('uses a SIBLING diagram to reach 3 distractors', () => {
    // TIMELINE_3 alone has 2 distractors; CYCLE_4 supplies more.
    const q = buildDiagramClozeQuestion([TIMELINE_3, CYCLE_4], 'en');
    expect(q).not.toBeNull();
    expect(q!.payload.options).toHaveLength(4);
    // Target is still the FIRST diagram with maskable elements (TIMELINE_3).
    expect(q!.payload.diagram.kind).toBe('timeline');
  });

  it('returns null for empty input', () => {
    expect(buildDiagramClozeQuestion([], 'en')).toBeNull();
    // @ts-expect-error — exercising the runtime guard against non-arrays.
    expect(buildDiagramClozeQuestion(null, 'en')).toBeNull();
  });
});

describe('buildDiagramClozeQuestion — determinism + stem', () => {
  it('is fully deterministic across repeated calls', () => {
    const a = buildDiagramClozeQuestion([TIMELINE_4, CYCLE_4], 'en');
    const b = buildDiagramClozeQuestion([TIMELINE_4, CYCLE_4], 'en');
    expect(a).toEqual(b);
  });

  it('localizes the stem for known languages, falls back to English', () => {
    expect(buildDiagramClozeQuestion([TIMELINE_4], 'de')!.question).toBe(
      'Was fehlt in diesem Diagramm?',
    );
    expect(buildDiagramClozeQuestion([TIMELINE_4], 'en')!.question).toBe(
      "What's missing in this diagram?",
    );
    // An unlisted language gets the English stem (translatePath localises later).
    expect(buildDiagramClozeQuestion([TIMELINE_4], 'ja' as never)!.question).toBe(
      "What's missing in this diagram?",
    );
  });
});

// ── Payload schema ─────────────────────────────────────────────────────

describe('DiagramClozePayloadSchema', () => {
  it('accepts a well-formed payload', () => {
    const ok = {
      diagram: { kind: 'cycle', nodes: [DIAGRAM_CLOZE_MASK, 'B', 'C'] },
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 0,
    };
    expect(DiagramClozePayloadSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects a wrong option count', () => {
    const bad = {
      diagram: { kind: 'cycle', nodes: ['A', 'B'] },
      options: ['A', 'B', 'C'],
      correctIndex: 0,
    };
    expect(DiagramClozePayloadSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an out-of-range correctIndex', () => {
    const bad = {
      diagram: { kind: 'cycle', nodes: ['A', 'B'] },
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 4,
    };
    expect(DiagramClozePayloadSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an invalid embedded diagram', () => {
    const bad = {
      diagram: { kind: 'timeline', events: [{ date: '1' }] }, // missing label
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 0,
    };
    expect(DiagramClozePayloadSchema.safeParse(bad).success).toBe(false);
  });
});

// ── Translation slots (mask marker never collected) ────────────────────

describe('questionSlots — diagram_cloze translation', () => {
  it('collects the 4 options + diagram labels, but SKIPS the mask marker', () => {
    const q = buildDiagramClozeQuestion([TIMELINE_4], 'en')!;
    // Deep-clone the payload the way translateQuizActivity does.
    const payload = JSON.parse(JSON.stringify(q.payload)) as Record<string, unknown>;
    const row = {
      id: 'q1',
      kind: 'diagram_cloze' as const,
      question: q.question,
      options: [] as string[],
      correctIndex: q.payload.correctIndex,
      hint: null,
      correctExplanation: null,
      wrongExplanation: null,
    };
    const slots = questionSlots(0, row as never, payload, false);
    const texts = slots.map((s) => s.get());
    // The mask marker is NEVER among the collected strings.
    expect(texts).not.toContain(DIAGRAM_CLOZE_MASK);
    // All 4 options are collected (they are natural-language labels).
    for (const opt of q.payload.options) expect(texts).toContain(opt);
    // The diagram title rides along.
    expect(texts).toContain('Revolution');
    // The unmasked event labels are collected; dates are not.
    expect(texts).toContain('Estates-General');
    expect(texts).not.toContain('1789');
  });

  it('write-back mutates options + labels in place, leaving correctIndex untouched', () => {
    const q = buildDiagramClozeQuestion([CYCLE_4], 'en')!;
    const payload = JSON.parse(JSON.stringify(q.payload)) as Record<string, unknown>;
    const row = {
      id: 'q1',
      kind: 'diagram_cloze' as const,
      question: q.question,
      options: [] as string[],
      correctIndex: q.payload.correctIndex,
      hint: null,
      correctExplanation: null,
      wrongExplanation: null,
    };
    const slots = questionSlots(0, row as never, payload, false);
    slots.forEach((s, i) => s.set(`X${i}`));
    // Options were rewritten in the cloned payload.
    expect((payload.options as string[]).every((o) => o.startsWith('X'))).toBe(true);
    // correctIndex is an index, never a slot — unchanged.
    expect(payload.correctIndex).toBe(q.payload.correctIndex);
    // The masked node is still the marker (it was never a translatable slot).
    expect(countMasked(payload.diagram as PathDiagram)).toBe(1);
  });
});
