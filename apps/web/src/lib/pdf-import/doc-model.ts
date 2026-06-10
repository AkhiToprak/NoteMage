import { z } from 'zod';

const inlineRunSchema = z
  .object({
    text: z.string(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    strike: z.boolean().optional(),
    code: z.boolean().optional(),
    highlight: z.boolean().optional(),
    subscript: z.boolean().optional(),
    superscript: z.boolean().optional(),
    link: z.string().optional(),
  })
  .strict();

export type InlineRun = z.infer<typeof inlineRunSchema>;

// Lists nest to any depth, so a list item carries its own runs plus optional
// child lists. Three list kinds share one item shape — `checked` is read only
// for task lists, ignored elsewhere. The recursion is expressed with `z.lazy`
// (a discriminated union member can't self-reference directly), and the TS
// types are declared by hand because zod can't infer a recursive schema.
export type ListContainerBlock =
  | { type: 'bulletList'; items: ListItem[] }
  | { type: 'orderedList'; items: ListItem[] }
  | { type: 'taskList'; items: ListItem[] };

export interface ListItem {
  runs: InlineRun[];
  /** Checkbox state — meaningful only inside a task list. */
  checked?: boolean;
  /** Nested sub-lists, indented one level under this item. */
  children?: ListContainerBlock[];
}

const listItemSchema: z.ZodType<ListItem> = z.lazy(() =>
  z
    .object({
      runs: z.array(inlineRunSchema),
      checked: z.boolean().optional(),
      children: z.array(listContainerSchema).optional(),
    })
    .strict(),
);

const bulletListBlockSchema = z
  .object({
    type: z.literal('bulletList'),
    items: z.array(listItemSchema),
  })
  .strict();

const orderedListBlockSchema = z
  .object({
    type: z.literal('orderedList'),
    items: z.array(listItemSchema),
  })
  .strict();

const taskListBlockSchema = z
  .object({
    type: z.literal('taskList'),
    items: z.array(listItemSchema),
  })
  .strict();

const listContainerSchema = z.discriminatedUnion('type', [
  bulletListBlockSchema,
  orderedListBlockSchema,
  taskListBlockSchema,
]);

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

// Callout children stay a flat, non-recursive subset (paragraph + the three
// list kinds) so the block union remains a simple z.discriminatedUnion. Nested
// lists are still reachable inside a callout via a list block's own children.
const calloutChildSchema = z.discriminatedUnion('type', [
  paragraphBlockSchema,
  bulletListBlockSchema,
  orderedListBlockSchema,
  taskListBlockSchema,
]);

const calloutBlockSchema = z
  .object({
    type: z.literal('callout'),
    variant: z.enum(['info', 'warning', 'success', 'tip', 'danger', 'note']),
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
    /** Optional figure caption rendered as an italic line beneath the image. */
    caption: z.array(inlineRunSchema).optional(),
  })
  .strict();

// A rendered formula/equation, transcribed to LaTeX from the page image. The
// one place the verbatim-text rule is relaxed: equations have no reliable text
// layer, so the model writes LaTeX rather than copying source characters.
const mathBlockSchema = z
  .object({
    type: z.literal('math'),
    latex: z.string(),
    /** Display (block) math when true; inline when false. */
    display: z.boolean(),
    /** Optional caption rendered as an italic line beneath the equation. */
    caption: z.array(inlineRunSchema).optional(),
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
  taskListBlockSchema,
  tableBlockSchema,
  codeBlockSchema,
  blockquoteBlockSchema,
  imageBlockSchema,
  mathBlockSchema,
  horizontalRuleBlockSchema,
]);

export type DocModelBlock = z.infer<typeof docModelBlockSchema>;

export const docModelSchema = z
  .object({
    blocks: z.array(docModelBlockSchema),
  })
  .strict();

export type DocModel = z.infer<typeof docModelSchema>;
