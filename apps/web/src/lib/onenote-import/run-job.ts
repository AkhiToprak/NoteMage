// Phase 2 of the OneNote-import plan — the background handler.
//
// `runOneNoteImportJob` is a structural twin of `runPdfImportJob`: the
// (Phase 4) `POST /api/import/onenote/import` route persists a `queued`
// `ImportJob` row, queues a durable `BackgroundJob`, and returns at once
// while the client watches progress over the SSE route (Phase 3). Access is
// free — the deliberate divergence from the PDF
// worker is that nothing is metered; an anti-abuse page cap stands in for
// the usage budget.
//
// Like `runPdfImportJob`, this function NEVER throws — a missing/invalid
// job is logged, an up-front connection failure lands as `status:"failed"`
// with the friendly MSAL message, and per-section/per-page failures are
// collected into `resultSummary.errors[]` while the import continues.
// Partial success is still `status:"ready"`.
//
// It runs the same per-section/per-page logic the old synchronous route had
// (cheerio HTML→TipTap converter + SSRF-guarded image download) plus three
// fixes the sync route lacked:
//   1. Image-URL bug — images are mapped to the canonical served URL
//      `/api/uploads/images/<pageImage.id>` (the old `/api/images/...` 404'd).
//   2. Graph pagination — both the page-count pre-pass and the import loop
//      follow `@odata.nextLink`, so sections with >20 pages import fully.
//   3. Anti-abuse cap — a shared counter across all selected sections stops
//      the import at `pageCap` and flags the job `truncated`.

import { Prisma } from '@prisma/client';
import { Client } from '@microsoft/microsoft-graph-client';
import { db } from '@/lib/db';
import { getValidAccessToken } from '@/lib/microsoftAuth';
import { onenoteHtmlToTipTapJSON, onenoteHtmlToPlainText } from '@/lib/onenoteConverter';
import { saveImage } from '@/lib/storage';

/**
 * Hard ceiling on pages imported in a single OneNote job, across every
 * selected section. Access is free, so this — not a usage budget — is the
 * anti-abuse backstop. The trigger route (Phase 4) clamps the job's
 * `pageCap` to this value; the worker re-clamps defensively.
 */
export const MAX_ONENOTE_PAGES = 200;

/** Graph page-list page size (OneNote `$top` max is 100; default is 20). */
const GRAPH_LIST_PAGE_SIZE = 100;

/** Per-image download caps — mirror the old sync route's SSRF guard. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 15_000;

/** Progress snapshot written to `ImportJob.progress` and relayed over SSE. */
export interface OneNoteImportProgress {
  phase: 'listing' | 'importing';
  totalPages: number;
  processedPages: number;
  message: string;
}

/** Shape persisted to `ImportJob.resultSummary` and read by the modal. */
interface OneNoteResultSummary {
  sectionsImported: number;
  pagesImported: number;
  errors: string[];
  firstSectionId: string | null;
  firstPageId: string | null;
}

/** Minimal projection of a Graph OneNote page list entry. */
interface OneNotePageMeta {
  id: string;
  title?: string;
  createdDateTime?: string;
}

/** Minimal projection of a Graph OneNote section. */
interface OneNoteSectionInfo {
  id: string;
  displayName?: string;
}

/** A paginated Graph list response. */
interface GraphListResponse<T> {
  value?: T[];
  '@odata.nextLink'?: string;
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

function progressJson(progress: OneNoteImportProgress): Prisma.InputJsonValue {
  return progress as unknown as Prisma.InputJsonValue;
}

/** Best-effort progress write — a failed write must not abort the import. */
async function writeProgress(jobId: string, progress: OneNoteImportProgress): Promise<void> {
  await db.importJob
    .update({ where: { id: jobId }, data: { progress: progressJson(progress) } })
    .catch((err) => {
      console.error(`[onenote-import] progress write failed for job ${jobId}`, err);
    });
}

/** OneNote image resources live only on these hosts; anything else is SSRF. */
function isAllowedOneNoteImageUrl(url: string): boolean {
  return (
    url.startsWith('https://graph.microsoft.com/') || url.startsWith('https://www.onenote.com/')
  );
}

/** Pick a file extension from the response content type. */
function extFromContentType(contentType: string): string {
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('webp')) return 'webp';
  return 'png';
}

/**
 * Extract OneNote image resource URLs from a page's HTML. OneNote emits both
 * `src` (display) and `data-fullres-src` (full resolution); we collect both
 * and dedupe, keeping only Graph/OneNote-hosted URLs (the SSRF allow-list).
 */
function extractImageUrls(html: string): string[] {
  const urls: string[] = [];
  const regex = /(?:src|data-fullres-src)=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    if (match[1] && isAllowedOneNoteImageUrl(match[1])) {
      urls.push(match[1]);
    }
  }
  return [...new Set(urls)];
}

/**
 * Count the pages in a OneNote section, following `@odata.nextLink`, but stop
 * the moment the running count passes `stopAfter` — the pre-pass only needs
 * min(total, cap) and whether the cap was exceeded, so counting a huge
 * section to the end would be wasted Graph calls.
 */
async function countOneNotePages(
  client: Client,
  onenoteSectionId: string,
  stopAfter: number,
): Promise<number> {
  let count = 0;
  let response = (await client
    .api(`/me/onenote/sections/${onenoteSectionId}/pages`)
    .select('id')
    .top(GRAPH_LIST_PAGE_SIZE)
    .get()) as GraphListResponse<OneNotePageMeta>;
  while (true) {
    count += response.value?.length ?? 0;
    if (count > stopAfter) return count;
    const next = response['@odata.nextLink'];
    if (!next) break;
    response = (await client.api(next).get()) as GraphListResponse<OneNotePageMeta>;
  }
  return count;
}

/**
 * Yield every page in a OneNote section, following `@odata.nextLink` so
 * sections with more than one Graph page of results stream fully. The first
 * request carries the `$select`/`$orderby`/`$top` query; subsequent requests
 * use the absolute `nextLink` (which already encodes the query + skiptoken).
 * Streaming (rather than collecting) lets the caller stop at the cap without
 * paginating a huge section to the end.
 */
async function* iterateOneNotePages(
  client: Client,
  onenoteSectionId: string,
): AsyncGenerator<OneNotePageMeta> {
  let response = (await client
    .api(`/me/onenote/sections/${onenoteSectionId}/pages`)
    .select('id,title,createdDateTime')
    .orderby('createdDateTime')
    .top(GRAPH_LIST_PAGE_SIZE)
    .get()) as GraphListResponse<OneNotePageMeta>;
  while (true) {
    for (const page of response.value ?? []) yield page;
    const next = response['@odata.nextLink'];
    if (!next) break;
    response = (await client.api(next).get()) as GraphListResponse<OneNotePageMeta>;
  }
}

/**
 * Download one OneNote image resource and persist it as a `PageImage`,
 * returning the canonical served URL (the Blocker #2 fix). SSRF-guarded:
 * Graph/OneNote hosts only, manual redirect (legitimate resources don't
 * redirect), a 15s timeout, and a 10MB cap checked both via Content-Length
 * and the actual body. Returns null when the resource is disallowed, too
 * large, or unreachable; throwing is left to the caller's per-image catch.
 */
async function downloadAndStoreImage(
  imgUrl: string,
  accessToken: string,
  pageId: string,
): Promise<string | null> {
  if (!isAllowedOneNoteImageUrl(imgUrl)) return null;

  const response = await fetch(imgUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    redirect: 'manual',
    signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
  });
  // Reject redirects too — legitimate Graph resources return 200 directly.
  if (!response.ok || response.status >= 300) return null;

  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_BYTES) return null;

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_IMAGE_BYTES) return null;

  const contentType = response.headers.get('content-type') || 'image/png';
  const fileName = `onenote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extFromContentType(contentType)}`;

  const { filePath } = await saveImage(pageId, fileName, buffer);
  const pageImage = await db.pageImage.create({
    data: {
      pageId,
      fileName,
      filePath,
      fileSize: buffer.length,
      mimeType: contentType,
      sourceType: 'onenote',
    },
  });
  return `/api/uploads/images/${pageImage.id}`;
}

/**
 * Run a queued OneNote `ImportJob` to completion. Loads the job, resolves a
 * valid Graph token, counts the selectable pages (capped) for the progress
 * denominator, then imports each selected section's pages — converting HTML
 * to Tiptap, downloading images, and writing progress after every page.
 *
 * Never throws: a missing/invalid job is logged, an up-front connection
 * failure lands as `status:"failed"` with the friendly message, and
 * per-item failures are collected without aborting the run.
 */
export async function runOneNoteImportJob(jobId: string): Promise<void> {
  const job = await db.importJob.findUnique({ where: { id: jobId } }).catch((err) => {
    console.error(`[onenote-import] could not load job ${jobId}`, err);
    return null;
  });
  if (!job) {
    console.error(`[onenote-import] job ${jobId} not found`);
    return;
  }

  // The shared `ImportJob` row stores the selected OneNote sections as Json;
  // narrow it to a clean string[]. A job with no valid sections can't be
  // processed, so fail it cleanly rather than spin.
  const sectionIds = Array.isArray(job.oneNoteSectionIds)
    ? job.oneNoteSectionIds.filter((s): s is string => typeof s === 'string')
    : [];
  if (sectionIds.length === 0) {
    console.error(`[onenote-import] job ${jobId} has no OneNote section ids`);
    await db.importJob
      .update({
        where: { id: jobId },
        data: {
          status: 'failed',
          error: 'No OneNote sections were selected for this import. Please try again.',
          finishedAt: new Date(),
        },
      })
      .catch(() => {});
    return;
  }

  const notebookId = job.notebookId;
  const pageCap = Math.max(1, Math.min(job.pageCap || MAX_ONENOTE_PAGES, MAX_ONENOTE_PAGES));

  try {
    await db.importJob.update({
      where: { id: jobId },
      data: {
        status: 'processing',
        startedAt: new Date(),
        error: null,
        progress: progressJson({
          phase: 'listing',
          totalPages: 0,
          processedPages: 0,
          message: 'Loading your OneNote sections…',
        }),
      },
    });

    // Fail fast on a missing/expired connection — `getValidAccessToken`
    // already returns user-facing messages ("Please reconnect…").
    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(job.userId);
    } catch (err) {
      throw new ImportJobError(
        err instanceof Error ? err.message : 'Could not connect to your Microsoft account.',
      );
    }

    const client = Client.init({ authProvider: (done) => done(null, accessToken) });

    // Pre-pass: count selectable pages for the progress denominator, capped.
    // We only need min(total, cap) and whether total exceeds cap. A section
    // that errors here is ignored — the import loop below reports it.
    let totalAvailable = 0;
    for (const onenoteSectionId of sectionIds) {
      try {
        totalAvailable += await countOneNotePages(
          client,
          onenoteSectionId,
          pageCap - totalAvailable,
        );
      } catch (err) {
        console.error(
          `[onenote-import] job ${jobId}: page count failed for section ${onenoteSectionId}`,
          err,
        );
      }
      if (totalAvailable > pageCap) break;
    }
    const totalPages = Math.min(totalAvailable, pageCap);
    // Truncation is real iff more pages exist than the cap admits. The
    // import loop's mid-section break corrects this in real time if a section
    // grew between the pre-pass and the import.
    const willTruncate = totalAvailable > pageCap;

    await writeProgress(jobId, {
      phase: 'importing',
      totalPages,
      processedPages: 0,
      message: totalPages > 0 ? `Importing ${totalPages} page${totalPages === 1 ? '' : 's'}…` : 'Importing…',
    });

    // Sections are appended after the notebook's existing top-level sections.
    const maxSectionOrder = await db.section.aggregate({
      where: { notebookId, parentId: null },
      _max: { sortOrder: true },
    });
    let sectionSortOrder = (maxSectionOrder._max.sortOrder ?? -1) + 1;

    // `processed` counts every page we attempt (success or failure): it drives
    // both the progress numerator and the anti-abuse cap, so a section full of
    // failing pages can't blow past the cap. `pagesImported` counts successes
    // only, for the summary.
    let processed = 0;
    let pagesImported = 0;
    let sectionsImported = 0;
    let truncated = willTruncate;
    let firstSectionId: string | null = null;
    let firstPageId: string | null = null;
    const errors: string[] = [];

    for (const onenoteSectionId of sectionIds) {
      // Cap already consumed — stop before creating an empty section. This is
      // not itself a truncation signal (the remaining sections may be empty);
      // `willTruncate` and the mid-section break below are the real signals.
      if (processed >= pageCap) break;

      let notemageSection: { id: string; title: string };
      try {
        const sectionInfo = (await client
          .api(`/me/onenote/sections/${onenoteSectionId}`)
          .select('id,displayName')
          .get()) as OneNoteSectionInfo;
        notemageSection = await db.section.create({
          data: {
            notebookId,
            title: sectionInfo.displayName || 'Imported Section',
            sortOrder: sectionSortOrder++,
          },
        });
      } catch (sectionErr) {
        console.error(
          `[onenote-import] job ${jobId}: failed to create section ${onenoteSectionId}`,
          sectionErr,
        );
        errors.push('A section could not be imported.');
        continue;
      }

      if (!firstSectionId) firstSectionId = notemageSection.id;
      sectionsImported++;
      let pageSortOrder = 0;

      try {
        for await (const onenotePage of iterateOneNotePages(client, onenoteSectionId)) {
          if (processed >= pageCap) {
            truncated = true;
            break;
          }
          processed++;

          try {
            const pageContent = (await client
              .api(`/me/onenote/pages/${onenotePage.id}/content`)
              .get()) as string;

            // First pass: convert without images so the page exists and has
            // its text mirror. Images need the page id, so they follow.
            const content = await onenoteHtmlToTipTapJSON(pageContent);
            const textContent = onenoteHtmlToPlainText(pageContent);

            const page = await db.page.create({
              data: {
                sectionId: notemageSection.id,
                title: onenotePage.title || 'Untitled',
                content: content as unknown as Prisma.InputJsonValue,
                textContent: textContent || '',
                sortOrder: pageSortOrder++,
              },
            });
            if (!firstPageId) firstPageId = page.id;

            // Download images, mapping each source URL to its canonical served
            // URL, then re-convert so the Tiptap doc references the stored
            // images. Per-image failures are skipped silently.
            const imageUrls = extractImageUrls(pageContent);
            if (imageUrls.length > 0) {
              const imageMap = new Map<string, string>();
              for (const imgUrl of imageUrls) {
                try {
                  const servedUrl = await downloadAndStoreImage(imgUrl, accessToken, page.id);
                  if (servedUrl) imageMap.set(imgUrl, servedUrl);
                } catch (imgErr) {
                  console.error(`[onenote-import] job ${jobId}: image download failed`, imgErr);
                }
              }
              if (imageMap.size > 0) {
                const updatedContent = await onenoteHtmlToTipTapJSON(
                  pageContent,
                  async (url) => imageMap.get(url) ?? null,
                );
                await db.page.update({
                  where: { id: page.id },
                  data: { content: updatedContent as unknown as Prisma.InputJsonValue },
                });
              }
            }

            pagesImported++;
          } catch (pageErr) {
            const pageTitle = onenotePage.title || onenotePage.id;
            console.error(
              `[onenote-import] job ${jobId}: failed to import page "${pageTitle}"`,
              pageErr,
            );
            errors.push(`Failed to import page "${pageTitle}".`);
          }

          const shown = Math.min(processed, totalPages);
          await writeProgress(jobId, {
            phase: 'importing',
            totalPages,
            processedPages: shown,
            message: `Importing page ${shown} of ${totalPages}…`,
          });
        }
      } catch (listErr) {
        // The page list / pagination failed mid-section. The section row and
        // any pages imported before the failure are kept.
        console.error(
          `[onenote-import] job ${jobId}: failed to list pages for section ${onenoteSectionId}`,
          listErr,
        );
        errors.push(`Some pages in "${notemageSection.title}" could not be imported.`);
      }
    }

    const resultSummary: OneNoteResultSummary = {
      sectionsImported,
      pagesImported,
      errors,
      firstSectionId,
      firstPageId,
    };

    await db.importJob.update({
      where: { id: jobId },
      data: {
        status: 'ready',
        error: null,
        truncated,
        resultSummary: resultSummary as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(),
        progress: progressJson({
          phase: 'importing',
          totalPages,
          processedPages: totalPages,
          message: 'Import complete.',
        }),
      },
    });
  } catch (err) {
    const message =
      err instanceof ImportJobError
        ? err.message
        : 'Something went wrong while importing from OneNote. Please try again.';
    if (!(err instanceof ImportJobError)) {
      console.error(`[onenote-import] job ${jobId} failed`, err);
    }
    await db.importJob
      .update({
        where: { id: jobId },
        data: { status: 'failed', error: message, finishedAt: new Date() },
      })
      .catch((updateErr) => {
        console.error(`[onenote-import] could not mark job ${jobId} failed`, updateErr);
      });
  }
}
