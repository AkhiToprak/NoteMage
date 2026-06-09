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
(The ONE exception is the "latex" field of a math block — see Math below.)

## What to read from the image
Use the image ONLY to decide:
- Block type: heading, paragraph, list, task list, table, callout, code block,
  quote, rule, figure, equation.
- Heading level: by relative visual size — the largest headings are level 1.
- Inline emphasis: which spans are bold, italic, underlined, struck through,
  highlighted, inline code, subscript or superscript. Mark EVERY span that is
  visually bold with "bold":true — bold words mid-sentence, bold lead-in terms,
  bold lines — do not skip emphasis just because the block type is plain.
- List nesting and checkbox state.
- Figure regions: where diagrams, charts, photos or screenshots sit.

## What to SKIP
Do NOT emit running page headers and footers — the repeated lines in the top or
bottom margin of every page (a running title, a document name, a page number
like "Page 3" or "3 / 8"). They are page chrome, not content.

## Output format
Return ONLY a JSON object: {"blocks": [ ...blocks... ]}.
No prose, no explanation, no markdown code fences. A blank page returns {"blocks": []}.

Each block is exactly one of:
- {"type":"heading","level":1|2|3,"runs":[run,...]}
- {"type":"paragraph","runs":[run,...]}
- {"type":"bulletList","items":[item,...]}
- {"type":"orderedList","items":[item,...]}
- {"type":"taskList","items":[item,...]}        (checkbox list)
- {"type":"callout","variant":"info"|"warning"|"success"|"tip"|"danger"|"note","children":[block,...]}
    callout children may ONLY be paragraph, bulletList, orderedList or taskList
    blocks — never a heading, table, callout, code block, image, equation or rule.
- {"type":"table","headerRow":true|false,"rows":[ [ [run,...], ...cells ], ...rows ]}
    "rows" is a 3-level array: rows -> cells -> runs.
- {"type":"codeBlock","lang":"python"|null,"code":"..."}
- {"type":"blockquote","runs":[run,...]}
    one blockquote block per LINE of a quote box — see Blockquotes below.
- {"type":"image","ref":"...","bbox":[x0,y0,x1,y1]}
    plus an optional "caption" key — see Figures below.
- {"type":"math","latex":"...","display":true|false}
    plus an optional "caption" key — see Math below.
- {"type":"horizontalRule"}

### Runs (inline spans)
A "run" is: {"text":"...", "bold"?:true, "italic"?:true, "underline"?:true,
"strike"?:true, "code"?:true, "highlight"?:true, "subscript"?:true,
"superscript"?:true, "link"?:"https://..."}.
Only include a mark key when it is true. Use multiple runs in one block when
the emphasis changes mid-line; otherwise use a single run.
- "highlight": text with a coloured highlighter background.
- "subscript" / "superscript": characters set below / above the baseline —
  chemical subscripts (the "2" in H2O, CO2), exponents (the "2" in mc2, a2+b2),
  index variables (the "i" in xi), and footnote reference markers.

### Lists and nesting
Every list "item" is {"runs":[run,...], "checked"?:true|false, "children"?:[list,...]}.
- A sub-list indented under an item goes in that item's "children" array (a
  bulletList / orderedList / taskList). Nest to match the visual indentation.
- For a taskList, set "checked" per item from its box: a ticked box
  is "checked":true; an empty box is "checked":false. Do NOT keep the
  box glyph in the text — the checkbox is rendered from "checked".
  Ticked boxes look like ☑ ✓ ✔ [x]; empty boxes look like ☐ □ [ ].

### Callouts / admonitions
A callout is a coloured box (often with a left border and an icon). Pick the
"variant" from its colour/label: info (blue), tip (green/teal), warning
(orange/amber), danger (red), note (purple/neutral), success (green check).
If the callout's first line is just its label word (Info, Tip, Warning, Danger,
Note, Success) repeating the variant, DROP that label line — the box renders its
own icon. Keep only the body text as the callout's children.

### Blockquotes
A quotation box (indented or bar-marked) is a sequence of blockquote blocks:
emit ONE blockquote block per visual line — the quote text is one block, an
attribution line ("— Author") is the next. Consecutive blockquote blocks are
rendered together as a single quote box.

### Math / equations
A standalone rendered mathematical formula or equation (even one shown as an
image) is a "math" block, NOT an "image". Transcribe it to LaTeX in "latex"
(e.g. "x = \\\\frac{-b \\\\pm \\\\sqrt{b^2 - 4ac}}{2a}"); set "display":true for
a centred standalone equation, "display":false for one sitting inline in a line
of text. This is the only place you write text that is not copied verbatim. A
short caption under the equation goes in "caption", an array of runs, e.g.
"caption":[{"text":"Figure 3 — The quadratic formula."}].
Charts, graphs, diagrams, photos and banners are NEVER math blocks — they are
"image" figures. Simple sub/superscripts inside running prose (H2O, mc2) stay
as runs with the "subscript"/"superscript" marks — they are NOT math blocks.

### Figures
Emit an "image" block for every figure, diagram, chart, photo or screenshot.
A chart, graph, flow/tree diagram, map or infographic is ONE figure: emit a
single "image" block for the whole figure region. Do NOT transcribe the text
inside such a figure — axis labels, legends, node labels, data values — as
paragraphs, lists or tables. That text belongs to the figure and is kept by
the image itself. A figure often sits in a tinted box with a coloured title
bar; box the entire container, title bar included.
- "ref" MUST be exactly the id given to you in the user message for that
  figure slot (a string like "p3-fig-1"). Number figures in reading order.
- "bbox" is [x0, y0, x1, y1], each a DECIMAL FRACTION from 0 to 1 of the page
  width or height, with the origin at the TOP-LEFT corner — e.g.
  [0.08, 0.31, 0.92, 0.64]. Never pixel coordinates, never percentages.
- A caption line under the figure ("Figure 1 — …") goes in the image block's
  "caption" key — an array of runs, e.g.
  "caption":[{"text":"Figure 1 — Weekly study time."}] — NOT a separate
  paragraph. Omit the key when the figure has no caption.

### Definition lists
For a term/definition list (a short bold term with its definition below or
beside it), emit each term as its own paragraph whose single run is marked
"bold":true, immediately followed by a normal paragraph holding its
definition. Example:
{"type":"paragraph","runs":[{"text":"Note","bold":true}]},
{"type":"paragraph","runs":[{"text":"An atomic unit of study material."}]}

### Footnotes
Keep a footnote reference marker in the body as a run with "superscript":true.
Place the footnote text itself at the end, after a {"type":"horizontalRule"},
as a paragraph (lead its marker number as a superscript run).

## Strictness
The JSON is validated against a strict schema. Do not add keys beyond those
listed above. "level" is only 1, 2 or 3. "variant" is only info, warning,
success, tip, danger or note. Output the JSON object and nothing else.

## Example
A page with a title, a sentence mixing emphasis, a checkbox list, a two-line
quotation, and an equation:
{"blocks":[
  {"type":"heading","level":1,"runs":[{"text":"Reactions"}]},
  {"type":"paragraph","runs":[{"text":"Water is "},{"text":"H"},{"text":"2","subscript":true},{"text":"O — see "},{"text":"this note","highlight":true},{"text":"."}]},
  {"type":"taskList","items":[
    {"runs":[{"text":"Balance the equation"}],"checked":true},
    {"runs":[{"text":"Check the units"}],"checked":false}
  ]},
  {"type":"blockquote","runs":[{"text":"Nothing in life is to be feared, it is only to be understood.","italic":true}]},
  {"type":"blockquote","runs":[{"text":"— Marie Curie"}]},
  {"type":"math","latex":"E = mc^2","display":true,"caption":[{"text":"Mass–energy equivalence."}]}
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
  const chromeNote =
    `Skip the running page header/footer — repeated margin lines such as a ` +
    `document title or "Page ${pageNumber}" — do not emit them as blocks.`;

  if (isScanned) {
    return [
      `PDF page ${pageNumber}. This page has NO extractable text layer — it is`,
      `scanned or image-only. Transcribe the visible text from the image as`,
      `accurately as you can, and assign structure as you transcribe. Preserve`,
      `the wording exactly as shown; do not paraphrase.`,
      ``,
      figureNote,
      chromeNote,
    ].join('\n');
  }

  return [
    `PDF page ${pageNumber}. Below is the EXACT text layer of this page. Use`,
    `these strings verbatim for every "text" value. Read the image only to`,
    `assign structure (headings, lists, tables, callouts) and inline emphasis.`,
    ``,
    figureNote,
    chromeNote,
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
