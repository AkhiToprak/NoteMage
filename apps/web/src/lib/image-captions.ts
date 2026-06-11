// Shared figure-captioning core (figure-reuse feature).
//
// Extracted from path-image-catalog.ts so the layers of the captioning ladder
// share ONE idempotent implementation:
//   - layer 1 (import-time `alt`, run-job.ts) — feeds sanitizeCaption() directly;
//   - layer 2 (post-import sweep, sweepPageCaptions) — fire-and-forget batch;
//   - layer 3 (generation-time lazy pass, captionMissing) — the original
//     path-theory call, kept as the converging safety net.
// Every layer only ever fills a `PageImage` whose `aiCaption` is still null,
// persists the result, and fails soft: a captioning failure must never break an
// import or a path. All layers run their captions through sanitizeCaption(), so
// the stored contract is identical regardless of which layer wrote it.

import * as Sentry from '@sentry/nextjs';
import { db } from './db';
import { readFile } from './storage';
import { getGeminiClient, GEMINI_PATH_MODEL_LITE } from './gemini';

/**
 * A captionable image — the minimal shape the vision pass needs. `SourceImage`
 * (path-image-catalog) is a structural superset, so its arrays pass straight
 * in. `caption` is mutated in place by `captionMissing` so callers can render
 * without a reload.
 */
export interface CaptionTarget {
  /** PageImage.id — echoed back by the model as the `imageRef`. */
  id: string;
  /** Title of the page the image was cropped from — steers caption relevance. */
  pageTitle: string;
  filePath: string;
  mimeType: string;
  caption: string | null;
}

/** Images per vision round-trip — keeps the multimodal request small. */
const CAPTION_BATCH = 8;
/** Vision model id (env-overridable; defaults to the cheap multimodal Flash-Lite). */
const CAPTION_MODEL = process.env.PATH_IMAGE_CAPTION_MODEL ?? GEMINI_PATH_MODEL_LITE;
const CAPTION_TIMEOUT_MS = 60_000;
/** Max stored caption length after sanitization (caption contract, plan §3). */
const MAX_CAPTION_CHARS = 160;
/**
 * Hard cap on images captioned by ONE post-import sweep — bounds the vision
 * spend a figure-spam PDF can trigger (import failure-mode #12).
 */
const SWEEP_IMAGE_CAP = 150;

/**
 * Useless single-word captions the model sometimes emits when it has nothing
 * meaningful to say. Treated as missing so the next ladder layer retries rather
 * than storing junk that would only mislead figure selection.
 */
const PLACEHOLDER_CAPTIONS = new Set([
  'image',
  'figure',
  'diagram',
  'picture',
  'photo',
  'screenshot',
  'chart',
  'graph',
  'illustration',
  'caption',
  'n/a',
  'na',
  'none',
  'unknown',
]);

/**
 * Normalise a raw caption/alt into the stored contract, or `null` when it is
 * empty or a useless placeholder. Strips backticks, braces, and control chars
 * (caption text is never interpreted as an instruction — import failure-mode
 * #10), collapses whitespace, and caps at 160 chars. Returning `null` routes
 * the image to the next captioning layer instead of persisting junk.
 */
export function sanitizeCaption(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/[`{}]/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CAPTION_CHARS)
    .trim();
  if (cleaned.length === 0) return null;
  if (PLACEHOLDER_CAPTIONS.has(cleaned.toLowerCase().replace(/[.!?]+$/, ''))) return null;
  return cleaned;
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

/** One batched vision round-trip; returns id → sanitized caption for the batch. */
async function captionBatch(batch: CaptionTarget[]): Promise<Map<string, string>> {
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
        const caption = sanitizeCaption(it.caption);
        if (present_.has(it.imageRef) && caption) out.set(it.imageRef, caption);
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
export async function captionMissing(images: CaptionTarget[]): Promise<void> {
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
 * Layer 2 of the captioning ladder: after a PDF import reaches `ready`, caption
 * any figure on the result page that import-time `alt` (layer 1) left without a
 * caption. Designed to be fired-and-forgotten by the import worker — it owns
 * its try/catch and NEVER throws, so a failed or redeploy-killed sweep costs
 * nothing (layer-3 lazy captioning still heals at first generation). Idempotent:
 * only ever touches rows where `aiCaption IS NULL`, bounded to 150 images.
 */
export async function sweepPageCaptions(pageId: string): Promise<void> {
  try {
    if (process.env.IMPORT_FIGURE_TITLES_DISABLED === '1') return;
    if (!process.env.GEMINI_API_KEY) return;

    const rows = await db.pageImage.findMany({
      where: { pageId, aiCaption: null, mimeType: { startsWith: 'image/' } },
      select: {
        id: true,
        filePath: true,
        mimeType: true,
        page: { select: { title: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: SWEEP_IMAGE_CAP,
    });
    if (rows.length === 0) return;

    const targets: CaptionTarget[] = rows.map((r) => ({
      id: r.id,
      pageTitle: r.page.title,
      filePath: r.filePath,
      mimeType: r.mimeType,
      caption: null,
    }));
    await captionMissing(targets);

    const titled = targets.filter((t) => t.caption).length;
    Sentry.addBreadcrumb({
      category: 'pdf-import',
      level: 'info',
      message: 'figure caption sweep',
      data: { pageId, swept: rows.length, titled },
    });
  } catch (err) {
    console.error(`[pdf-import] caption sweep failed for page ${pageId}`, err);
    Sentry.addBreadcrumb({
      category: 'pdf-import',
      level: 'warning',
      message: 'figure caption sweep failed',
      data: { pageId, error: err instanceof Error ? err.message : String(err) },
    });
  }
}
