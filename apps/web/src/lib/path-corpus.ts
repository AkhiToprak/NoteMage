// Phase 10 — material corpus builder for path generation.
//
// Path generation used to feed the AI only material *titles*. This loads the
// actual text — page / document `textContent`, flashcard Q&A, quiz prompts —
// and renders it into one deterministic string that Stage A and every Stage B
// call share as a cached system block.

import { db } from './db';
import { type MaterialCorpusEntry, type MaterialKind, corpusBudget } from './path-corpus-fit';

// Re-export the corpus types so existing `@/lib/path-corpus` consumers keep
// working — the shapes now live in the pure, client-safe fit module
// (path-corpus-fit.ts) alongside the water-fill math and cap constants.
export type { MaterialCorpusEntry, MaterialKind } from './path-corpus-fit';

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
        // Phase D — 1-based source page for citation provenance (null unless the
        // page was PDF-imported). Surfaced to the quiz model as a "[page N]" marker.
        sourceDocPage: true,
        section: { select: { title: true, notebookId: true } },
      },
    }),
    db.document.findMany({
      where: { id: { in: materialIds }, notebook: { userId } },
      select: { id: true, fileName: true, textContent: true, notebookId: true },
    }),
    db.flashcardSet.findMany({
      where: { id: { in: materialIds }, userId },
      select: {
        id: true,
        title: true,
        notebookId: true,
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
        notebookId: true,
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
      pageNumber: p.sourceDocPage ?? null,
      notebookId: p.section?.notebookId ?? null,
    });
  }
  for (const d of documents) {
    byId.set(d.id, {
      id: d.id,
      kind: 'document',
      title: d.fileName,
      content: d.textContent,
      notebookId: d.notebookId,
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
      notebookId: f.notebookId,
    });
  }
  for (const q of quizSets) {
    const rendered = q.questions.map((qq, i) => `${i + 1}. ${qq.question}`).join('\n');
    byId.set(q.id, {
      id: q.id,
      kind: 'quiz_set',
      title: q.title,
      content: rendered.length > 0 ? rendered : null,
      notebookId: q.notebookId,
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

/**
 * Render loaded materials into one corpus string for the AI. Bodies are
 * trimmed with a fair-share water-fill (see corpusBudget) so the total stays
 * within `cap` and one huge document can't crowd out small pages. The cap is
 * path-type specific — pass `pathContentCap(ultra)`. Deterministic given the
 * same entries + cap — required for prompt-cache hits.
 */
export function renderMaterialCorpus(entries: MaterialCorpusEntry[], cap: number): string {
  if (entries.length === 0) return '';

  const { bodies, budgets } = corpusBudget(entries, cap);

  const blocks = entries.map((e, i) => {
    const label = KIND_LABELS[e.kind];
    const where = e.sectionTitle ? ` (section: ${e.sectionTitle})` : '';
    // Phase D — append a "[page N]" marker when the material carries a source
    // page, so the quiz model can cite it verbatim as a question's source.page.
    const pageMark = e.pageNumber != null ? ` [page ${e.pageNumber}]` : '';
    const header = `### ${label}: "${e.title}"${where}${pageMark}`;
    let body = bodies[i];
    if (body.length > budgets[i]) {
      body = `${body.slice(0, budgets[i]).trimEnd()}\n… [content truncated to fit]`;
    }
    return `${header}\n${body}`;
  });

  return blocks.join('\n\n');
}
