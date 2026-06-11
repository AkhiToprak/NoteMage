/**
 * Hand-written JSON Schema for the DocModel, passed to Gemini as
 * `responseJsonSchema` so decoding is constrained to the contract — trailing
 * junk, duplicated objects, stray keys and mis-typed fields become
 * structurally impossible to emit.
 *
 * This is the GENERATION-side constraint only; `docModelSchema` (zod) in
 * doc-model.ts remains the validator and the source of truth. Kept in
 * Gemini's supported JSON-Schema subset on purpose: no $ref/$defs, recursion
 * flattened to two list-nesting levels (deeper nesting stays valid through
 * zod — the model just can't generate it, which real PDFs don't need).
 * Keep in sync with doc-model.ts when the block vocabulary changes.
 */

const RUN = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    bold: { type: 'boolean' },
    italic: { type: 'boolean' },
    underline: { type: 'boolean' },
    strike: { type: 'boolean' },
    code: { type: 'boolean' },
    highlight: { type: 'boolean' },
    subscript: { type: 'boolean' },
    superscript: { type: 'boolean' },
    link: { type: 'string' },
  },
  required: ['text'],
  additionalProperties: false,
} as const;

const RUNS = { type: 'array', items: RUN } as const;

const LIST_ITEM_LEAF = {
  type: 'object',
  properties: {
    runs: RUNS,
    checked: { type: 'boolean' },
  },
  required: ['runs'],
  additionalProperties: false,
} as const;

const CHILD_LIST = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['bulletList', 'orderedList', 'taskList'] },
    items: { type: 'array', items: LIST_ITEM_LEAF },
  },
  required: ['type', 'items'],
  additionalProperties: false,
} as const;

const LIST_ITEM = {
  type: 'object',
  properties: {
    runs: RUNS,
    checked: { type: 'boolean' },
    children: { type: 'array', items: CHILD_LIST },
  },
  required: ['runs'],
  additionalProperties: false,
} as const;

const LIST_BLOCK = (kind: 'bulletList' | 'orderedList' | 'taskList') =>
  ({
    type: 'object',
    properties: {
      type: { type: 'string', enum: [kind] },
      items: { type: 'array', items: LIST_ITEM },
    },
    required: ['type', 'items'],
    additionalProperties: false,
  }) as const;

const PARAGRAPH = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['paragraph'] },
    runs: RUNS,
  },
  required: ['type', 'runs'],
  additionalProperties: false,
} as const;

const CALLOUT_CHILD = {
  anyOf: [PARAGRAPH, LIST_BLOCK('bulletList'), LIST_BLOCK('orderedList'), LIST_BLOCK('taskList')],
} as const;

// PA-40j: bbox is intentionally unbounded (no minimum/maximum on values).
// The figure-crop rescale heuristic in cropFigure() depends on seeing
// out-of-range values (e.g. 0–1000 pixel coords) to detect and rescale them.
// normalizeImageBlock also applies its own [0,1] clamping only for the
// ≤1.2 case, letting larger values pass through for cropFigure to handle.
const BBOX = {
  type: 'array',
  items: { type: 'number' },
  minItems: 4,
  maxItems: 4,
} as const;

const BLOCK = {
  anyOf: [
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['heading'] },
        level: { type: 'integer', enum: [1, 2, 3] },
        runs: RUNS,
      },
      required: ['type', 'level', 'runs'],
      additionalProperties: false,
    },
    PARAGRAPH,
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['callout'] },
        variant: { type: 'string', enum: ['info', 'warning', 'success', 'tip', 'danger', 'note'] },
        children: { type: 'array', items: CALLOUT_CHILD },
      },
      required: ['type', 'variant', 'children'],
      additionalProperties: false,
    },
    LIST_BLOCK('bulletList'),
    LIST_BLOCK('orderedList'),
    LIST_BLOCK('taskList'),
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['table'] },
        headerRow: { type: 'boolean' },
        rows: { type: 'array', items: { type: 'array', items: RUNS } },
      },
      required: ['type', 'headerRow', 'rows'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['codeBlock'] },
        // PA-40f: lang is optional (nullable) — models that omit it get
        // normalize.ts defaulting it to null rather than triggering a repair.
        lang: { type: ['string', 'null'] },
        code: { type: 'string' },
      },
      required: ['type', 'code'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['blockquote'] },
        runs: RUNS,
      },
      required: ['type', 'runs'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['image'] },
        ref: { type: 'string' },
        bbox: BBOX,
        caption: RUNS,
        // P1 figure title — optional so constrained decoding never rejects.
        alt: { type: 'string' },
      },
      required: ['type', 'ref', 'bbox'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['math'] },
        latex: { type: 'string' },
        display: { type: 'boolean' },
        caption: RUNS,
      },
      required: ['type', 'latex', 'display'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['horizontalRule'] },
      },
      required: ['type'],
      additionalProperties: false,
    },
  ],
} as const;

/** The full response schema: `{"blocks": [ ...block... ]}`. */
export const DOC_MODEL_JSON_SCHEMA = {
  type: 'object',
  properties: {
    blocks: { type: 'array', items: BLOCK },
  },
  required: ['blocks'],
  additionalProperties: false,
} as const;
