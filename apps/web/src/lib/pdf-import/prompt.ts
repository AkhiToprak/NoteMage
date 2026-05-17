/**
 * Engine-agnostic prompt for the PDF structure pass. Every engine shares
 * these strings, so the LLM contract lives in exactly one place.
 *
 * The contract: given a rendered page image and (usually) the page's exact
 * text layer, the model returns a JSON DocModel — it classifies STRUCTURE
 * and inline emphasis, and copies all text verbatim from the supplied text.
 */

/** Format a figure reference id for page `pageNumber`; `index` is 1-based. */
export function imageRef(pageNumber: number, index: number): string {
  return `p${pageNumber}-fig-${index}`;
}

export const STRUCTURE_SYSTEM_PROMPT = `You convert ONE page of a PDF into a structured list of content blocks.

You are given:
1. A rendered image of the page.
2. Usually, the page's exact text layer, line by line.

## Most important rule: use text VERBATIM
Every "text" value you output MUST be copied character-for-character from the
supplied page text. Never paraphrase, never summarise, never invent, never
re-order words, never correct spelling or punctuation, never translate. You
are classifying structure — you are NOT authoring or editing text. When the
page text is supplied, every "text" value must come from it.

## What to read from the image
Use the image ONLY to decide:
- Block type: heading, paragraph, list, table, callout, code block, quote, rule, figure.
- Heading level: by relative visual size — the largest headings are level 1.
- Inline emphasis: which spans of text are bold, italic, underlined, struck through, or inline code.
- Figure regions: where diagrams, charts, photos or screenshots sit.

## Output format
Return ONLY a JSON object: {"blocks": [ ...blocks... ]}.
No prose, no explanation, no markdown code fences. A blank page returns {"blocks": []}.

Each block is exactly one of:
- {"type":"heading","level":1|2|3,"runs":[run,...]}
- {"type":"paragraph","runs":[run,...]}
- {"type":"bulletList","items":[{"runs":[run,...]},...]}
- {"type":"orderedList","items":[{"runs":[run,...]},...]}
- {"type":"callout","variant":"info"|"warning"|"success"|"tip","children":[block,...]}
    callout children may ONLY be paragraph, bulletList or orderedList blocks —
    never a heading, table, callout, code block, image or rule.
- {"type":"table","headerRow":true|false,"rows":[ [ [run,...], ...cells ], ...rows ]}
    "rows" is a 3-level array: rows -> cells -> runs.
- {"type":"codeBlock","lang":"python"|null,"code":"..."}
- {"type":"blockquote","runs":[run,...]}
- {"type":"image","ref":"...","bbox":[x0,y0,x1,y1]}
- {"type":"horizontalRule"}

A "run" is an inline span: {"text":"...", "bold"?:true, "italic"?:true,
"underline"?:true, "strike"?:true, "code"?:true, "link"?:"https://..."}.
Only include a mark key when it is true. Use multiple runs in one block when
the emphasis changes mid-line; otherwise use a single run.

## Figures
Emit an "image" block for every figure, diagram, chart, photo or screenshot.
- "ref" MUST be exactly the id given to you in the user message for that
  figure slot (a string like "p3-fig-1"). Number figures in reading order.
- "bbox" is [x0, y0, x1, y1], each a fraction from 0 to 1 of the page width
  or height, with the origin at the TOP-LEFT corner.

## Strictness
The JSON is validated against a strict schema. Do not add keys beyond those
listed above. "level" is only 1, 2 or 3. "variant" is only info, warning,
success or tip. Output the JSON object and nothing else.

## Example
A page with a large title, a sentence containing one bold word, and two bullets:
{"blocks":[
  {"type":"heading","level":1,"runs":[{"text":"Photosynthesis"}]},
  {"type":"paragraph","runs":[{"text":"Plants convert "},{"text":"light","bold":true},{"text":" into energy."}]},
  {"type":"bulletList","items":[
    {"runs":[{"text":"Occurs in chloroplasts"}]},
    {"runs":[{"text":"Produces glucose"}]}
  ]}
]}`;

export interface PageUserTextInput {
  groundTruthText: string;
  isScanned: boolean;
  pageNumber: number;
}

/**
 * The per-page user message. A page with a text layer embeds that text
 * verbatim for the model to copy; a scanned page instructs transcription
 * from the image instead, since there is no text layer to anchor to.
 */
export function buildPageUserText(input: PageUserTextInput): string {
  const { groundTruthText, isScanned, pageNumber } = input;
  const figureNote =
    `Number any figures on this page in reading order, naming their refs ` +
    `"${imageRef(pageNumber, 1)}", "${imageRef(pageNumber, 2)}", and so on.`;

  if (isScanned) {
    return [
      `PDF page ${pageNumber}. This page has NO extractable text layer — it is`,
      `scanned or image-only. Transcribe the visible text from the image as`,
      `accurately as you can, and assign structure as you transcribe. Preserve`,
      `the wording exactly as shown; do not paraphrase.`,
      ``,
      figureNote,
    ].join('\n');
  }

  return [
    `PDF page ${pageNumber}. Below is the EXACT text layer of this page. Use`,
    `these strings verbatim for every "text" value. Read the image only to`,
    `assign structure (headings, lists, tables, callouts) and inline emphasis.`,
    ``,
    figureNote,
    ``,
    `--- PAGE TEXT (verbatim) ---`,
    groundTruthText,
    `--- END PAGE TEXT ---`,
  ].join('\n');
}

/** Instruction appended to the repair retry after a schema-validation failure. */
export function buildRepairSuffix(zodErrorText: string): string {
  return [
    ``,
    `Your previous response failed strict JSON-schema validation:`,
    ``,
    zodErrorText,
    ``,
    `Return a corrected response. Output ONLY the JSON object {"blocks":[...]} —`,
    `no code fences, no prose. Keep every "text" value exactly as in the page text.`,
  ].join('\n');
}
