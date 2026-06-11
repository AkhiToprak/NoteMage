// Source-image catalog for path theory generation (theory-visuals feature).
//
// Path generation is text-only: the theory model never "sees" the images in
// the learner's materials. To let it embed a relevant figure into a slot, we
// (1) load the PageImage rows for the picked materials, (2) caption any that
// aren't captioned yet with ONE batched vision call (cached on the row so each
// image is captioned at most once, ever), and (3) render a deterministic text
// catalog the theory prompt appends to its cached system block. The model
// then references images by `imageRef` (= PageImage.id) via the optional
// `figures` field.
//
// The captioning core (captionMissing + the shared sanitizer) now lives in
// `image-captions.ts`, shared with the PDF import worker's post-import sweep so
// every layer of the captioning ladder writes the same caption contract. This
// file owns only the catalog-building half (load + render) and re-exports
// captionMissing for the path generator's existing call site.

import { db } from './db';
import { FlashcardFigureSchema, QuizFigureSchema } from '@notemage/shared';
import { captionMissing } from './image-captions';

// Re-exported so the path generator keeps importing the lazy captioning pass
// from here (the catalog's natural home) even though it now lives in the
// shared captioning module.
export { captionMissing };

export interface SourceImage {
  /** PageImage.id — used verbatim as the `imageRef` the model copies. */
  id: string;
  pageTitle: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  /** Vision caption (cached). Null until the captioning pass fills it. */
  caption: string | null;
}

/** Hard ceiling on images per path so a pathological notebook can't blow the
 *  vision budget or the prompt size. */
const MAX_CATALOG_IMAGES = 24;

/**
 * Load the captioned-or-not source images for the picked materials,
 * ownership-checked through the page → section → notebook chain (mirrors
 * loadMaterialCorpus). Deterministically ordered so the rendered catalog is
 * byte-stable across a run's slots (prompt-cache requirement).
 */
export async function loadSourceImages(
  userId: string,
  materialIds: string[],
): Promise<SourceImage[]> {
  if (materialIds.length === 0) return [];
  const rows = await db.pageImage.findMany({
    where: {
      mimeType: { startsWith: 'image/' },
      page: { id: { in: materialIds }, section: { notebook: { userId } } },
    },
    select: {
      id: true,
      fileName: true,
      filePath: true,
      mimeType: true,
      aiCaption: true,
      page: { select: { title: true } },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: MAX_CATALOG_IMAGES,
  });
  return rows.map((r) => ({
    id: r.id,
    pageTitle: r.page.title,
    fileName: r.fileName,
    filePath: r.filePath,
    mimeType: r.mimeType,
    caption: r.aiCaption,
  }));
}

/**
 * Render the captioned images into the catalog block appended to the theory
 * prompt's cached system text. Deterministic given the same (ordered) images.
 * Returns '' when no image has a caption — the prompt then never mentions
 * figures.
 */
export function renderImageCatalog(images: SourceImage[]): string {
  const captioned = images.filter((i) => i.caption && i.caption.trim().length > 0);
  if (captioned.length === 0) return '';
  const lines = captioned.map(
    (i) => `- imageRef=${i.id} — ${i.caption!.trim()} (source page: "${i.pageTitle}")`,
  );
  return [
    '### SOURCE FIGURES',
    'Images from the learner\'s materials you MAY embed via `figures` (copy each imageRef verbatim):',
    ...lines,
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────
// Figure validators — shared by path generation (theory/flashcards/quiz) AND
// chat-conditional figures (P5). Pure functions over the catalog's SourceImage
// list; each validates the model's per-item figure with the strict shared zod
// schema and drops hallucinated/duplicate refs so a bad figure is never
// persisted (and never fails the card/question). Live here (the catalog's home)
// rather than in the heavy path-generation orchestrator so the chat stream can
// reuse them without importing it.
// ─────────────────────────────────────────────────────────────────────

/**
 * Validate each card's optional figure against the image catalog (figure-reuse
 * P3). Returns one entry per figured card — in card order, deduped by source
 * image, capped at 4 — so a hallucinated or duplicate `imageRef` (or a figure on
 * a 5th card) is dropped before any FlashcardImage is snapshotted.
 */
export function resolveFlashcardFigures(
  cards: { figure?: unknown }[],
  available: SourceImage[],
): { cardIndex: number; image: SourceImage; side: 'front' | 'back'; caption: string }[] {
  if (available.length === 0) return [];
  const byId = new Map(available.map((img) => [img.id, img]));
  const seen = new Set<string>();
  const out: { cardIndex: number; image: SourceImage; side: 'front' | 'back'; caption: string }[] =
    [];
  for (let i = 0; i < cards.length; i++) {
    const raw = cards[i]?.figure;
    if (raw == null) continue;
    const parsed = FlashcardFigureSchema.safeParse(raw);
    if (!parsed.success) continue;
    const img = byId.get(parsed.data.imageRef);
    if (!img || seen.has(img.id)) continue;
    seen.add(img.id);
    out.push({ cardIndex: i, image: img, side: parsed.data.side, caption: parsed.data.caption });
    if (out.length >= 4) break;
  }
  return out;
}

/**
 * Validate each question's optional figure against the image catalog (figure-
 * reuse P4). Returns one entry per figured question — in question order, deduped
 * by source image, capped at 3 — so a hallucinated or duplicate `imageRef` (or a
 * figure on a 4th question) is dropped before any QuizQuestionImage is
 * snapshotted. One exhibit per question (the table's `questionId` is unique).
 */
export function resolveQuizFigures(
  questions: { figure?: unknown }[],
  available: SourceImage[],
): { questionIndex: number; image: SourceImage; caption: string }[] {
  if (available.length === 0) return [];
  const byId = new Map(available.map((img) => [img.id, img]));
  const seen = new Set<string>();
  const out: { questionIndex: number; image: SourceImage; caption: string }[] = [];
  for (let i = 0; i < questions.length; i++) {
    const raw = questions[i]?.figure;
    if (raw == null) continue;
    const parsed = QuizFigureSchema.safeParse(raw);
    if (!parsed.success) continue;
    const img = byId.get(parsed.data.imageRef);
    if (!img || seen.has(img.id)) continue;
    seen.add(img.id);
    out.push({ questionIndex: i, image: img, caption: parsed.data.caption });
    if (out.length >= 3) break;
  }
  return out;
}
