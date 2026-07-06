// Figure-reuse (P3/P4/P5): the figure-enabled tool variants advertise an
// optional per-item `figure` property; the base chat tools must NOT — chat only
// offers figures when a source-image catalog is present (chat-stream.ts swaps
// the variant in), so a turn without imported images can never emit a `figure`
// the server would have to drop.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  FLASHCARD_TOOL,
  FLASHCARD_TOOL_WITH_FIGURES,
  QUIZ_TOOL_V2,
  QUIZ_TOOL_V2_WITH_FIGURES,
  QUIZ_FOR_SLOT_TOOL,
  FLASHCARDS_FOR_SLOT_TOOL,
  PATH_STRUCTURE_TOOL,
  CHAT_STUDY_PLAN_TOOL,
  STUDY_PLAN_TOOL,
} from './ai-tools';
import type { ToolDef } from './ai-tool-types';

// Drill into `input_schema.properties[arrayKey].items.properties` for a tool.
function itemProps(tool: ToolDef, arrayKey: string): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schema = tool.input_schema as any;
  return schema.properties[arrayKey].items.properties as Record<string, unknown>;
}

describe('figure-enabled tool variants', () => {
  it('base chat tools do NOT advertise a figure property', () => {
    expect(itemProps(FLASHCARD_TOOL, 'flashcards').figure).toBeUndefined();
    expect(itemProps(QUIZ_TOOL_V2, 'questions').figure).toBeUndefined();
  });

  it('chat figure variants advertise figure on each item', () => {
    const fc = itemProps(FLASHCARD_TOOL_WITH_FIGURES, 'flashcards').figure as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(fc).toBeDefined();
    expect(fc.required).toEqual(['imageRef', 'caption']);
    // Flashcard figures carry a `side`; quiz exhibits do not.
    expect(fc.properties).toHaveProperty('side');

    const q = itemProps(QUIZ_TOOL_V2_WITH_FIGURES, 'questions').figure as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(q).toBeDefined();
    expect(q.required).toEqual(['imageRef', 'caption']);
    expect(q.properties).not.toHaveProperty('side');
  });

  it('path slot tools advertise figure too (single-sourced from the base schema)', () => {
    expect(itemProps(QUIZ_FOR_SLOT_TOOL, 'questions').figure).toBeDefined();
    expect(itemProps(FLASHCARDS_FOR_SLOT_TOOL, 'flashcards').figure).toBeDefined();
  });

  it('variants keep the base tool name so chat tool-extraction is unchanged', () => {
    expect(FLASHCARD_TOOL_WITH_FIGURES.name).toBe(FLASHCARD_TOOL.name);
    expect(QUIZ_TOOL_V2_WITH_FIGURES.name).toBe(QUIZ_TOOL_V2.name);
  });
});

describe('CHAT_STUDY_PLAN_TOOL slim variant', () => {
   
  const phaseProps = (tool: typeof CHAT_STUDY_PLAN_TOOL) => {
    const schema = tool.input_schema as unknown as {
      properties: { phases: { items: { properties: Record<string, unknown> } } };
    };
    return schema.properties.phases.items.properties;
  };

  it('chat variant omits materials/referenceId (no inventory injected in chat)', () => {
    expect(phaseProps(CHAT_STUDY_PLAN_TOOL).materials).toBeUndefined();
    expect(phaseProps(CHAT_STUDY_PLAN_TOOL).gateStrategy).toBeUndefined();
  });

  it('full STUDY_PLAN_TOOL still has materials (used by path generator)', () => {
    expect(phaseProps(STUDY_PLAN_TOOL).materials).toBeDefined();
  });

  it('both variants share the same tool name', () => {
    expect(CHAT_STUDY_PLAN_TOOL.name).toBe(STUDY_PLAN_TOOL.name);
  });
});

// Weakness Training Phase 1A (WEAKNESS_TRAINING_CONCEPTS) — closed-enum
// concept tagging in the Stage A/B tool schemas. Off by default: the OFF
// assertions below run against the tools already imported at module-top
// (env unset in this test process), proving the default schemas carry no
// concept fields. The ON assertions re-import the module with the env var
// set via `vi.resetModules()`, since the gate is evaluated at module load.
describe('weakness training concept-tagging tool schema (WEAKNESS_TRAINING_CONCEPTS)', () => {
  const slotItemProps = (tool: ToolDef) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = tool.input_schema as any;
    return schema.properties.phases.items.properties.slots.items.properties as Record<
      string,
      unknown
    >;
  };

  it('OFF (flag unset): PATH_STRUCTURE_TOOL has no conceptCandidates, slot tools have no conceptKeys', () => {
    expect(process.env.WEAKNESS_TRAINING_CONCEPTS).not.toBe('1');
    expect(slotItemProps(PATH_STRUCTURE_TOOL).conceptCandidates).toBeUndefined();
    expect(itemProps(QUIZ_FOR_SLOT_TOOL, 'questions').conceptKeys).toBeUndefined();
    expect(itemProps(FLASHCARDS_FOR_SLOT_TOOL, 'flashcards').conceptKeys).toBeUndefined();
  });

  // Weakness Training Phase 4.2b (plan phase4 §12.1 tier 1, §12.7 "4.2b"):
  // `prerequisiteConceptRefs` rides the SAME flag/injection site as
  // `conceptCandidates` — this is the byte-identity invariant the plan's
  // acceptance criteria call out ("field omission never fails validation").
  // A dedicated OFF assertion here (mirroring the conceptCandidates one
  // above) proves the flag-off schema carries zero trace of the new field,
  // which is what keeps PATH_STRUCTURE_TOOL provably byte-identical to
  // PATH_STRUCTURE_TOOL_BASE and the Anthropic prompt-cache key stable.
  it('OFF (flag unset): PATH_STRUCTURE_TOOL has no prerequisiteConceptRefs', () => {
    expect(process.env.WEAKNESS_TRAINING_CONCEPTS).not.toBe('1');
    expect(slotItemProps(PATH_STRUCTURE_TOOL).prerequisiteConceptRefs).toBeUndefined();
  });

  describe('ON (WEAKNESS_TRAINING_CONCEPTS=1)', () => {
    const prevEnv = process.env.WEAKNESS_TRAINING_CONCEPTS;

    beforeEach(() => {
      process.env.WEAKNESS_TRAINING_CONCEPTS = '1';
      vi.resetModules();
    });

    afterEach(() => {
      if (prevEnv === undefined) delete process.env.WEAKNESS_TRAINING_CONCEPTS;
      else process.env.WEAKNESS_TRAINING_CONCEPTS = prevEnv;
      vi.resetModules();
    });

    it('PATH_STRUCTURE_TOOL advertises conceptCandidates per slot', async () => {
      const mod = await import('./ai-tools');
      expect(slotItemProps(mod.PATH_STRUCTURE_TOOL).conceptCandidates).toBeDefined();
    });

    it('PATH_STRUCTURE_TOOL advertises prerequisiteConceptRefs per slot (4.2b, capped at 2)', async () => {
      const mod = await import('./ai-tools');
      const prereq = slotItemProps(mod.PATH_STRUCTURE_TOOL).prerequisiteConceptRefs as {
        maxItems?: number;
        items?: { type?: string };
      };
      expect(prereq).toBeDefined();
      expect(prereq.maxItems).toBe(2);
      expect(prereq.items?.type).toBe('string');
    });

    it('QUIZ_FOR_SLOT_TOOL and FLASHCARDS_FOR_SLOT_TOOL advertise conceptKeys per item', async () => {
      const mod = await import('./ai-tools');
      expect(itemProps(mod.QUIZ_FOR_SLOT_TOOL, 'questions').conceptKeys).toBeDefined();
      expect(itemProps(mod.FLASHCARDS_FOR_SLOT_TOOL, 'flashcards').conceptKeys).toBeDefined();
    });

    it('chat-only tools (QUIZ_TOOL_V2, FLASHCARD_TOOL) never advertise conceptKeys, even with the flag on', async () => {
      const mod = await import('./ai-tools');
      expect(itemProps(mod.QUIZ_TOOL_V2, 'questions').conceptKeys).toBeUndefined();
      expect(itemProps(mod.FLASHCARD_TOOL, 'flashcards').conceptKeys).toBeUndefined();
    });
  });
});
