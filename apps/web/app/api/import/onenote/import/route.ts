import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { Client } from '@microsoft/microsoft-graph-client';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { getValidAccessToken } from '@/lib/microsoftAuth';
import { onenoteHtmlToTipTapJSON, onenoteHtmlToPlainText } from '@/lib/onenoteConverter';
import { saveImage } from '@/lib/storage';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

/**
 * POST – import OneNote sections into a Notemage notebook
 * Body: { targetNotebookId: string, sectionIds: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = await request.json().catch(() => ({}));
    const { targetNotebookId, sectionIds } = body as {
      targetNotebookId?: string;
      sectionIds?: string[];
    };

    if (!targetNotebookId || !sectionIds || !Array.isArray(sectionIds) || sectionIds.length === 0) {
      return badRequestResponse('targetNotebookId and sectionIds are required');
    }

    // Verify Notemage notebook ownership
    const notebook = await db.notebook.findFirst({
      where: { id: targetNotebookId, userId },
    });
    if (!notebook) return notFoundResponse('Notebook not found');

    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Not connected';
      return badRequestResponse(message);
    }

    const client = Client.init({
      authProvider: (done) => done(null, accessToken),
    });

    let sectionsImported = 0;
    let pagesImported = 0;
    const errors: string[] = [];

    // Get current max sort order for sections in the notebook
    const maxSectionOrder = await db.section.aggregate({
      where: { notebookId: targetNotebookId, parentId: null },
      _max: { sortOrder: true },
    });
    let sectionSortOrder = (maxSectionOrder._max.sortOrder ?? -1) + 1;

    for (const onenoteSectionId of sectionIds) {
      try {
        // Fetch section details
        const sectionInfo = await client
          .api(`/me/onenote/sections/${onenoteSectionId}`)
          .select('id,displayName')
          .get();

        // Create a Notemage section
        const notemageSection = await db.section.create({
          data: {
            notebookId: targetNotebookId,
            title: sectionInfo.displayName || 'Imported Section',
            sortOrder: sectionSortOrder++,
          },
        });

        // Fetch pages in this section
        const pagesResponse = await client
          .api(`/me/onenote/sections/${onenoteSectionId}/pages`)
          .select('id,title,createdDateTime')
          .orderby('createdDateTime')
          .get();

        const pages = pagesResponse.value || [];
        let pageSortOrder = 0;

        for (const onenotePage of pages) {
          try {
            // Fetch page content (HTML)
            const pageContent: string = await client
              .api(`/me/onenote/pages/${onenotePage.id}/content`)
              .get();

            // Create an image downloader that uses the Graph API access token
            const imageDownloader = async (url: string): Promise<string | null> => {
              try {
                // Only download from Microsoft Graph API URLs
                if (
                  !url.startsWith('https://graph.microsoft.com/') &&
                  !url.startsWith('https://www.onenote.com/')
                ) {
                  return null;
                }
                const imgResponse = await fetch(url, {
                  headers: { Authorization: `Bearer ${accessToken}` },
                });
                if (!imgResponse.ok) return null;
                const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
                const contentType = imgResponse.headers.get('content-type') || 'image/png';
                const ext =
                  contentType.includes('jpeg') || contentType.includes('jpg')
                    ? 'jpg'
                    : contentType.includes('gif')
                      ? 'gif'
                      : contentType.includes('webp')
                        ? 'webp'
                        : 'png';
                const fileName = `onenote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

                // Save image — we'll create the page first, then use a placeholder pageId
                // Actually, we need the page ID first. We'll create the page, then download images.
                // For now, return the URL and we'll handle it after page creation.
                return url; // placeholder — see below
              } catch {
                return null;
              }
            };

            // Convert HTML to TipTap JSON (first pass without actual image downloads)
            const content = await onenoteHtmlToTipTapJSON(pageContent);
            const textContent = onenoteHtmlToPlainText(pageContent);

            // Create the page
            const page = await db.page.create({
              data: {
                sectionId: notemageSection.id,
                title: onenotePage.title || 'Untitled',
                content: content as unknown as Prisma.InputJsonValue,
                textContent: textContent || '',
                sortOrder: pageSortOrder++,
              },
            });

            // Now download and save images, updating the page content
            const imageUrls = extractImageUrls(pageContent);
            if (imageUrls.length > 0) {
              const imageMap = new Map<string, string>();

              for (const imgUrl of imageUrls) {
                try {
                  if (
                    !imgUrl.startsWith('https://graph.microsoft.com/') &&
                    !imgUrl.startsWith('https://www.onenote.com/')
                  ) {
                    continue;
                  }
                  const imgResponse = await fetch(imgUrl, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    redirect: 'manual', // Prevent SSRF via redirect to internal URLs
                    signal: AbortSignal.timeout(15_000), // 15s timeout per image
                  });
                  // Reject redirects — legitimate Graph API images don't redirect
                  if (!imgResponse.ok || imgResponse.status >= 300) continue;

                  // Check Content-Length before downloading body
                  const contentLength = imgResponse.headers.get('content-length');
                  if (contentLength && parseInt(contentLength, 10) > 10 * 1024 * 1024) continue; // Skip >10MB

                  const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
                  if (imgBuffer.length > 10 * 1024 * 1024) continue; // Double-check actual size
                  const contentType = imgResponse.headers.get('content-type') || 'image/png';
                  const ext =
                    contentType.includes('jpeg') || contentType.includes('jpg')
                      ? 'jpg'
                      : contentType.includes('gif')
                        ? 'gif'
                        : contentType.includes('webp')
                          ? 'webp'
                          : 'png';
                  const fileName = `onenote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

                  const { filePath } = await saveImage(page.id, fileName, imgBuffer);

                  await db.pageImage.create({
                    data: {
                      pageId: page.id,
                      fileName,
                      filePath,
                      fileSize: imgBuffer.length,
                      mimeType: contentType,
                    },
                  });

                  imageMap.set(imgUrl, `/api/images/${page.id}/${fileName}`);
                } catch {
                  // Skip failed images silently
                }
              }

              // Re-convert with actual image paths if we downloaded any
              if (imageMap.size > 0) {
                const updatedContent = await onenoteHtmlToTipTapJSON(pageContent, async (url) => {
                  return imageMap.get(url) || null;
                });
                await db.page.update({
                  where: { id: page.id },
                  data: { content: updatedContent as unknown as Prisma.InputJsonValue },
                });
              }
            }

            pagesImported++;
          } catch (pageError) {
            const pageTitle = onenotePage.title || onenotePage.id;
            console.error(`[OneNote Import] Failed to import page "${pageTitle}":`, pageError);
            errors.push(`Failed to import page "${pageTitle}"`);
          }
        }

        sectionsImported++;
      } catch (sectionError) {
        console.error(
          `[OneNote Import] Failed to import section ${onenoteSectionId}:`,
          sectionError
        );
        errors.push(`Failed to import section ${onenoteSectionId}`);
      }
    }

    return successResponse({
      sectionsImported,
      pagesImported,
      errors,
    });
  } catch (error) {
    console.error('[OneNote Import] Error:', error);
    return internalErrorResponse();
  }
}

/**
 * Extract all image URLs from OneNote HTML.
 */
function extractImageUrls(html: string): string[] {
  const urls: string[] = [];
  const regex = /(?:src|data-fullres-src)=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    if (
      match[1] &&
      (match[1].startsWith('https://graph.microsoft.com/') ||
        match[1].startsWith('https://www.onenote.com/'))
    ) {
      urls.push(match[1]);
    }
  }
  return [...new Set(urls)];
}
