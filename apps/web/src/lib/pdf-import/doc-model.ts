import { z } from 'zod';

const inlineRunSchema = z
  .object({
    text: z.string(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    strike: z.boolean().optional(),
    code: z.boolean().optional(),
    link: z.string().optional(),
  })
  .strict();

export type InlineRun = z.infer<typeof inlineRunSchema>;

const headingBlockSchema = z
  .object({
    type: z.literal('heading'),
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    runs: z.array(inlineRunSchema),
  })
  .strict();

const paragraphBlockSchema = z
  .object({
    type: z.literal('paragraph'),
    runs: z.array(inlineRunSchema),
  })
  .strict();

const bulletListBlockSchema = z
  .object({
    type: z.literal('bulletList'),
    items: z.array(z.object({ runs: z.array(inlineRunSchema) }).strict()),
  })
  .strict();

const orderedListBlockSchema = z
  .object({
    type: z.literal('orderedList'),
    items: z.array(z.object({ runs: z.array(inlineRunSchema) }).strict()),
  })
  .strict();

// Callout children are intentionally non-recursive (paragraph + lists only) so the block union stays a flat z.discriminatedUnion.
const calloutChildSchema = z.discriminatedUnion('type', [
  paragraphBlockSchema,
  bulletListBlockSchema,
  orderedListBlockSchema,
]);

const calloutBlockSchema = z
  .object({
    type: z.literal('callout'),
    variant: z.enum(['info', 'warning', 'success', 'tip']),
    children: z.array(calloutChildSchema),
  })
  .strict();

const tableBlockSchema = z
  .object({
    type: z.literal('table'),
    rows: z.array(z.array(z.array(inlineRunSchema))),
    headerRow: z.boolean(),
  })
  .strict();

const codeBlockSchema = z
  .object({
    type: z.literal('codeBlock'),
    lang: z.string().nullable(),
    code: z.string(),
  })
  .strict();

const blockquoteBlockSchema = z
  .object({
    type: z.literal('blockquote'),
    runs: z.array(inlineRunSchema),
  })
  .strict();

const imageBlockSchema = z
  .object({
    type: z.literal('image'),
    ref: z.string(),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  })
  .strict();

const horizontalRuleBlockSchema = z
  .object({
    type: z.literal('horizontalRule'),
  })
  .strict();

const docModelBlockSchema = z.discriminatedUnion('type', [
  headingBlockSchema,
  paragraphBlockSchema,
  calloutBlockSchema,
  bulletListBlockSchema,
  orderedListBlockSchema,
  tableBlockSchema,
  codeBlockSchema,
  blockquoteBlockSchema,
  imageBlockSchema,
  horizontalRuleBlockSchema,
]);

export type DocModelBlock = z.infer<typeof docModelBlockSchema>;

export const docModelSchema = z
  .object({
    blocks: z.array(docModelBlockSchema),
  })
  .strict();

export type DocModel = z.infer<typeof docModelSchema>;
