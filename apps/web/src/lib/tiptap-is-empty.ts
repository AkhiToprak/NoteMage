/**
 * Empty-document detection for TipTap docs.
 *
 * Context: the page autosave pipeline (PUT /api/notebooks/[id]/pages/[pageId])
 * accepts any JSON object as page content. An unhydrated or transiently-reset
 * TipTap editor serialises to the default empty doc
 *
 *   { type: 'doc', content: [{ type: 'paragraph' }] }
 *
 * which is a perfectly valid object, passes all schema validation, and will
 * happily overwrite a non-empty page on save. We've seen this happen in the
 * wild — a cowork session participant lost an entire page of notes because
 * something in the editor fired `onUpdate` with a blank doc.
 *
 * `isDefaultEmptyTiptapDoc` returns true for the *exact* auto-default state
 * (one empty paragraph) and nothing else. It deliberately does NOT try to
 * match every possible "visually empty" document — a user who deliberately
 * added whitespace or blank headings is not the target of this guard.
 *
 * The API layer uses this to refuse PUTs that would replace non-empty
 * content with the default empty doc. The client uses it as a cheap sanity
 * check before even making the request.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export function isDefaultEmptyTiptapDoc(content: unknown): boolean {
  if (!content || typeof content !== 'object') return false;
  const doc = content as any;
  if (doc.type !== 'doc') return false;
  if (!Array.isArray(doc.content)) {
    // `{ type: 'doc' }` with no content key at all — also the empty default.
    return doc.content === undefined;
  }
  if (doc.content.length !== 1) return false;

  const child = doc.content[0];
  if (!child || typeof child !== 'object') return false;
  if (child.type !== 'paragraph') return false;

  // An empty paragraph is either `{ type: 'paragraph' }` (no content key)
  // or `{ type: 'paragraph', content: [] }`. Anything else is content.
  if ('content' in child) {
    return Array.isArray(child.content) && child.content.length === 0;
  }
  return true;
}

/**
 * Same check, but more permissive — also treats documents that are nothing
 * but empty paragraphs / empty text nodes as empty. Used by the API guard
 * to catch near-empty variants that still mean "nothing was typed here".
 */
export function isEffectivelyEmptyTiptapDoc(content: unknown): boolean {
  if (!content || typeof content !== 'object') return false;
  const doc = content as any;
  if (doc.type !== 'doc') return false;
  if (!Array.isArray(doc.content)) return doc.content === undefined;

  // Walk every descendant. If any text node carries non-whitespace, or any
  // non-container node type appears (image, code block, table, callout,
  // toggle heading, horizontal rule, etc.), it's not empty.
  const CONTAINERS = new Set(['doc', 'paragraph', 'text']);

  const walk = (node: any): boolean => {
    if (!node || typeof node !== 'object') return true;
    if (node.type === 'text') {
      return typeof node.text !== 'string' || node.text.trim().length === 0;
    }
    if (node.type && !CONTAINERS.has(node.type)) {
      // A heading, image, list, table, code block — any structured node
      // means the doc is not empty.
      return false;
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        if (!walk(child)) return false;
      }
    }
    return true;
  };

  return walk(doc);
}
