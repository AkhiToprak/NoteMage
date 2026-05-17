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
import type { TierKey } from '@/lib/tiers';
import { assembleTiptap } from './assemble';
import type { DocModelBlock } from './doc-model';
import type { PdfStructureEngine } from './engine';
import { geminiEngine } from './engine-gemini';
import { cropFigure } from './figure-crop';
import { extractGroundTruth, type GroundTruth, type GroundTruthPage } from './ground-truth';
import { groundTruthToBlocks } from './heuristic-fallback';

/** Page-content mirror cap — the page-content route hard-rejects over 500KB. */
const TEXT_CONTENT_LIMIT = 500_000;

/** Placeholder document for the page row while the worker fills it in. */
const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

/**
 * Pages processed per PDF, by tier. A fair volume limit — not a quality
 * difference — and the primary cost lever (each page is one LLM call).
 * Exceeding it does not hard-reject: the worker imports up to the cap and
 * appends an inline notice.
 */
const PAGE_CAP_BY_TIER: Record<TierKey, number> = {
  FREE: 15,
  PLUS: 50,
  PRO: 150,
};

/** One structure engine per tier — the seam for a future paid/free split. */
const ENGINE_BY_TIER: Record<TierKey, PdfStructureEngine> = {
  FREE: geminiEngine,
  PLUS: geminiEngine,
  PRO: geminiEngine,
};

/** Per-tier page cap for a single PDF import. */
export function pageCapForTier(tier: TierKey): number {
  return PAGE_CAP_BY_TIER[tier] ?? PAGE_CAP_BY_TIER.FREE;
}

/**
 * The structure engine for a tier. One engine serves every tier today;
 * the P7 corpus decides whether PLUS/PRO move to a second engine, and if
 * so this single function is the only place that changes.
 */
export function engineForTier(tier: TierKey): PdfStructureEngine {
  return ENGINE_BY_TIER[tier] ?? geminiEngine;
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
      pdfBuffer = await downloadFromStorage(job.pdfPath);
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
    const engine = engineForTier(job.user.tier);

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
      } else {
        try {
          blocks = await engine.describePage({
            pageImageBase64: pngBuffer.toString('base64'),
            mimeType: 'image/png',
            groundTruthText: pageLinesToText(gtPage),
            isScanned: !ground.hasTextLayer,
            pageNumber: gtPage.pageNumber,
          });
        } catch (err) {
          console.error(
            `[pdf-import] job ${jobId} page ${i + 1}: engine fell back to heuristic`,
            err,
          );
          blocks = groundTruthToBlocks(gtPage);
          fallbackPages += 1;
        }

        // Crop every figure the engine boxed while the page PNG is in hand.
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

    // Pages past the per-tier cap are dropped; say so inline.
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
                text: `This PDF has ${ground.pageCount} pages; only the first ${pageCount} could be imported.`,
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
      where: { sectionId: job.sectionId },
      _max: { sortOrder: true },
    });
    const page = await db.page.create({
      data: {
        sectionId: job.sectionId,
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
    // ground truth is the fullest source; a scanned PDF has none, so fall
    // back to the assembled document's plain text.
    const groundText = ground.pages
      .slice(0, pageCount)
      .map((p) => pageLinesToText(p))
      .filter((text) => text.length > 0)
      .join('\n\n');
    const textContent = (groundText || tiptapJsonToPlainText(doc) || '').slice(
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
      await deleteFile(job.pdfPath).catch(() => {});
      for (const path of pageImagePaths) {
        await deleteFile(path).catch(() => {});
      }
    }
  }
}
