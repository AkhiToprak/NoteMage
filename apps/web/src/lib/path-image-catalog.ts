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
import { captionMissing, sanitizeCaption } from './image-captions';
import { logTelemetry } from './telemetry-server';

// Re-exported so the path generator keeps importing the lazy captioning pass
// from here (the catalog's natural home) even though it now lives in the
// shared captioning module.
export { captionMissing };

export interface SourceImage {
  /** PageImage.id — used verbatim as the `imageRef` the model copies. */
  id: string;
  /** Owning page id — used to flag whether the image is on a picked page. */
  pageId: string;
  pageTitle: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  /** Stored byte size — a crop-size / decorative signal for ranking. */
  fileSize: number;
  /** Normalized crop box [x0,y0,x1,y1] (0–1) when known, else null. */
  bbox: number[] | null;
  /** How the image was imported (vision_crop | embedded_scan | …) or null. */
  sourceType: string | null;
  /** Vision caption (cached). Null until the captioning pass fills it. */
  caption: string | null;
  /** True when the image sits on a material the user explicitly picked (vs.
   *  merely sharing a backing notebook). The strongest ranking signal. */
  onPickedPage: boolean;
}

/** Ranking context — what the path is about, so figures can be scored for
 *  topic relevance via cheap lexical overlap (no embedding infra exists). */
export interface CatalogContext {
  title: string;
  subjectLabels: string[];
  pickedPageTitles: string[];
}

/** Hard ceiling on images rendered into the catalog so a pathological notebook
 *  can't blow the vision budget or the prompt size. Selection slices to this
 *  AFTER ranking, so it's no longer a blind DB take. */
const MAX_CATALOG_IMAGES = 24;

/** Bound on candidates loaded before ranking — protects memory when a backing
 *  notebook has thousands of figures. Picked-page images are loaded separately
 *  so they're never crowded out by this cap. */
const CANDIDATE_POOL = 200;

const IMAGE_SELECT = {
  id: true,
  fileName: true,
  filePath: true,
  mimeType: true,
  fileSize: true,
  bbox: true,
  sourceType: true,
  aiCaption: true,
  page: { select: { id: true, title: true } },
} as const;

/** Coerce a stored bbox JSON into `[x0,y0,x1,y1]` or null — never trust the shape. */
function parseBbox(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const nums = raw.map(Number);
  return nums.every((n) => Number.isFinite(n)) ? nums : null;
}

type ImageRow = {
  id: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  bbox: unknown;
  sourceType: string | null;
  aiCaption: string | null;
  page: { id: string; title: string };
};

function toSourceImage(r: ImageRow, onPickedPage: boolean): SourceImage {
  return {
    id: r.id,
    pageId: r.page.id,
    pageTitle: r.page.title,
    fileName: r.fileName,
    filePath: r.filePath,
    mimeType: r.mimeType,
    fileSize: r.fileSize,
    bbox: parseBbox(r.bbox),
    sourceType: r.sourceType,
    caption: r.aiCaption,
    onPickedPage,
  };
}

/**
 * Resolve, rank, and select the source images for a path's picked materials.
 *
 * `materialIds` is polymorphic — an id can be a Page, Document, FlashcardSet, or
 * QuizSet (see loadMaterialCorpus). The old loader only matched page ids, so a
 * path built from a flashcard/quiz/document material silently got zero figures
 * even when its notebook had them. We now resolve the backing scope: images on
 * explicitly-picked pages PLUS images anywhere in the notebooks behind the
 * picked materials (ownership-checked via page → section → notebook). Picked-page
 * images are loaded separately so the candidate cap can't crowd them out, then
 * everything is ranked (see selectCatalogImages) and sliced to MAX_CATALOG_IMAGES.
 *
 * Captioning is intentionally NOT done here — the caller captions only the ≤24
 * survivors, so a big notebook never blows the vision budget.
 */
export async function loadSourceImages(
  userId: string,
  materialIds: string[],
  ctx: { planId: string; title: string; subjectLabels: string[] },
  opts: { expandToNotebook?: boolean } = {},
): Promise<SourceImage[]> {
  if (materialIds.length === 0) return [];
  // Path generation expands to the backing notebooks (the P1 fix); chat keeps a
  // tight scope to only the explicitly-attached pages.
  const expandToNotebook = opts.expandToNotebook ?? true;

  // Resolve which picked ids are owned pages, and the notebooks behind every
  // owned material kind. Mirrors loadMaterialCorpus's four-way fan-out.
  const [pages, documents, flashcardSets, quizSets] = await Promise.all([
    db.page.findMany({
      where: { id: { in: materialIds }, section: { notebook: { userId } } },
      select: { id: true, title: true, section: { select: { notebookId: true } } },
    }),
    db.document.findMany({
      where: { id: { in: materialIds }, notebook: { userId } },
      select: { notebookId: true },
    }),
    db.flashcardSet.findMany({
      where: { id: { in: materialIds }, userId },
      select: { notebookId: true },
    }),
    db.quizSet.findMany({
      where: { id: { in: materialIds }, userId },
      select: { notebookId: true },
    }),
  ]);

  const pickedPageIds = pages.map((p) => p.id);
  const pickedPageIdSet = new Set(pickedPageIds);
  const pickedPageTitles = pages.map((p) => p.title);
  const backingNotebookIds = Array.from(
    new Set(
      [
        ...pages.map((p) => p.section?.notebookId),
        ...documents.map((d) => d.notebookId),
        ...flashcardSets.map((f) => f.notebookId),
        ...quizSets.map((q) => q.notebookId),
      ].filter((id): id is string => typeof id === 'string'),
    ),
  );
  const resolvedCount = pages.length + documents.length + flashcardSets.length + quizSets.length;

  // Two bounded loads: precise picked-page images + recall expansion across the
  // backing notebooks. Run only the queries that can match.
  const [pickedImages, notebookImages] = await Promise.all([
    pickedPageIds.length > 0
      ? db.pageImage.findMany({
          where: {
            mimeType: { startsWith: 'image/' },
            page: { id: { in: pickedPageIds }, section: { notebook: { userId } } },
          },
          select: IMAGE_SELECT,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: CANDIDATE_POOL,
        })
      : Promise.resolve([] as ImageRow[]),
    expandToNotebook && backingNotebookIds.length > 0
      ? db.pageImage.findMany({
          where: {
            mimeType: { startsWith: 'image/' },
            page: { section: { notebookId: { in: backingNotebookIds }, notebook: { userId } } },
          },
          select: IMAGE_SELECT,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: CANDIDATE_POOL,
        })
      : Promise.resolve([] as ImageRow[]),
  ]);

  // Merge, deduped by id, picked-page images first (and flagged).
  const byId = new Map<string, SourceImage>();
  for (const r of pickedImages as ImageRow[]) byId.set(r.id, toSourceImage(r, true));
  for (const r of notebookImages as ImageRow[]) {
    if (byId.has(r.id)) continue;
    byId.set(r.id, toSourceImage(r, pickedPageIdSet.has(r.page.id)));
  }
  const candidates = Array.from(byId.values());

  const selected = selectCatalogImages(
    candidates,
    { title: ctx.title, subjectLabels: ctx.subjectLabels, pickedPageTitles },
    MAX_CATALOG_IMAGES,
  );

  // Surface the seam so a silent drop is visible in logs (figure-reuse P1).
  logTelemetry(userId, 'path.figures.source_scan', {
    planId: ctx.planId,
    materialIdCount: materialIds.length,
    resolved: {
      page: pages.length,
      document: documents.length,
      flashcard_set: flashcardSets.length,
      quiz_set: quizSets.length,
      unresolved: materialIds.length - resolvedCount,
    },
    pickedPageCount: pickedPageIds.length,
    backingNotebookCount: backingNotebookIds.length,
    candidateCount: candidates.length,
    selectedCount: selected.length,
  });

  return selected;
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
// Ranked selection (figure-reuse P3). Replaces the old "first 24 by createdAt"
// with a deterministic, pure score so the most useful figures win the limited
// catalog slots. No embedding infra exists, so topic relevance is cheap lexical
// overlap. Pure over its inputs → unit-testable without a DB.
// ─────────────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'your', 'about',
  'these', 'those', 'their', 'over', 'under', 'between', 'figure', 'image',
  'diagram', 'shows', 'showing', 'illustrates', 'page', 'general',
]);

/** Tokenize into lowercased content words (len ≥ 4, no stopwords). */
function topicTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
}

/** True when a bbox covers essentially the whole page (a full-page fallback
 *  crop) — almost always decorative/low-value for a single slot. */
function isFullPage(bbox: number[] | null): boolean {
  if (!bbox) return false;
  const [x0, y0, x1, y1] = bbox;
  return x0 <= 0.02 && y0 <= 0.02 && x1 >= 0.98 && y1 >= 0.98;
}

/** Deterministic relevance/quality score for one candidate image. Higher wins. */
export function scoreSourceImage(img: SourceImage, topicSet: Set<string>): number {
  let score = 0;

  // Same source page the learner picked — the strongest signal.
  if (img.onPickedPage) score += 100;

  // Caption quality.
  const cap = img.caption?.trim() ?? '';
  if (cap && sanitizeCaption(cap)) {
    score += 25;
    if (cap.length >= 20 && cap.length <= 140) score += 10;
    if (cap.split(/\s+/).length >= 3) score += 5;
  }

  // Non-decorative likelihood — penalize full-page fallbacks and tiny assets
  // (icons, bullets, rules).
  if (isFullPage(img.bbox)) score -= 30;
  if (img.fileSize < 3_000) score -= 25;
  else if (img.fileSize < 8_000) score -= 10;

  // Crop size / quality — bbox area when known, plus a capped byte-size reward.
  if (img.bbox && !isFullPage(img.bbox)) {
    const [x0, y0, x1, y1] = img.bbox;
    const area = Math.max(0, (x1 - x0) * (y1 - y0));
    score += Math.min(area, 0.5) * 20;
  }
  score += Math.min(img.fileSize / 50_000, 1) * 10;

  // Topic relevance — lexical overlap of caption tokens with the path context.
  if (cap) {
    const overlap = topicTokens(cap).filter((t) => topicSet.has(t)).length;
    score += Math.min(overlap, 5) * 6;
  }

  return score;
}

/**
 * Rank candidates, drop near-duplicates, and slice to `limit`. Pure: same input
 * → same output (ties broken by onPickedPage then id), so the rendered catalog
 * stays prompt-cache-stable. Near-duplicate = identical caption text (keep the
 * higher-scored one); captionless images are never deduped (no safe key).
 */
export function selectCatalogImages(
  candidates: SourceImage[],
  ctx: CatalogContext,
  limit: number = MAX_CATALOG_IMAGES,
): SourceImage[] {
  if (candidates.length === 0) return [];
  const topicSet = new Set(
    topicTokens([ctx.title, ...ctx.subjectLabels, ...ctx.pickedPageTitles].join(' ')),
  );

  const scored = candidates
    .map((img) => ({ img, score: scoreSourceImage(img, topicSet) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.img.onPickedPage !== b.img.onPickedPage) return a.img.onPickedPage ? -1 : 1;
      return a.img.id < b.img.id ? -1 : 1;
    });

  const seenCaptions = new Set<string>();
  const out: SourceImage[] = [];
  for (const { img } of scored) {
    const cap = img.caption?.trim().toLowerCase();
    if (cap) {
      if (seenCaptions.has(cap)) continue;
      seenCaptions.add(cap);
    }
    out.push(img);
    if (out.length >= limit) break;
  }
  return out;
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
 * Why a model-emitted figure ref was dropped (figure-reuse telemetry, P4):
 *  - `unknown_ref`  — well-formed but not in the catalog (hallucinated id);
 *  - `schema_invalid` — failed the strict figure zod schema;
 *  - `duplicate`    — same source image already used in this set;
 *  - `cap_exceeded` — valid, but past the per-set figure cap.
 */
export type FigureRejectReason = 'unknown_ref' | 'schema_invalid' | 'duplicate' | 'cap_exceeded';

export interface FigureRejection {
  index: number;
  /** The offending imageRef when we could read one, else null. */
  ref: string | null;
  reason: FigureRejectReason;
}

export interface FigureResolution<T> {
  accepted: T[];
  rejected: FigureRejection[];
}

const FLASHCARD_FIGURE_CAP = 4;
const QUIZ_FIGURE_CAP = 3;

/** Best-effort read of an `imageRef` off an unvalidated figure, for telemetry. */
export function refOf(raw: unknown): string | null {
  if (raw && typeof raw === 'object' && 'imageRef' in raw) {
    const r = (raw as { imageRef?: unknown }).imageRef;
    return typeof r === 'string' ? r : null;
  }
  return null;
}

/**
 * Validate each card's optional figure against the image catalog (figure-reuse).
 * Returns accepted entries — in card order, deduped by source image, capped at 4
 * — plus a structured list of every dropped ref and why, so a hallucinated or
 * duplicate `imageRef` is dropped before any FlashcardImage is snapshotted while
 * still being recorded in PathGenerationTelemetry.
 */
export function resolveFlashcardFigures(
  cards: { figure?: unknown }[],
  available: SourceImage[],
): FigureResolution<{ cardIndex: number; image: SourceImage; side: 'front' | 'back'; caption: string }> {
  const accepted: { cardIndex: number; image: SourceImage; side: 'front' | 'back'; caption: string }[] = [];
  const rejected: FigureRejection[] = [];
  const byId = new Map(available.map((img) => [img.id, img]));
  const seen = new Set<string>();
  for (let i = 0; i < cards.length; i++) {
    const raw = cards[i]?.figure;
    if (raw == null) continue;
    const parsed = FlashcardFigureSchema.safeParse(raw);
    if (!parsed.success) {
      rejected.push({ index: i, ref: refOf(raw), reason: 'schema_invalid' });
      continue;
    }
    const img = byId.get(parsed.data.imageRef);
    if (!img) {
      rejected.push({ index: i, ref: parsed.data.imageRef, reason: 'unknown_ref' });
      continue;
    }
    if (seen.has(img.id)) {
      rejected.push({ index: i, ref: parsed.data.imageRef, reason: 'duplicate' });
      continue;
    }
    if (accepted.length >= FLASHCARD_FIGURE_CAP) {
      rejected.push({ index: i, ref: parsed.data.imageRef, reason: 'cap_exceeded' });
      continue;
    }
    seen.add(img.id);
    accepted.push({ cardIndex: i, image: img, side: parsed.data.side, caption: parsed.data.caption });
  }
  return { accepted, rejected };
}

/**
 * Validate each question's optional figure against the image catalog (figure-
 * reuse). Returns accepted entries — in question order, deduped by source image,
 * capped at 3 — plus structured rejections. One exhibit per question (the
 * table's `questionId` is unique).
 */
export function resolveQuizFigures(
  questions: { figure?: unknown }[],
  available: SourceImage[],
): FigureResolution<{ questionIndex: number; image: SourceImage; caption: string }> {
  const accepted: { questionIndex: number; image: SourceImage; caption: string }[] = [];
  const rejected: FigureRejection[] = [];
  const byId = new Map(available.map((img) => [img.id, img]));
  const seen = new Set<string>();
  for (let i = 0; i < questions.length; i++) {
    const raw = questions[i]?.figure;
    if (raw == null) continue;
    const parsed = QuizFigureSchema.safeParse(raw);
    if (!parsed.success) {
      rejected.push({ index: i, ref: refOf(raw), reason: 'schema_invalid' });
      continue;
    }
    const img = byId.get(parsed.data.imageRef);
    if (!img) {
      rejected.push({ index: i, ref: parsed.data.imageRef, reason: 'unknown_ref' });
      continue;
    }
    if (seen.has(img.id)) {
      rejected.push({ index: i, ref: parsed.data.imageRef, reason: 'duplicate' });
      continue;
    }
    if (accepted.length >= QUIZ_FIGURE_CAP) {
      rejected.push({ index: i, ref: parsed.data.imageRef, reason: 'cap_exceeded' });
      continue;
    }
    seen.add(img.id);
    accepted.push({ questionIndex: i, image: img, caption: parsed.data.caption });
  }
  return { accepted, rejected };
}
