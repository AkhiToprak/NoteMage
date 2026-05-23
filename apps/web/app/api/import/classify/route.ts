import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  tooManyRequestsResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { validateStoragePath, downloadFromStorage } from '@/lib/storage';
import { rateLimit, rateLimitKey } from '@/lib/rate-limit';
import { checkTokenBudget } from '@/lib/token-budget';
import { extractGroundTruth, type GroundTruth } from '@/lib/pdf-import/ground-truth';
import { detectSubjects, type SubjectDetectItem } from '@/lib/onboarding/subject-detect';
import { PRESETS, getPresetForSubject } from '@/lib/presets';

// POST /api/import/classify — stage two of the multi-PDF import flow.
// The client has already uploaded the raw PDFs to temp-imports/; this
// route samples each PDF's text layer, asks Gemini to group them by
// subject, assigns a color per group, and returns the proposed grouping
// for the user to confirm. Subject detection never hard-fails.

const MAX_FILES = 20;

interface ClassifyFile {
  pdfPath: string;
  fileName: string;
}

/** First few pages of verbatim text, capped — enough to classify a subject. */
function buildTextSample(ground: GroundTruth): string {
  const lines: string[] = [];
  for (const page of ground.pages.slice(0, 4)) {
    for (const line of page.lines) {
      const text = line.cells
        .map((cell) => cell.text)
        .join(' ')
        .trim();
      if (text) lines.push(text);
    }
    if (lines.join(' ').length > 1800) break;
  }
  return lines.join('\n').slice(0, 2000);
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const limit = await rateLimit(rateLimitKey('import-classify', request, userId), 10, 60_000);
    if (!limit.success) {
      return tooManyRequestsResponse(
        'Too many import requests. Please wait a moment and try again.',
        limit.retryAfterMs,
      );
    }

    // Classification is an AI (Gemini) call — gate it on the monthly token
    // budget like every other AI route so an over-budget account can't keep
    // firing it.
    const { allowed: tokenAllowed, tokenLimit } = await checkTokenBudget(userId);
    if (!tokenAllowed) {
      return tooManyRequestsResponse(
        `Monthly token limit reached (${tokenLimit.toLocaleString()} tokens). Resets on the 1st of next month.`,
      );
    }

    const body = await request.json().catch(() => ({}));
    const rawFiles: unknown = (body as { files?: unknown }).files;
    if (!Array.isArray(rawFiles) || rawFiles.length === 0) {
      return badRequestResponse('No files provided.');
    }
    if (rawFiles.length > MAX_FILES) {
      return badRequestResponse(`You can import up to ${MAX_FILES} PDFs at once.`);
    }

    const files: ClassifyFile[] = [];
    for (const entry of rawFiles) {
      const pdfPath = (entry as { pdfPath?: unknown }).pdfPath;
      const fileName = (entry as { fileName?: unknown }).fileName;
      if (typeof pdfPath !== 'string' || !validateStoragePath(pdfPath, 'temp-imports/')) {
        return badRequestResponse('Invalid file path.');
      }
      if (typeof fileName !== 'string' || fileName.trim().length === 0) {
        return badRequestResponse('Invalid file name.');
      }
      files.push({ pdfPath, fileName: fileName.trim().slice(0, 255) });
    }

    // Build a text sample per PDF. A PDF that cannot be read still gets a
    // group later — classification just has no text signal for it.
    const items: SubjectDetectItem[] = [];
    for (let i = 0; i < files.length; i++) {
      let textSample = '';
      try {
        const buffer = await downloadFromStorage(files[i].pdfPath);
        const ground = await extractGroundTruth(buffer);
        if (!ground.encrypted) textSample = buildTextSample(ground);
      } catch (err) {
        console.error(`[multi-import] classify: could not sample ${files[i].fileName}`, err);
      }
      items.push({ id: String(i), fileName: files[i].fileName, textSample });
    }

    const proposed = await detectSubjects(items);

    // Map the model's id-based groups back to file paths + assign a color:
    // a subject-themed preset color when the subject is recognised, else a
    // round-robin through the preset palette so cards stay visually distinct.
    const groups = proposed
      .map((group, index) => {
        const preset = getPresetForSubject(group.subject);
        const color = preset?.color ?? PRESETS[index % PRESETS.length].color;
        const pdfPaths = group.fileIds
          .map((id) => files[Number(id)]?.pdfPath)
          .filter((p): p is string => typeof p === 'string');
        return { name: group.name, subject: group.subject, color, pdfPaths };
      })
      .filter((group) => group.pdfPaths.length > 0);

    return successResponse({ groups });
  } catch (error) {
    console.error('[multi-import] classify failed', error);
    return internalErrorResponse();
  }
}
