// Phase 10 — material corpus builder for path generation.
//
// Path generation used to feed the AI only material *titles*. This loads the
// actual text — page / document `textContent`, flashcard Q&A, quiz prompts —
// and renders it into one deterministic string that Stage A and every Stage B
// call share as a cached system block.

import { db } from './db';
import { MAX_CONTEXT_CHARS } from './anthropic';

export type MaterialKind = 'page' | 'document' | 'flashcard_set' | 'quiz_set';

export interface MaterialCorpusEntry {
  id: string;
  kind: MaterialKind;
  title: string;
  /**
   * The material's text — page/document body, or rendered Q&A for sets.
   * Null when a page or document has no extracted text yet.
   */
  content: string | null;
  /** Section title, for a page's header line. */
  sectionTitle?: string;
}

/**
 * Load the picked materials with their actual content, ownership-checked.
 * Returns `null` if any id is missing, duplicated, or not owned — the caller
 * treats that as a 400 (the AI must only ever see the user's own data).
 * Order follows `materialIds` so the rendered corpus is deterministic, which
 * the prompt cache depends on.
 */
export async function loadMaterialCorpus(
  userId: string,
  materialIds: string[],
): Promise<MaterialCorpusEntry[] | null> {
  if (materialIds.length === 0) return [];

  const [pages, documents, flashcardSets, quizSets] = await Promise.all([
    db.page.findMany({
      where: { id: { in: materialIds }, section: { notebook: { userId } } },
      select: {
        id: true,
        title: true,
        textContent: true,
        section: { select: { title: true } },
      },
    }),
    db.document.findMany({
      where: { id: { in: materialIds }, notebook: { userId } },
      select: { id: true, fileName: true, textContent: true },
    }),
    db.flashcardSet.findMany({
      where: { id: { in: materialIds }, userId },
      select: {
        id: true,
        title: true,
        flashcards: {
          select: { question: true, answer: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    }),
    db.quizSet.findMany({
      where: { id: { in: materialIds }, userId },
      select: {
        id: true,
        title: true,
        questions: {
          select: { question: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    }),
  ]);

  const byId = new Map<string, MaterialCorpusEntry>();
  for (const p of pages) {
    byId.set(p.id, {
      id: p.id,
      kind: 'page',
      title: p.title,
      content: p.textContent,
      sectionTitle: p.section?.title,
    });
  }
  for (const d of documents) {
    byId.set(d.id, {
      id: d.id,
      kind: 'document',
      title: d.fileName,
      content: d.textContent,
    });
  }
  for (const f of flashcardSets) {
    const rendered = f.flashcards
      .map((c, i) => `${i + 1}. Q: ${c.question}\n   A: ${c.answer}`)
      .join('\n');
    byId.set(f.id, {
      id: f.id,
      kind: 'flashcard_set',
      title: f.title,
      content: rendered.length > 0 ? rendered : null,
    });
  }
  for (const q of quizSets) {
    const rendered = q.questions.map((qq, i) => `${i + 1}. ${qq.question}`).join('\n');
    byId.set(q.id, {
      id: q.id,
      kind: 'quiz_set',
      title: q.title,
      content: rendered.length > 0 ? rendered : null,
    });
  }

  // Every id must resolve to exactly one owned material — a mismatch means an
  // unowned, unknown, or duplicated id slipped in.
  if (byId.size !== materialIds.length) return null;

  const ordered: MaterialCorpusEntry[] = [];
  for (const id of materialIds) {
    const entry = byId.get(id);
    if (entry) ordered.push(entry);
  }
  return ordered;
}

const KIND_LABELS: Record<MaterialKind, string> = {
  page: 'Page',
  document: 'Document',
  flashcard_set: 'Flashcard set',
  quiz_set: 'Quiz set',
};

const EMPTY_BODY = '(no extracted text available — only the title is known)';

/**
 * Render loaded materials into one corpus string for the AI. Bodies are
 * trimmed with a fair-share water-fill so the total stays within
 * MAX_CONTEXT_CHARS and one huge document can't crowd out small pages.
 * Deterministic given the same entries — required for prompt-cache hits.
 */
export function renderMaterialCorpus(entries: MaterialCorpusEntry[]): string {
  if (entries.length === 0) return '';

  const bodies = entries.map((e) => {
    const text = e.content?.trim();
    return text && text.length > 0 ? text : EMPTY_BODY;
  });
  const budgets = allocateBudget(
    bodies.map((b) => b.length),
    MAX_CONTEXT_CHARS,
  );

  const blocks = entries.map((e, i) => {
    const label = KIND_LABELS[e.kind];
    const where = e.sectionTitle ? ` (section: ${e.sectionTitle})` : '';
    const header = `### ${label}: "${e.title}"${where}`;
    let body = bodies[i];
    if (body.length > budgets[i]) {
      body = `${body.slice(0, budgets[i]).trimEnd()}\n… [content truncated to fit]`;
    }
    return `${header}\n${body}`;
  });

  return blocks.join('\n\n');
}

/**
 * Water-fill `total` chars across items by ascending length: short items take
 * only what they need, leaving more for long ones; whatever remains is split
 * evenly among the longest. Returns a per-item char budget aligned with the
 * input order.
 */
function allocateBudget(lengths: number[], total: number): number[] {
  const result = new Array<number>(lengths.length).fill(0);
  const ascending = lengths
    .map((len, i) => ({ len, i }))
    .sort((a, b) => a.len - b.len);
  let remaining = total;
  let left = ascending.length;
  for (const { len, i } of ascending) {
    const share = left > 0 ? Math.floor(remaining / left) : 0;
    const give = Math.min(len, share);
    result[i] = give;
    remaining -= give;
    left -= 1;
  }
  return result;
}
