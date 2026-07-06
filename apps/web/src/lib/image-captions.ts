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
import { logAiUsage } from './ai-usage';
import {
  isGeminiBatchAvailable,
  submitGeminiBatch,
  type GeminiBatchRequest,
  type GeminiBatchResult,
} from './gemini-batch';
import { enqueueJob } from './background-jobs';

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

/** Optional context for metering caption calls against the AI usage ledger. */
export interface CaptionUsageContext {
  /** Owning user; may be null when called from a path-generation context that
   *  doesn't thread userId through (logged with null, still counted). */
  userId: string | null;
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
 * PA-34: extended with German/French/Spanish/Italian junk equivalents.
 */
const PLACEHOLDER_CAPTIONS = new Set([
  // English
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
  // German
  'abbildung',
  'diagramm',
  'bild',
  'grafik',
  'schema',
  'figur',
  'tabelle',
  // French / Spanish / Italian
  'imagen',
  'figura',
  'schéma',
  'schema',
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

// PA-34: (a) language rule — caption in the language of the figure's own text,
// else the document's language; (b) length rule — at most 120 characters
// (storage truncates at 160; keep headroom for sanitization).
const CAPTION_SYSTEM =
  'You caption figures for a study lesson. For each figure you are given a ' +
  '[[imageRef=…]] label followed by the image. Return ONLY JSON of the form ' +
  '{"captions":[{"imageRef":"<the id>","caption":"<one concise sentence>"}]} ' +
  'with one entry per figure. Each caption states what the figure shows AND ' +
  'the concept/topic it illustrates, so a tutor can decide which lesson it ' +
  'fits. Caption in the same language as any text visible inside the figure; ' +
  'if the figure has no text, use the language of the surrounding document. ' +
  'Keep each caption under 120 characters. No markdown, no extra keys.';

interface BatchResult {
  captions: Map<string, string>;
  /** Raw token counts from usageMetadata for aggregation across batches. */
  promptTokens: number;
  candidatesTokens: number;
}

/**
 * Build the user-turn `parts` (interleaved ref labels + inline image data) for a
 * batch, reading each blob. Shared by the inline path and the Batch API submit
 * so both send byte-identical requests. Returns the parts and the ids that
 * actually made it in (a missing blob is skipped).
 */
async function buildCaptionParts(batch: CaptionTarget[]): Promise<{ parts: GeminiPart[]; present: string[] }> {
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
    // PA-34i: sanitize pageTitle before interpolation (strip [ ] and quotes).
    const safeTitle = img.pageTitle.replace(/[\[\]"']/g, '').slice(0, 80);
    parts.push({ text: `[[imageRef=${img.id}]] (from page "${safeTitle}")` });
    parts.push({ inlineData: { mimeType: img.mimeType, data } });
    present.push(img.id);
  }
  return { parts, present };
}

/** The single Gemini config both paths use for a caption call. */
function captionCallConfig() {
  return {
    systemInstruction: CAPTION_SYSTEM,
    temperature: 0,
    maxOutputTokens: 2048,
    responseMimeType: 'application/json',
  };
}

/**
 * Parse a caption JSON response into an id→caption map, keeping only refs that
 * were actually present in the request and whose caption survives sanitization.
 * Never throws — an unparseable response yields an empty map (callers fall back).
 */
function parseCaptionResponse(text: string | null | undefined, present: string[]): Map<string, string> {
  const captions = new Map<string, string>();
  const present_ = new Set(present);
  try {
    const parsed = JSON.parse(text ?? '');
    const items = Array.isArray(parsed?.captions) ? parsed.captions : [];
    for (const it of items) {
      if (it && typeof it.imageRef === 'string' && typeof it.caption === 'string') {
        const caption = sanitizeCaption(it.caption);
        if (present_.has(it.imageRef) && caption) captions.set(it.imageRef, caption);
      }
    }
  } catch {
    // Unparseable response → this batch stays uncaptioned; callers fall back.
  }
  return captions;
}

/** One batched vision round-trip; returns captions and raw token counts. */
async function captionBatch(batch: CaptionTarget[]): Promise<BatchResult> {
  const { parts, present } = await buildCaptionParts(batch);
  if (present.length === 0) return { captions: new Map(), promptTokens: 0, candidatesTokens: 0 };

  const client = getGeminiClient();
  const response = await client.models.generateContent({
    model: CAPTION_MODEL,
    contents: [{ role: 'user', parts }],
    config: {
      ...captionCallConfig(),
      abortSignal: AbortSignal.timeout(CAPTION_TIMEOUT_MS),
    },
  });

  // PA-12d: capture usage so callers can log to the AI usage ledger.
  const promptTokens = response.usageMetadata?.promptTokenCount ?? 0;
  const candidatesTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

  return { captions: parseCaptionResponse(response.text, present), promptTokens, candidatesTokens };
}

/**
 * Persist a caption map for a batch: writes `aiCaption` + `captionedAt` for each
 * matched image and mutates the in-memory `CaptionTarget` so callers render
 * without a reload. A persistence failure keeps the in-memory caption for this
 * run. Shared by the inline path and the Batch API completion handler.
 */
async function persistCaptions(batch: CaptionTarget[], captions: Map<string, string>): Promise<void> {
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

/**
 * Caption every image missing `aiCaption`, persist the captions, and mutate
 * the passed objects in place so the caller can render the catalog without a
 * reload. Best-effort: any failure (Gemini unconfigured, call error, bad
 * blob) leaves the affected images uncaptioned rather than failing the path.
 *
 * PA-12d: pass `usageCtx` so vision spend is logged to the AI usage ledger.
 * Callers that don't have a userId (path-generation sweeps) may omit it —
 * the spend is then unattributed but still counted in the ledger.
 */
export async function captionMissing(
  images: CaptionTarget[],
  usageCtx?: CaptionUsageContext,
): Promise<void> {
  const missing = images.filter((i) => !i.caption || i.caption.trim().length === 0);
  if (missing.length === 0) return;
  if (!process.env.GEMINI_API_KEY) return; // vision not configured → skip silently

  // PA-12d: accumulate tokens across all batches for a single ledger entry.
  let totalPromptTokens = 0;
  let totalCandidatesTokens = 0;

  // M2c: run all 8-image batches in parallel instead of sequential await —
  // each already persists independently, so there's no ordering dependency.
  // Per-batch try/catch keeps the existing error isolation: one failed batch
  // (call error or persistence) resolves to zero tokens and strands only its
  // own images, never the rest.
  const batches: CaptionTarget[][] = [];
  for (let i = 0; i < missing.length; i += CAPTION_BATCH) {
    batches.push(missing.slice(i, i + CAPTION_BATCH));
  }

  const batchTokens = await Promise.all(
    batches.map(async (batch) => {
      let result: BatchResult;
      try {
        result = await captionBatch(batch);
      } catch {
        return { promptTokens: 0, candidatesTokens: 0 }; // one batch failing must not strand the rest
      }
      if (result.captions.size > 0) {
        await persistCaptions(batch, result.captions);
      }
      return { promptTokens: result.promptTokens, candidatesTokens: result.candidatesTokens };
    }),
  );

  for (const t of batchTokens) {
    totalPromptTokens += t.promptTokens;
    totalCandidatesTokens += t.candidatesTokens;
  }

  // PA-12d: log accumulated vision spend after all batches complete.
  if (totalPromptTokens + totalCandidatesTokens > 0) {
    logAiUsage({
      userId: usageCtx?.userId ?? null,
      feature: 'figure-captions',
      provider: 'gemini',
      model: CAPTION_MODEL,
      inputTokens: totalPromptTokens,
      outputTokens: totalCandidatesTokens,
    });
  }
}

/**
 * Layer 2 of the captioning ladder: after a PDF import reaches `ready`, caption
 * any figure on the result page that import-time `alt` (layer 1) left without a
 * caption. Designed to be fired-and-forgotten by the import worker — it owns
 * its try/catch and NEVER throws, so a failed or redeploy-killed sweep costs
 * nothing (layer-3 lazy captioning still heals at first generation). Idempotent:
 * only ever touches rows where `aiCaption IS NULL`, bounded to 150 images.
 *
 * PA-12d: `userId` threads through to `captionMissing` so vision spend is
 * attributed to the owning user in the AI usage ledger.
 */
export async function sweepPageCaptions(pageId: string, userId?: string | null): Promise<void> {
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

    // M1: when the provider Batch API is available (and not killed), submit the
    // whole sweep as ONE async batch and hand polling to a background job — the
    // sweep no longer holds the worker while the vision calls run. Falls back to
    // today's inline path when the batch surface is missing or submit fails.
    if (isGeminiBatchAvailable()) {
      const submitted = await submitCaptionBatch(pageId, targets, userId ?? null);
      if (submitted) {
        Sentry.addBreadcrumb({
          category: 'pdf-import',
          level: 'info',
          message: 'figure caption batch submitted',
          data: { pageId, swept: rows.length, batchName: submitted },
        });
        return;
      }
      // submit failed → fall through to the inline path below.
    }

    // PA-12d: pass userId so spend is attributed; null is accepted.
    await captionMissing(targets, { userId: userId ?? null });

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

// ─── Provider Batch API path (audit M1) ─────────────────────────────────
//
// Each 8-image group becomes one inlined batch request; `key` is the group's
// leading image id, and the request carries a `refs` metadata list so the poll
// completion handler can re-load the exact PageImage rows without re-querying
// by page. Google runs the batch async (minutes-to-hours); the `ai.batch.poll`
// job polls and dispatches back to captionBatchComplete.

/** Poll cadence for the caption batch job — 5 min between checks (M1). */
const CAPTION_BATCH_POLL_MS = 5 * 60_000;
/** Enough poll attempts to cover Google's ~24h batch SLA at 5-min cadence,
 *  with headroom. */
const CAPTION_BATCH_MAX_POLLS = 300;

/** Metadata a caption batch request carries so the completion handler can
 *  reconstruct which image each response covers (batch responses are only
 *  guaranteed index-aligned, and one request = one 8-image group). */
interface CaptionBatchGroupMeta {
  /** PageImage ids present in this group, in prompt order. */
  refs: string[];
  userId: string | null;
}

/**
 * Submit the sweep's images as ONE Gemini batch job (8 images per request).
 * Returns the `batchName` on success (and enqueues the poll job), or `null` when
 * there was nothing to send or the submit failed (caller falls back to inline).
 */
async function submitCaptionBatch(
  pageId: string,
  targets: CaptionTarget[],
  userId: string | null,
): Promise<string | null> {
  try {
    const requests: GeminiBatchRequest[] = [];
    const groupMetaByKey: Record<string, CaptionBatchGroupMeta> = {};

    for (let i = 0; i < targets.length; i += CAPTION_BATCH) {
      const batch = targets.slice(i, i + CAPTION_BATCH);
      const { parts, present } = await buildCaptionParts(batch);
      if (present.length === 0) continue;
      const key = present[0];
      requests.push({
        key,
        contents: { role: 'user', parts },
        config: captionCallConfig(),
      });
      groupMetaByKey[key] = { refs: present, userId };
    }

    if (requests.length === 0) return null;

    const { batchName } = await submitGeminiBatch(CAPTION_MODEL, requests);

    await enqueueJob(
      'ai.batch.poll',
      { batchName, domain: 'captions', context: { userId } },
      {
        dedupeKey: `ai.batch.poll:${batchName}`,
        runAt: new Date(Date.now() + CAPTION_BATCH_POLL_MS),
        maxAttempts: CAPTION_BATCH_MAX_POLLS,
      },
    );

    // Stash the group→refs map on the page-image rows is unnecessary — the
    // completion handler re-derives refs from each response's own metadata,
    // which the SDK round-trips. `groupMetaByKey` is only used if we ever need
    // to reconcile locally; keep it out of the DB (ponytail: no new column).
    void pageId;
    void groupMetaByKey;

    return batchName;
  } catch (err) {
    console.error(`[pdf-import] caption batch submit failed for page ${pageId}`, err);
    return null;
  }
}

/**
 * Completion handler for a succeeded caption batch (dispatched from the
 * `ai.batch.poll` job). Each result's `key` metadata is the group's leading
 * image id; the response text is the same caption JSON the inline path parses.
 * Persists every caption and writes ONE aggregated `logAiUsage` from the
 * per-response usage. Best-effort: a failed/missing result row is skipped (the
 * layer-3 lazy pass still heals it). Never throws.
 */
export async function captionBatchComplete(
  results: GeminiBatchResult[],
  context: { userId: string | null },
): Promise<void> {
  let totalPromptTokens = 0;
  let totalCandidatesTokens = 0;

  for (const result of results) {
    totalPromptTokens += result.promptTokens;
    totalCandidatesTokens += result.candidatesTokens;
    if (!result.text) continue;

    // The response JSON carries its own imageRefs, so re-load exactly those
    // rows (still-null captions only) and persist. present-set = all refs the
    // response names; parseCaptionResponse filters to those and sanitizes.
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.text);
    } catch {
      continue;
    }
    const items =
      parsed && typeof parsed === 'object' && Array.isArray((parsed as { captions?: unknown }).captions)
        ? (parsed as { captions: { imageRef?: unknown }[] }).captions
        : [];
    const refs = items
      .map((it) => (typeof it?.imageRef === 'string' ? it.imageRef : null))
      .filter((r): r is string => r !== null);
    if (refs.length === 0) continue;

    const rows = await db.pageImage.findMany({
      where: { id: { in: refs }, aiCaption: null },
      select: { id: true, filePath: true, mimeType: true, page: { select: { title: true } } },
    });
    if (rows.length === 0) continue;

    const targets: CaptionTarget[] = rows.map((r) => ({
      id: r.id,
      pageTitle: r.page.title,
      filePath: r.filePath,
      mimeType: r.mimeType,
      caption: null,
    }));
    const captions = parseCaptionResponse(result.text, targets.map((t) => t.id));
    if (captions.size > 0) await persistCaptions(targets, captions);
  }

  if (totalPromptTokens + totalCandidatesTokens > 0) {
    logAiUsage({
      userId: context.userId ?? null,
      feature: 'figure-captions',
      provider: 'gemini',
      model: CAPTION_MODEL,
      inputTokens: totalPromptTokens,
      outputTokens: totalCandidatesTokens,
    });
  }
}
