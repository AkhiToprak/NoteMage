// P10 — unit tests for the pure translation prompt module. No DB, no
// model client — just the rubric/payload/parser/projector contract.

import { describe, it, expect } from 'vitest';
import {
  TRANSLATION_RUBRIC,
  T_ANTHROPIC_TOOL,
  T_GEMINI_SCHEMA,
  buildTranslationPayload,
  parseTranslationResponse,
  projectTranslationOnto,
  type TranslatableSnapshot,
} from '@/lib/translation/prompt';

function makeSnapshot(): TranslatableSnapshot {
  return {
    sourceLanguage: 'de',
    targetLanguage: 'en',
    title: 'Titel',
    description: 'Beschreibung',
    phases: [
      {
        id: 'phase-1',
        title: 'Phase 1',
        description: 'P1 desc',
        slots: [
          { id: 'slot-1', title: 'Slot 1', description: 'S1 desc' },
          { id: 'slot-2', title: 'Slot 2', description: null },
        ],
      },
      {
        id: 'phase-2',
        title: 'Phase 2',
        description: null,
        slots: [{ id: 'slot-3', title: 'Slot 3', description: null }],
      },
    ],
  };
}

describe('TRANSLATION_RUBRIC', () => {
  it('is a stable, non-empty string', () => {
    expect(typeof TRANSLATION_RUBRIC).toBe('string');
    expect(TRANSLATION_RUBRIC.length).toBeGreaterThan(100);
  });

  it('mentions the tool / JSON-only output rule (anti-prose anchor)', () => {
    expect(TRANSLATION_RUBRIC.toLowerCase()).toContain('tool call');
  });

  it('explicitly tells the model to preserve IDs', () => {
    expect(TRANSLATION_RUBRIC).toMatch(/preserve every source ID/i);
  });

  it('does NOT bake source / target language into the rubric (cache-stability invariant)', () => {
    // Rubric must be byte-identical across language pairs so the
    // prompt-cache key never drifts. Language pair lives in the payload
    // tail, not here.
    expect(TRANSLATION_RUBRIC).not.toMatch(/german|spanish|english|french/i);
  });
});

describe('T_ANTHROPIC_TOOL', () => {
  it('declares the strict structured-output schema', () => {
    expect(T_ANTHROPIC_TOOL.name).toBe('submit_path_translation');
    expect(T_ANTHROPIC_TOOL.input_schema.required).toEqual(['title', 'description', 'phases']);
  });
});

describe('T_GEMINI_SCHEMA', () => {
  it('mirrors the Anthropic schema shape', () => {
    expect(T_GEMINI_SCHEMA.required).toEqual(['title', 'description', 'phases']);
    const phaseItems = (T_GEMINI_SCHEMA as { properties: { phases: { items: { required: string[] } } } })
      .properties.phases.items;
    expect(phaseItems.required).toEqual(['id', 'title', 'description', 'slots']);
  });
});

describe('buildTranslationPayload', () => {
  it('includes source + target language and every translatable string', () => {
    const out = buildTranslationPayload(makeSnapshot());
    expect(out).toContain('source language: de');
    expect(out).toContain('target language: en');
    expect(out).toContain('title: Titel');
    expect(out).toContain('description: Beschreibung');
    expect(out).toContain('--- phase phase-1 ---');
    expect(out).toContain('title: Phase 1');
    expect(out).toContain('- slot slot-1');
    expect(out).toContain('title: Slot 1');
    expect(out).toContain('description: S1 desc');
  });

  it('emits empty string for null descriptions (no fabricated content)', () => {
    const snap = makeSnapshot();
    snap.description = null;
    const out = buildTranslationPayload(snap);
    expect(out).toContain('description: ');
    expect(out).not.toContain('description: null');
  });
});

describe('parseTranslationResponse', () => {
  it('returns a typed object on a valid response', () => {
    const parsed = parseTranslationResponse({
      title: 'Title',
      description: 'Description',
      phases: [
        {
          id: 'phase-1',
          title: 'Phase 1',
          description: '',
          slots: [
            { id: 'slot-1', title: 'Slot 1', description: 'S1' },
            { id: 'slot-2', title: 'Slot 2', description: '' },
          ],
        },
      ],
    });
    expect(parsed.title).toBe('Title');
    expect(parsed.phases[0].slots[1].description).toBeNull(); // empty → null
  });

  it('throws on missing title', () => {
    expect(() =>
      parseTranslationResponse({ title: '', description: '', phases: [] }),
    ).toThrow(/title missing or empty/);
  });

  it('throws on non-object input', () => {
    expect(() => parseTranslationResponse(null)).toThrow();
    expect(() => parseTranslationResponse('a string')).toThrow();
  });

  it('throws when phases is not an array', () => {
    expect(() =>
      parseTranslationResponse({ title: 't', description: 'd', phases: 'nope' }),
    ).toThrow(/phases is not an array/);
  });

  it('throws when a slot is missing its id (drift safety)', () => {
    expect(() =>
      parseTranslationResponse({
        title: 't',
        description: 'd',
        phases: [
          {
            id: 'phase-1',
            title: 'P1',
            description: '',
            slots: [{ title: 'no id', description: '' }],
          },
        ],
      }),
    ).toThrow(/slots\[0\]\.id missing/);
  });
});

describe('projectTranslationOnto', () => {
  it('re-keys model output by source IDs (positional independence)', () => {
    const source = makeSnapshot();
    // Model returns phases in a different order — projection re-keys
    // by source ID, so the persisted shape mirrors source order.
    const modelOut = {
      title: 'Title (en)',
      description: 'Desc (en)',
      phases: [
        {
          id: 'phase-2',
          title: 'Phase 2 (en)',
          description: null,
          slots: [{ id: 'slot-3', title: 'Slot 3 (en)', description: null }],
        },
        {
          id: 'phase-1',
          title: 'Phase 1 (en)',
          description: 'P1 desc (en)',
          slots: [
            { id: 'slot-1', title: 'Slot 1 (en)', description: 'S1 desc (en)' },
            { id: 'slot-2', title: 'Slot 2 (en)', description: null },
          ],
        },
      ],
    };
    const { payload, droppedPhaseIds, droppedSlotIds } = projectTranslationOnto(source, modelOut);
    expect(droppedPhaseIds).toEqual([]);
    expect(droppedSlotIds).toEqual([]);
    // Source order preserved: phase-1 first, phase-2 second.
    expect(payload.phases.map((p) => p.id)).toEqual(['phase-1', 'phase-2']);
    expect(payload.phases[0].title).toBe('Phase 1 (en)');
    expect(payload.phases[0].slots.map((s) => s.id)).toEqual(['slot-1', 'slot-2']);
    expect(payload.phases[0].slots[0].title).toBe('Slot 1 (en)');
  });

  it('falls through to source text when the model drops a phase ID', () => {
    const source = makeSnapshot();
    const modelOut = {
      title: 'Title (en)',
      description: null,
      phases: [
        {
          id: 'phase-1',
          title: 'Phase 1 (en)',
          description: 'P1 desc (en)',
          slots: [
            { id: 'slot-1', title: 'Slot 1 (en)', description: null },
            { id: 'slot-2', title: 'Slot 2 (en)', description: null },
          ],
        },
        // phase-2 dropped by the model
      ],
    };
    const { payload, droppedPhaseIds } = projectTranslationOnto(source, modelOut);
    expect(droppedPhaseIds).toEqual(['phase-2']);
    expect(payload.phases).toHaveLength(2);
    // phase-2 still in the output, but with source title (Phase 2),
    // not a translated one.
    expect(payload.phases[1].title).toBe('Phase 2');
    expect(payload.phases[1].slots[0].title).toBe('Slot 3');
  });

  it('falls through to source text when the model drops a slot ID', () => {
    const source = makeSnapshot();
    const modelOut = {
      title: 'Title (en)',
      description: null,
      phases: [
        {
          id: 'phase-1',
          title: 'Phase 1 (en)',
          description: null,
          slots: [
            { id: 'slot-1', title: 'Slot 1 (en)', description: null },
            // slot-2 dropped by the model
          ],
        },
        {
          id: 'phase-2',
          title: 'Phase 2 (en)',
          description: null,
          slots: [{ id: 'slot-3', title: 'Slot 3 (en)', description: null }],
        },
      ],
    };
    const { payload, droppedSlotIds } = projectTranslationOnto(source, modelOut);
    expect(droppedSlotIds).toEqual(['slot-2']);
    // slot-2 still in the persisted payload, with source title.
    const slot2 = payload.phases[0].slots.find((s) => s.id === 'slot-2');
    expect(slot2?.title).toBe('Slot 2');
  });
});
