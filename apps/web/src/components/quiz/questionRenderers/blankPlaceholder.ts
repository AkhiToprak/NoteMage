// Some AI-generated fill_blank / translation prompts embed a literal
// placeholder token like `{{BLANK}}` (or `{BLANK}` / `[BLANK]` / etc.)
// where the answer should go. The prompt is rendered through
// MarkdownRenderer, which has no notion of those tokens and prints them
// verbatim — so the learner sees "France and {{BLANK}} formed" instead
// of a visual blank.
//
// `substituteBlankMarker` swaps every recognised placeholder for a run
// of escaped underscores (`\_\_\_\_\_\_\_` in markdown source →
// `_______` rendered). Backslash-escape guarantees markdown won't treat
// the underscores as emphasis delimiters regardless of surrounding
// punctuation.

const BLANK_TOKEN_REGEX = /(\{+\s*BLANK\s*\}+|\[+\s*BLANK\s*\]+)/gi;
const RENDERED_BLANK = '\\_\\_\\_\\_\\_\\_\\_';

export function substituteBlankMarker(prompt: string): string {
  return prompt.replace(BLANK_TOKEN_REGEX, RENDERED_BLANK);
}
