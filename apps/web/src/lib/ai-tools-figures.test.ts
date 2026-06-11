// Figure-reuse (P3/P4/P5): the figure-enabled tool variants advertise an
// optional per-item `figure` property; the base chat tools must NOT — chat only
// offers figures when a source-image catalog is present (chat-stream.ts swaps
// the variant in), so a turn without imported images can never emit a `figure`
// the server would have to drop.

import { describe, it, expect } from 'vitest';
import {
  FLASHCARD_TOOL,
  FLASHCARD_TOOL_WITH_FIGURES,
  QUIZ_TOOL_V2,
  QUIZ_TOOL_V2_WITH_FIGURES,
  QUIZ_FOR_SLOT_TOOL,
  FLASHCARDS_FOR_SLOT_TOOL,
  CHAT_STUDY_PLAN_TOOL,
  STUDY_PLAN_TOOL,
} from './ai-tools';
import type Anthropic from '@anthropic-ai/sdk';

// Drill into `input_schema.properties[arrayKey].items.properties` for a tool.
function itemProps(tool: Anthropic.Messages.Tool, arrayKey: string): Record<string, unknown> {
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
    const schema = tool.input_schema as {
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
