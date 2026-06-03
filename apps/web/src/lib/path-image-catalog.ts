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
// Ultra-only by policy (see loadPlanForGeneration): the vision pass is the
// only added AI cost, and gating it to ultra keeps the free-tier COGS budget
// intact. Gemini-only by design: vision is cheap on Flash-Lite and this is
// cost-sensitive; if Gemini isn't configured the pass no-ops and figures are
// simply never offered.

import { db } from './db';
import { readFile } from './storage';
import { getGeminiClient, GEMINI_PATH_MODEL_LITE } from './gemini';

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
/** Images per vision round-trip — keeps the multimodal request small. */
const CAPTION_BATCH = 8;
/** Vision model id (env-overridable; defaults to the cheap multimodal Flash-Lite). */
const CAPTION_MODEL = process.env.PATH_IMAGE_CAPTION_MODEL ?? GEMINI_PATH_MODEL_LITE;
const CAPTION_TIMEOUT_MS = 60_000;
const MAX_CAPTION_CHARS = 300;

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

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

const CAPTION_SYSTEM =
  'You caption figures for a study lesson. For each figure you are given a ' +
  '[[imageRef=…]] label followed by the image. Return ONLY JSON of the form ' +
  '{"captions":[{"imageRef":"<the id>","caption":"<one concise sentence>"}]} ' +
  'with one entry per figure. Each caption states what the figure shows AND ' +
  'the concept/topic it illustrates, so a tutor can decide which lesson it ' +
  'fits. No markdown, no extra keys.';

/** One batched vision round-trip; returns id → caption for the batch. */
async function captionBatch(batch: SourceImage[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const parts: GeminiPart[] = [
    { text: 'Caption every figure below. Return the JSON described in the system instruction.' },
  ];
  const present: string[] = [];
  for (const img of batch) {
    let data: string;
    try {
      data = (await readFile(img.filePath)).toString('base64');
    } catch {
      continue; // missing blob → skip this image, caption the rest
    }
    parts.push({ text: `[[imageRef=${img.id}]] (from page "${img.pageTitle}")` });
    parts.push({ inlineData: { mimeType: img.mimeType, data } });
    present.push(img.id);
  }
  if (present.length === 0) return out;

  const client = getGeminiClient();
  const response = await client.models.generateContent({
    model: CAPTION_MODEL,
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: CAPTION_SYSTEM,
      temperature: 0,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
      abortSignal: AbortSignal.timeout(CAPTION_TIMEOUT_MS),
    },
  });

  const present_ = new Set(present);
  try {
    const parsed = JSON.parse(response.text ?? '');
    const items = Array.isArray(parsed?.captions) ? parsed.captions : [];
    for (const it of items) {
      if (it && typeof it.imageRef === 'string' && typeof it.caption === 'string') {
        const caption = it.caption.trim().slice(0, MAX_CAPTION_CHARS);
        if (present_.has(it.imageRef) && caption.length > 0) out.set(it.imageRef, caption);
      }
    }
  } catch {
    // Unparseable response → this batch stays uncaptioned; callers fall back to
    // not offering those figures. Never throws into the generation pipeline.
  }
  return out;
}

/**
 * Caption every image missing `aiCaption`, persist the captions, and mutate
 * the passed objects in place so the caller can render the catalog without a
 * reload. Best-effort: any failure (Gemini unconfigured, call error, bad
 * blob) leaves the affected images uncaptioned rather than failing the path.
 */
export async function captionMissing(images: SourceImage[]): Promise<void> {
  const missing = images.filter((i) => !i.caption || i.caption.trim().length === 0);
  if (missing.length === 0) return;
  if (!process.env.GEMINI_API_KEY) return; // vision not configured → skip silently

  for (let i = 0; i < missing.length; i += CAPTION_BATCH) {
    const batch = missing.slice(i, i + CAPTION_BATCH);
    let captions: Map<string, string>;
    try {
      captions = await captionBatch(batch);
    } catch {
      continue; // one batch failing must not strand the rest
    }
    if (captions.size === 0) continue;
    const now = new Date();
    await Promise.all(
      batch.map(async (img) => {
        const caption = captions.get(img.id);
        if (!caption) return;
        img.caption = caption;
        await db.pageImage
          .update({ where: { id: img.id }, data: { aiCaption: caption, captionedAt: now } })
          .catch(() => {
            /* persistence failure → keep the in-memory caption for this run */
          });
      }),
    );
  }
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
