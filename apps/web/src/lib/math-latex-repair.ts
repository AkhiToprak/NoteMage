// Repairs LaTeX whose backslash-commands were destroyed by JSON-escape
// collapse in LLM tool output.
//
// When a model (notably Gemini in schemaless JSON mode) emits math like
// "$6\text{CO}_2 \rightarrow ...$" with SINGLE backslashes inside JSON tool
// arguments, the JSON parser interprets the invalid escapes as the control
// characters they name (\t -> U+0009, \r -> U+000D, \f -> U+000C,
// \v -> U+000B, \b -> U+0008, \n -> U+000A), so the stored string becomes
// "6<TAB>ext{CO}_2 <CR>ightarrow ...". KaTeX then renders the literal letters
// ("ext", "ightarrow"). This restores the backslash + leading letter so the
// command parses again.
//
// Properly double-escaped LaTeX ("\\text") survives JSON intact (no control
// char) and is left untouched, so this is a safe no-op on healthy input.
//
// Implemented with charCode scanning (no control-char regex literals) so the
// source file stays plain ASCII.

const TAB = 0x09;
const LF = 0x0a;
const VT = 0x0b;
const FF = 0x0c;
const CR = 0x0d;
const BS = 0x08;

// charCode -> the backslash-command prefix it was collapsed from.
const CONTROL_TO_COMMAND: Record<number, string> = {
  [BS]: '\\b', // \beta \begin \boxed \bar ...
  [TAB]: '\\t', // \text \times \theta \tau \to \triangle ...
  [VT]: '\\v', // \vec \varphi \vee ...
  [FF]: '\\f', // \frac \forall \phi ...
  [CR]: '\\r', // \rightarrow \rho \Rightarrow ...
};

function isLetter(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isControl(code: number): boolean {
  return code === BS || code === TAB || code === LF || code === VT || code === FF || code === CR;
}

/** True if the string shows signs of JSON-escape-collapsed LaTeX. */
export function looksLikeCorruptedLatex(latex: string): boolean {
  if (!latex) return false;
  for (let i = 0; i < latex.length; i++) {
    if (isControl(latex.charCodeAt(i))) return true;
  }
  return false;
}

/**
 * Restore backslash-commands in a LaTeX string corrupted by JSON-escape
 * collapse. No-op when the input contains no control characters.
 */
export function repairMathLatex(latex: string): string {
  if (!latex || !looksLikeCorruptedLatex(latex)) return latex;
  let out = '';
  for (let i = 0; i < latex.length; i++) {
    const code = latex.charCodeAt(i);
    const hard = CONTROL_TO_COMMAND[code];
    if (hard !== undefined) {
      // BS, TAB, VT, FF, CR -- unambiguous; never legitimate in LaTeX source.
      out += hard;
    } else if (code === LF) {
      // LF is ambiguous (can be a genuine line break in display math); only
      // restore it when followed by a letter, indicating a collapsed command
      // such as \nabla / \neq / \nu rather than real formatting.
      out += isLetter(latex.charCodeAt(i + 1)) ? '\\n' : latex[i];
    } else {
      out += latex[i];
    }
  }
  return out;
}
