import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  tooManyRequestsResponse,
  serviceUnavailableResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { validateStoragePath } from '@/lib/storage';
import { rateLimit, rateLimitKey } from '@/lib/rate-limit';
import { checkUsageLimit } from '@/lib/usage-limits';
import { engineForTier } from '@/lib/pdf-import/run-job';
import {
  runImportOrchestration,
  type OrchestratorFile,
  type OrchestratorGroup,
} from '@/lib/onboarding/import-orchestrator';

// POST /api/import/commit — final stage of the multi-PDF import flow.
// Takes the user-confirmed grouping, enforces the pdf_import page budget,
// then creates the notebooks/sections/ImportJobs and fires the workers.
// Usage is metered by each worker on success — this route only gates.

const MAX_GROUPS = 20;
const MAX_FILES = 20;
const MAX_PAGE_IMAGES = 1000;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const limit = await rateLimit(rateLimitKey('import-commit', request, userId), 10, 60_000);
    if (!limit.success) {
      return tooManyRequestsResponse(
        'Too many import requests. Please wait a moment and try again.',
        limit.retryAfterMs,
      );
    }

    const body = await request.json().catch(() => ({}));
    const rawGroups: unknown = (body as { groups?: unknown }).groups;
    const folderIdRaw = (body as { folderId?: unknown }).folderId;
    const folderId =
      typeof folderIdRaw === 'string' && folderIdRaw.length > 0 ? folderIdRaw : null;

    if (!Array.isArray(rawGroups) || rawGroups.length === 0) {
      return badRequestResponse('No notebooks to create.');
    }
    if (rawGroups.length > MAX_GROUPS) {
      return badRequestResponse(`You can create up to ${MAX_GROUPS} notebooks at once.`);
    }

    const groups: OrchestratorGroup[] = [];
    let totalFiles = 0;

    for (const rawGroup of rawGroups) {
      const g = rawGroup as {
        name?: unknown;
        subject?: unknown;
        color?: unknown;
        files?: unknown;
      };
      const name = typeof g.name === 'string' ? g.name.trim() : '';
      if (!name || name.length > 100) {
        return badRequestResponse('Each notebook needs a name of 1–100 characters.');
      }
      const subject = typeof g.subject === 'string' ? g.subject.trim().slice(0, 100) : '';
      const color = typeof g.color === 'string' && HEX_COLOR.test(g.color) ? g.color : '#8c52ff';

      if (!Array.isArray(g.files) || g.files.length === 0) {
        return badRequestResponse(`"${name}" has no files.`);
      }

      const files: OrchestratorFile[] = [];
      for (const rawFile of g.files) {
        const f = rawFile as {
          pdfPath?: unknown;
          fileName?: unknown;
          pageImagePaths?: unknown;
        };
        if (typeof f.pdfPath !== 'string' || !validateStoragePath(f.pdfPath, 'temp-imports/')) {
          return badRequestResponse('Invalid file path.');
        }
        if (typeof f.fileName !== 'string' || f.fileName.trim().length === 0) {
          return badRequestResponse('Invalid file name.');
        }
        if (
          !Array.isArray(f.pageImagePaths) ||
          f.pageImagePaths.length === 0 ||
          f.pageImagePaths.length > MAX_PAGE_IMAGES
        ) {
          return badRequestResponse('Invalid page images.');
        }
        const pageImagePaths: string[] = [];
        for (const p of f.pageImagePaths) {
          if (typeof p !== 'string' || !validateStoragePath(p, 'temp-imports/')) {
            return badRequestResponse('Invalid page image path.');
          }
          pageImagePaths.push(p);
        }
        files.push({
          pdfPath: f.pdfPath,
          fileName: f.fileName.trim().slice(0, 255),
          pageImagePaths,
        });
        totalFiles += 1;
      }

      groups.push({ name: name.slice(0, 100), subject, color, files });
    }

    if (totalFiles > MAX_FILES) {
      return badRequestResponse(`You can import up to ${MAX_FILES} PDFs at once.`);
    }

    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { tier: true },
    });

    const engine = engineForTier(user.tier);
    if (!engine.isConfigured()) {
      console.error('[multi-import] structure engine not configured — refusing commit');
      return serviceUnavailableResponse(
        'PDF import is temporarily unavailable. Please try again later.',
      );
    }

    // Validate the chosen folder belongs to the caller before any creation.
    if (folderId) {
      const folder = await db.notebookFolder.findFirst({
        where: { id: folderId, userId },
        select: { id: true },
      });
      if (!folder) return badRequestResponse('Folder not found.');
    }

    // Page-budget gate (FREE: lifetime allowance, PRO: monthly). The
    // orchestrator spends `pageBudget` greedily across the PDFs.
    const usage = await checkUsageLimit(userId, 'pdf_import');
    const pageBudget =
      usage.limit === -1 ? Number.POSITIVE_INFINITY : usage.limit - usage.used;
    if (pageBudget <= 0) {
      return tooManyRequestsResponse(
        user.tier === 'FREE'
          ? 'You have used your free PDF import allowance. Upgrade to Pro to import more.'
          : 'You have reached your monthly PDF import limit. It resets at the start of next month.',
      );
    }

    const result = await runImportOrchestration({
      userId,
      folderId,
      groups,
      engineName: engine.name,
      pageBudget,
    });

    return createdResponse(result);
  } catch (error) {
    console.error('[multi-import] commit failed', error);
    return internalErrorResponse();
  }
}
