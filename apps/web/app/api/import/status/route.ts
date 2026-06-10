import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

// GET /api/import/status?jobIds=a,b,c — aggregate progress for a multi-PDF
// import. The commit response hands the client the job ids; the creating
// screen polls this until every job is terminal (`done`). Plain polling,
// not SSE — the multi-job case is naturally an aggregate count.

const MAX_JOBS = 50;

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const idsParam = request.nextUrl.searchParams.get('jobIds') ?? '';
    const jobIds = idsParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, MAX_JOBS);
    if (jobIds.length === 0) {
      return badRequestResponse('No job ids provided.');
    }

    const jobs = await db.importJob.findMany({
      where: { id: { in: jobIds }, userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        notebookId: true,
        fileName: true,
        status: true,
        progress: true,
        resultPageId: true,
        truncated: true,
        fallbackPages: true,
        error: true,
      },
    });

    const ready = jobs.filter((job) => job.status === 'ready').length;
    const failed = jobs.filter((job) => job.status === 'failed').length;
    const processing = jobs.length - ready - failed;
    const done = jobs.length > 0 && processing === 0;

    return successResponse({ jobs, total: jobs.length, ready, failed, processing, done });
  } catch (error) {
    console.error('[multi-import] status failed', error);
    return internalErrorResponse();
  }
}
