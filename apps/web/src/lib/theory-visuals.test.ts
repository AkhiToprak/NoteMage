// Theory-visuals feature — unit coverage for the riskiest seams:
//   1. Schema gate: loose Gemini-facing shape vs strict Zod per-kind, with
//      invalid entries dropped (not failing the whole section).
//   2. Emit: theoryInputToTipTap interleaves pathImage / pathDiagram nodes.
//   3. Hallucination-drop: resolveFigures rejects unknown/duplicate refs;
//      resolveDiagrams drops per-kind-invalid diagrams.
//   4. Translation round-trip: collectTheoryVisualSlots get/set writes the
//      translated value BACK into attrs (the #1 regression risk).
//   5. Moderation: tiptapJsonToPlainText surfaces diagram labels + image alt.

import { describe, it, expect } from 'vitest';
import { PathDiagramSchema, TheoryFigureSchema, TheorySectionSchema } from '@notemage/shared';
import {
  theoryInputToTipTap,
  resolveFigures,
  resolveDiagrams,
} from '@/lib/path-generator';
import { collectTheoryVisualSlots } from '@/lib/path-translator';
import { tiptapJsonToPlainText } from '@/lib/contentConverter';
import type { SourceImage } from '@/lib/path-image-catalog';

const TIMELINE = {
  kind: 'timeline' as const,
  title: 'Revolution',
  events: [
    { date: '1789', label: 'Estates-General' },
    { date: '1799', label: 'Coup of Brumaire' },
    { date: '1804', label: 'Empire declared' },
  ],
};
const STEPS = {
  kind: 'steps' as const,
  steps: [{ title: 'Mix' }, { title: 'Heat' }, { title: 'Cool' }],
};
const COMPARISON = {
  kind: 'comparison' as const,
  columns: ['Mitosis', 'Meiosis'],
  rows: [{ label: 'Divisions', cells: ['1', '2'] }],
};
const CYCLE = { kind: 'cycle' as const, nodes: ['Evaporation', 'Condensation', 'Precipitation'] };

function mkImage(id: string): SourceImage {
  return {
    id,
    pageTitle: 'Page',
    fileName: `${id}.png`,
    filePath: `images/${id}`,
    mimeType: 'image/png',
    caption: 'caption',
  };
}

const CORE = {
  title: 'Lesson',
  introduction: 'Intro paragraph.',
  keyPoints: ['Point one', 'Point two'],
  examples: [{ label: 'Example', explanation: 'It works like this.' }],
};

describe('PathDiagramSchema', () => {
  it('accepts each valid diagram kind', () => {
    for (const d of [TIMELINE, STEPS, COMPARISON, CYCLE]) {
      expect(PathDiagramSchema.safeParse(d).success).toBe(true);
    }
  });

  it('rejects malformed diagrams', () => {
    expect(PathDiagramSchema.safeParse({ kind: 'pie', slices: [] }).success).toBe(false);
    // timeline needs ≥2 events and each needs a label
    expect(
      PathDiagramSchema.safeParse({ kind: 'timeline', events: [{ date: '1' }] }).success,
    ).toBe(false);
    // comparison needs ≥2 columns
    expect(
      PathDiagramSchema.safeParse({ kind: 'comparison', columns: ['A'], rows: [] }).success,
    ).toBe(false);
  });
});

describe('TheoryFigureSchema', () => {
  it('requires imageRef + caption', () => {
    expect(TheoryFigureSchema.safeParse({ imageRef: 'a', caption: 'b' }).success).toBe(true);
    expect(TheoryFigureSchema.safeParse({ imageRef: 'a' }).success).toBe(false);
    expect(TheoryFigureSchema.safeParse({ caption: 'b' }).success).toBe(false);
  });
});

describe('TheorySectionSchema visuals are optional + loose', () => {
  it('validates with no visuals (legacy output)', () => {
    expect(TheorySectionSchema.safeParse(CORE).success).toBe(true);
  });

  it('does not fail the section over a malformed figure/diagram entry', () => {
    const parsed = TheorySectionSchema.safeParse({
      ...CORE,
      figures: [{ imageRef: 'x', caption: 'y' }, { junk: true }],
      diagrams: [TIMELINE, { kind: 'nonsense' }],
    });
    // Loose arrays mean the whole section still parses; per-entry validation
    // happens later in resolveFigures / resolveDiagrams.
    expect(parsed.success).toBe(true);
  });
});

describe('theoryInputToTipTap emit', () => {
  it('omits custom nodes when no visuals are passed', () => {
    const doc = theoryInputToTipTap(CORE, 'en');
    const types = doc.content.map((n) => n.type);
    expect(types).not.toContain('pathImage');
    expect(types).not.toContain('pathDiagram');
  });

  it('interleaves pathImage (after intro) and pathDiagram (after examples)', () => {
    const doc = theoryInputToTipTap(CORE, 'en', {
      figures: [{ ref: 0, alt: 'A revolution timeline' }],
      diagrams: [TIMELINE],
    });
    const imageIdx = doc.content.findIndex((n) => n.type === 'pathImage');
    const diagramIdx = doc.content.findIndex((n) => n.type === 'pathDiagram');
    expect(imageIdx).toBeGreaterThanOrEqual(0);
    expect(diagramIdx).toBeGreaterThan(imageIdx);

    const image = doc.content[imageIdx];
    expect(image.attrs).toMatchObject({ ref: 0, alt: 'A revolution timeline' });
    const diagram = doc.content[diagramIdx];
    expect((diagram.attrs as { diagram: { kind: string } }).diagram.kind).toBe('timeline');
  });
});

describe('resolveFigures drops hallucinated + duplicate refs', () => {
  it('keeps only refs present in the catalog, deduped, in model order', () => {
    const available = [mkImage('img_1'), mkImage('img_2')];
    const figures = resolveFigures(
      [
        { imageRef: 'img_2', caption: 'real' },
        { imageRef: 'ghost', caption: 'hallucinated' },
        { imageRef: 'img_2', caption: 'dup' },
        { junk: true },
      ],
      available,
    );
    expect(figures).toHaveLength(1);
    expect(figures[0].image.id).toBe('img_2');
    expect(figures[0].caption).toBe('real');
  });

  it('returns nothing when no images are available', () => {
    expect(resolveFigures([{ imageRef: 'img_1', caption: 'c' }], [])).toHaveLength(0);
  });
});

describe('resolveDiagrams drops invalid + caps at 2', () => {
  it('keeps valid diagrams, drops invalid, and stops at two', () => {
    const diagrams = resolveDiagrams([
      TIMELINE,
      { kind: 'timeline', events: [{ date: '1' }] }, // invalid → dropped
      STEPS,
      CYCLE, // beyond the cap of 2 → never reached
    ]);
    expect(diagrams).toHaveLength(2);
    expect(diagrams.map((d) => d.kind)).toEqual(['timeline', 'steps']);
  });
});

describe('collectTheoryVisualSlots round-trip', () => {
  it('writes translated values back into attrs (image alt + diagram labels)', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'pathImage', attrs: { ref: 0, alt: 'original alt' } },
        {
          type: 'pathDiagram',
          attrs: {
            diagram: {
              kind: 'timeline',
              title: 'original title',
              events: [
                { date: '1789', label: 'original label A' },
                { date: '1799', label: 'original label B' },
              ],
            },
          },
        },
      ],
    };
    const slots = collectTheoryVisualSlots(doc);
    // alt + title + 2 event labels — dates are NOT translatable.
    expect(slots).toHaveLength(4);
    slots.forEach((s, i) => s.set(`translated ${i}`));

    const image = doc.content[0] as { attrs: { alt: string } };
    const diagram = doc.content[1] as {
      attrs: { diagram: { title: string; events: { date: string; label: string }[] } };
    };
    expect(image.attrs.alt).toBe('translated 0');
    expect(diagram.attrs.diagram.title).toBe('translated 1');
    expect(diagram.attrs.diagram.events[0].label).toBe('translated 2');
    expect(diagram.attrs.diagram.events[1].label).toBe('translated 3');
    // Dates untouched.
    expect(diagram.attrs.diagram.events[0].date).toBe('1789');
  });
});

describe('tiptapJsonToPlainText surfaces visual strings for moderation', () => {
  it('includes image alt + diagram labels', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Body text.' }] },
        { type: 'pathImage', attrs: { ref: 0, alt: 'caption text here' } },
        { type: 'pathDiagram', attrs: { diagram: TIMELINE } },
      ],
    };
    const text = tiptapJsonToPlainText(doc) ?? '';
    expect(text).toContain('caption text here');
    expect(text).toContain('Estates-General');
    expect(text).toContain('Coup of Brumaire');
    expect(text).toContain('Revolution');
  });
});
