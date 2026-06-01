// P5 — the detached background worker for a PDF import.
//
// `runPdfImportJob` wires P2–P4 together behind the `ImportJob` table,
// mirroring the learn-path generation pattern (`generatePath`): the
// `POST /api/notebooks/[id]/pdf-import` route persists a `queued` job and
// fires this as a fire-and-forget promise, so the request returns at once
// and the client watches progress over the SSE route.
//
// Like `generatePath`, this function NEVER throws — every failure is
// caught and written to `ImportJob.status = "failed"` with a friendly
// `error`. Import never hard-fails on content either: a page the engine
// cannot describe falls back to the deterministic heuristic extractor.

import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { downloadFromStorage, deleteFile, saveImage } from '@/lib/storage';
import { tiptapJsonToPlainText } from '@/lib/contentConverter';
import { incrementUsage } from '@/lib/usage-limits';
import type { TierKey } from '@/lib/tiers';
import { assembleTiptap } from './assemble';
import type { DocModelBlock } from './doc-model';
import type { DescribePageInput, PdfStructureEngine } from './engine';
import { geminiEngine } from './engine-gemini';
import { textLayerEngine } from './engine-text';
import { cropFigure } from './figure-crop';
import { extractGroundTruth, type GroundTruth, type GroundTruthPage } from './ground-truth';
import { groundTruthToBlocks } from './heuristic-fallback';

/** `ImportJob.mode` enum — keep aligned with the schema column. */
export type ImportJobMode = 'rich' | 'fast';

/**
 * Per-page text-layer check used by fast mode: a `GroundTruthPage` that
 * carries no visible cell text on any line can't be classified by the
 * text-layer engine, so the worker routes it to the vision engine even
 * when fast mode was selected. Document-level `hasTextLayer` is the
 * outer gate; this is the per-page refinement for mixed PDFs.
 */
function pageHasUsableTextLayer(page: GroundTruthPage): boolean {
  return page.lines.some((line) =>
    line.cells.some((cell) => cell.text.trim().length > 0),
  );
}

/** Page-content mirror cap — the page-content route hard-rejects over 500KB. */
const TEXT_CONTENT_LIMIT = 500_000;

/** Placeholder document for the page row while the worker fills it in. */
const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

/** One structure engine per tier — Gemini for all; single-engine is settled. */
const ENGINE_BY_TIER: Record<TierKey, PdfStructureEngine> = {
  FREE: geminiEngine,
  PRO: geminiEngine,
};

/**
 * The vision structure engine for a tier — the "rich" mode engine and the
 * unconditional fallback for fast mode's scanned pages. Gemini serves every
 * tier (single-engine is the settled decision); the per-tier indirection is
 * kept as the one swap point, should a tier ever need a different engine.
 */
export function engineForTier(tier: TierKey): PdfStructureEngine {
  return ENGINE_BY_TIER[tier] ?? geminiEngine;
}

/**
 * The engine identity recorded on `ImportJob.engine` at submission time.
 * Rich mode commits to the tier's vision engine; fast mode commits to the
 * text-layer engine — the worker may still promote individual pages to
 * the vision engine on a per-page basis (scanned page, or text-engine
 * throw), but the row records what the user asked for.
 */
export function engineForJob(tier: TierKey, mode: ImportJobMode): PdfStructureEngine {
  return mode === 'fast' ? textLayerEngine : engineForTier(tier);
}

/** Progress snapshot written to `ImportJob.progress` and relayed over SSE. */
export interface ImportProgress {
  phase: 'extracting' | 'structuring' | 'finalizing';
  totalPages: number;
  processedPages: number;
  message: string;
}

/**
 * A failure with a message safe to show the user verbatim. Anything else
 * thrown inside the worker is logged and reported as a generic message.
 */
class ImportJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportJobError';
  }
}

function progressJson(progress: ImportProgress): Prisma.InputJsonValue {
  return progress as unknown as Prisma.InputJsonValue;
}

/** Best-effort progress write — a failed write must not abort the import. */
async function writeProgress(jobId: string, progress: ImportProgress): Promise<void> {
  await db.importJob
    .update({ where: { id: jobId }, data: { progress: progressJson(progress) } })
    .catch((err) => {
      console.error(`[pdf-import] progress write failed for job ${jobId}`, err);
    });
}

/** One ground-truth page → its verbatim text, one visual line per row. */
function pageLinesToText(page: GroundTruthPage): string {
  return page.lines
    .map((line) =>
      line.cells
        .map((cell) => cell.text)
        .join(' ')
        .trim(),
    )
    .filter((text) => text.length > 0)
    .join('\n');
}

/** Page title from the uploaded file name, extension stripped. */
function deriveTitle(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^./\\]+$/, '').trim();
  return withoutExt.length > 0 ? withoutExt : 'Imported PDF';
}

/**
 * Run a queued `ImportJob` to completion. Loads the job, extracts the
 * PDF's text layer, runs the structure engine per page (heuristic
 * fallback on any engine failure), crops figures, assembles one Tiptap
 * document, and writes it to a single new notebook Page.
 *
 * Never throws: a missing job is logged, and any other failure lands as
 * `status: "failed"` with a friendly `error`. Temp uploads are deleted
 * only on success so a `failed` job can be retried without re-uploading.
 */
export async function runPdfImportJob(jobId: string): Promise<void> {
  const job = await db.importJob
    .findUnique({
      where: { id: jobId },
      include: { user: { select: { tier: true } } },
    })
    .catch((err) => {
      console.error(`[pdf-import] could not load job ${jobId}`, err);
      return null;
    });
  if (!job) {
    console.error(`[pdf-import] job ${jobId} not found`);
    return;
  }

  // PDF jobs always populate these at creation. The shared ImportJob row made
  // them nullable for OneNote imports, so narrow them here: a PDF job missing
  // its source data can't be processed, so fail it cleanly rather than crash.
  if (job.pdfPath === null || job.sectionId === null) {
    console.error(`[pdf-import] job ${jobId} is missing PDF source fields`);
    await db.importJob
      .update({
        where: { id: jobId },
        data: {
          status: 'failed',
          error: 'This import is missing its PDF data. Please try the import again.',
          finishedAt: new Date(),
        },
      })
      .catch(() => {});
    return;
  }
  const pdfPath = job.pdfPath;
  const sectionId = job.sectionId;

  const pageImagePaths = Array.isArray(job.pageImagePaths)
    ? job.pageImagePaths.filter((p): p is string => typeof p === 'string')
    : [];

  let succeeded = false;
  try {
    await db.importJob.update({
      where: { id: jobId },
      data: {
        status: 'processing',
        startedAt: new Date(),
        error: null,
        progress: progressJson({
          phase: 'extracting',
          totalPages: 0,
          processedPages: 0,
          message: 'Reading your PDF…',
        }),
      },
    });

    if (pageImagePaths.length === 0) {
      throw new ImportJobError(
        'No page images were uploaded for this PDF. Please try the import again.',
      );
    }

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await downloadFromStorage(pdfPath);
    } catch {
      throw new ImportJobError(
        'The uploaded PDF could not be found. Please try the import again.',
      );
    }

    let ground: GroundTruth;
    try {
      ground = await extractGroundTruth(pdfBuffer);
    } catch {
      throw new ImportJobError(
        'This PDF could not be read — it may be corrupted or in an unsupported format.',
      );
    }
    if (ground.encrypted) {
      throw new ImportJobError(
        'This PDF is password-protected. Remove the password and import it again.',
      );
    }
    if (ground.pageCount === 0) {
      throw new ImportJobError('This PDF appears to be empty — no pages were found.');
    }

    const pageCount = Math.min(ground.pageCount, job.pageCap, pageImagePaths.length);
    const visionEngine = engineForTier(job.user.tier);
    // Fast mode is opt-in (P5). The row's `mode` column gates the per-page
    // branch below; scanned pages and pages whose text-layer classifier
    // produces nothing get promoted to the vision engine silently.
    const jobMode: ImportJobMode = job.mode === 'fast' ? 'fast' : 'rich';

    await writeProgress(jobId, {
      phase: 'structuring',
      totalPages: pageCount,
      processedPages: 0,
      message: 'Analysing pages…',
    });

    const allBlocks: DocModelBlock[] = [];
    const figureCrops: Array<{ ref: string; buffer: Buffer }> = [];
    let fallbackPages = 0;

    for (let i = 0; i < pageCount; i++) {
      const gtPage = ground.pages[i];

      let pngBuffer: Buffer | null = null;
      try {
        pngBuffer = await downloadFromStorage(pageImagePaths[i]);
      } catch (err) {
        // A missing page image is recoverable — the text layer still has
        // enough for the heuristic extractor.
        console.error(`[pdf-import] job ${jobId} page ${i + 1}: image download failed`, err);
      }

      let blocks: DocModelBlock[];
      if (pngBuffer === null) {
        blocks = groundTruthToBlocks(gtPage);
        fallbackPages += 1;
        // No page image and no text layer to recover from — leave a visible
        // marker rather than silently dropping the page.
        if (blocks.length === 0) {
          blocks = [
            {
              type: 'paragraph',
              runs: [{ text: `[Page ${gtPage.pageNumber} could not be imported.]` }],
            },
          ];
        }
      } else {
        // Per-page engine selection. Fast mode tries the text-layer engine
        // when both the document and this specific page carry text; a
        // scanned page inside a mostly-digital PDF, or fast-mode altogether,
        // routes straight to the vision engine. The text engine's three
        // sentinel throws (scanned, missing geometry, zero classified
        // blocks) trigger an in-loop promotion to the vision engine —
        // the "cheap insurance" against a corrupted text layer producing
        // empty paragraphs.
        const tryTextEngine =
          jobMode === 'fast' && ground.hasTextLayer && pageHasUsableTextLayer(gtPage);

        const describeInput: DescribePageInput = {
          pageImageBase64: pngBuffer.toString('base64'),
          mimeType: 'image/png',
          groundTruthText: pageLinesToText(gtPage),
          isScanned: !ground.hasTextLayer,
          pageNumber: gtPage.pageNumber,
          groundTruthPage: gtPage,
        };

        let resolvedBlocks: DocModelBlock[] | null = null;
        if (tryTextEngine) {
          try {
            resolvedBlocks = await textLayerEngine.describePage(describeInput);
          } catch (err) {
            // Sentinel from the text engine — promote this one page to the
            // vision engine without bumping `fallbackPages` (gemini IS an
            // engine, not the deterministic heuristic).
            console.error(
              `[pdf-import] job ${jobId} page ${i + 1}: fast-mode promoted to vision`,
              err,
            );
          }
        }

        if (resolvedBlocks === null) {
          try {
            resolvedBlocks = await visionEngine.describePage(describeInput);
          } catch (err) {
            console.error(
              `[pdf-import] job ${jobId} page ${i + 1}: engine fell back to heuristic`,
              err,
            );
            resolvedBlocks = groundTruthToBlocks(gtPage);
            fallbackPages += 1;
          }
        }

        blocks = resolvedBlocks;

        // Engine failed and the heuristic produced nothing (a no-text-layer
        // page) — keep the page as a full-page image so it is never dropped.
        if (blocks.length === 0) {
          blocks = [
            { type: 'image', ref: `p${gtPage.pageNumber}-full`, bbox: [0, 0, 1, 1] },
          ];
        }

        // Crop every figure the engine boxed while the page PNG is in hand.
        // Fast-mode pages that stayed on the text engine emit no `image`
        // blocks — figures are intentionally dropped in fast mode — so this
        // loop is a no-op for them.
        for (const block of blocks) {
          if (block.type !== 'image') continue;
          try {
            const crop = await cropFigure(pngBuffer, block.bbox);
            if (crop) figureCrops.push({ ref: block.ref, buffer: crop });
          } catch (err) {
            console.error(
              `[pdf-import] job ${jobId} page ${i + 1}: figure crop failed`,
              err,
            );
          }
        }
      }

      allBlocks.push(...blocks);
      await writeProgress(jobId, {
        phase: 'structuring',
        totalPages: pageCount,
        processedPages: i + 1,
        message: `Analysing page ${i + 1} of ${pageCount}…`,
      });
    }

    // Pages beyond the user's remaining import budget are dropped; say so inline.
    const pageCapTruncated = ground.pageCount > pageCount;
    if (pageCapTruncated) {
      allBlocks.push({
        type: 'callout',
        variant: 'warning',
        children: [
          {
            type: 'paragraph',
            runs: [
              {
                text: `This PDF has ${ground.pageCount} pages; the first ${pageCount} were imported — the rest exceeded your PDF import limit.`,
              },
            ],
          },
        ],
      });
    }

    await writeProgress(jobId, {
      phase: 'finalizing',
      totalPages: pageCount,
      processedPages: pageCount,
      message: 'Building your page…',
    });

    // Create the destination page first: figure uploads need its id for
    // their storage path, and recording `resultPageId` now lets a retry
    // after a mid-run failure delete this half-built page.
    const sortAgg = await db.page.aggregate({
      where: { sectionId },
      _max: { sortOrder: true },
    });
    const page = await db.page.create({
      data: {
        sectionId,
        title: deriveTitle(job.fileName),
        pageType: 'text',
        content: EMPTY_DOC as unknown as Prisma.InputJsonValue,
        sortOrder: (sortAgg._max.sortOrder ?? -1) + 1,
      },
    });
    await db.importJob.update({ where: { id: jobId }, data: { resultPageId: page.id } });

    // Upload each figure crop and map its ref → served image URL.
    const imageSrcByRef: Record<string, string> = {};
    for (const crop of figureCrops) {
      const fileName = `${crop.ref}.png`;
      try {
        const { filePath } = await saveImage(page.id, fileName, crop.buffer);
        const image = await db.pageImage.create({
          data: {
            pageId: page.id,
            fileName,
            filePath,
            fileSize: crop.buffer.length,
            mimeType: 'image/png',
          },
        });
        imageSrcByRef[crop.ref] = `/api/uploads/images/${image.id}`;
      } catch (err) {
        console.error(`[pdf-import] job ${jobId}: figure upload failed for ${crop.ref}`, err);
      }
    }

    const { doc, truncated } = assembleTiptap({ blocks: allBlocks }, imageSrcByRef);

    // `textContent` mirrors the page for search + AI context. The verbatim
    // ground truth is the fullest source for a text-layer PDF; a scanned /
    // no-text-layer PDF yields little or none, so use whichever of the two
    // actually carries more text.
    const groundText = ground.pages
      .slice(0, pageCount)
      .map((p) => pageLinesToText(p))
      .filter((text) => text.length > 0)
      .join('\n\n');
    const docText = tiptapJsonToPlainText(doc) ?? '';
    const textContent = (groundText.length >= docText.length ? groundText : docText).slice(
      0,
      TEXT_CONTENT_LIMIT,
    );

    await db.page.update({
      where: { id: page.id },
      data: { content: doc as unknown as Prisma.InputJsonValue, textContent },
    });

    await db.importJob.update({
      where: { id: jobId },
      data: {
        status: 'ready',
        error: null,
        truncated: truncated || pageCapTruncated,
        fallbackPages,
        finishedAt: new Date(),
        progress: progressJson({
          phase: 'finalizing',
          totalPages: pageCount,
          processedPages: pageCount,
          message: 'Import complete.',
        }),
      },
    });

    // Meter the pages actually imported against the user's PDF-import
    // budget (FREE: a lifetime allowance; PRO: monthly). Charged only on
    // success, so a failed import costs the user nothing. Best-effort — a
    // metering write must never fail an import that already succeeded.
    await incrementUsage(job.userId, 'pdf_import', pageCount).catch((err) => {
      console.error(`[pdf-import] usage increment failed for job ${jobId}`, err);
    });

    succeeded = true;
  } catch (err) {
    const message =
      err instanceof ImportJobError
        ? err.message
        : 'Something went wrong while importing this PDF. Please try again.';
    if (!(err instanceof ImportJobError)) {
      console.error(`[pdf-import] job ${jobId} failed`, err);
    }
    await db.importJob
      .update({
        where: { id: jobId },
        data: { status: 'failed', error: message, finishedAt: new Date() },
      })
      .catch((updateErr) => {
        console.error(`[pdf-import] could not mark job ${jobId} failed`, updateErr);
      });
  } finally {
    // Temp uploads are kept on failure so "Try again" can re-run without a
    // re-upload; on success they are no longer needed.
    if (succeeded) {
      await deleteFile(pdfPath).catch(() => {});
      for (const path of pageImagePaths) {
        await deleteFile(path).catch(() => {});
      }
    }
  }
}
