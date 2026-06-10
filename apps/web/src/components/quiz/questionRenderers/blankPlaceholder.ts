// Some AI-generated quiz prompts embed literal placeholder tokens where
// the answer should go:
//   • `{{BLANK}}` / `{BLANK}` / `[BLANK]` — used in fill_blank + translation
//   • `{{0}}` / `{{1}}` — word_bank's slot indices, sometimes also pasted
//     verbatim into the prompt header on top of being in `payload.template`
// MarkdownRenderer prints them verbatim, so the learner sees "France and
// {{BLANK}} formed" or "{{0}} and {{1}} competed" instead of a visual blank.
//
// `substituteBlankMarker` swaps every recognised placeholder for a run of
// escaped underscores (`\_\_\_\_\_\_\_` in markdown source → `_______`
// rendered). The backslash escapes guarantee markdown won't treat the
// underscores as emphasis delimiters regardless of surrounding punctuation.

const BLANK_TOKEN_REGEX = /(\{+\s*BLANK\s*\}+|\[+\s*BLANK\s*\]+|\{\{\s*\d+\s*\}\})/gi;
const RENDERED_BLANK = '\\_\\_\\_\\_\\_\\_\\_';

export function substituteBlankMarker(prompt: string): string {
  return prompt.replace(BLANK_TOKEN_REGEX, RENDERED_BLANK);
}
