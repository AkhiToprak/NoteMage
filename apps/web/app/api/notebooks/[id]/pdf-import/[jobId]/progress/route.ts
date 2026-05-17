import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';

// P5 — SSE stream for PDF-import progress. Structural copy of
// `app/api/learn/paths/[planId]/generation/route.ts`.
//
// Wire format (Server-Sent Events):
//   event: progress
//   data: { status, progress: { phase, totalPages, processedPages, message } | null }
//
//   event: done
//   data: { pageId, truncated }
//
//   event: error
//   data: { message }
//
// `runPdfImportJob` writes `ImportJob.progress` after each page. This
// handler polls the row every 500ms, diffs against the last snapshot,
// and emits a `progress` event whenever something changed. Stateless —
// a client connecting mid-import gets the current snapshot immediately.
//
// A `processing`/`queued` job whose `updatedAt` has gone stale was
// almost certainly killed by a redeploy: the detached worker is not
// durable. The handler flags such a job `failed` and emits `error` so
// the user can retry.

type Params = { params: Promise<{ id: string; jobId: string }> };

interface ProgressPayload {
  phase: string;
  totalPages: number;
  processedPages: number;
  message: string;
}

interface SnapshotEnvelope {
  status: string;
  progress: ProgressPayload | null;
}

function readSnapshot(status: string, progress: unknown): SnapshotEnvelope {
  return {
    status,
    progress: (progress as ProgressPayload | null) ?? null,
  };
}

const POLL_INTERVAL_MS = 500;
/** A `processing` job idle longer than this is treated as redeploy-killed. */
const STALE_AFTER_MS = 10 * 60_000;

export async function GET(request: NextRequest, { params }: Params) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id: notebookId, jobId } = await params;

  const initial = await db.importJob.findFirst({
    where: { id: jobId, notebookId, userId },
    select: {
      id: true,
      status: true,
      progress: true,
      error: true,
      resultPageId: true,
      truncated: true,
      updatedAt: true,
    },
  });
  if (!initial) {
    return new Response('Not found', { status: 404 });
  }

  const encoder = new TextEncoder();
  const sseEvent = (event: string, data: unknown) =>
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      let cancelled = false;
      const onAbort = () => {
        cancelled = true;
      };
      request.signal.addEventListener('abort', onAbort);

      try {
        // Initial snapshot — emit immediately so a reconnecting client
        // sees current state without waiting for the first tick.
        const initialSnap = readSnapshot(initial.status, initial.progress);
        controller.enqueue(sseEvent('progress', initialSnap));
        let lastSnap = JSON.stringify(initialSnap);

        if (initial.status === 'ready') {
          controller.enqueue(
            sseEvent('done', { pageId: initial.resultPageId, truncated: initial.truncated }),
          );
          controller.close();
          return;
        }
        if (initial.status === 'failed') {
          controller.enqueue(sseEvent('error', { message: initial.error ?? 'Import failed' }));
          controller.close();
          return;
        }

        // Poll loop.
        while (!cancelled) {
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
          if (cancelled) break;

          const row = await db.importJob.findFirst({
            where: { id: jobId, notebookId, userId },
            select: {
              status: true,
              progress: true,
              error: true,
              resultPageId: true,
              truncated: true,
              updatedAt: true,
            },
          });
          if (!row) {
            controller.enqueue(sseEvent('error', { message: 'This import no longer exists.' }));
            break;
          }

          // Stale unfinished job — the worker was killed by a redeploy.
          if (
            (row.status === 'processing' || row.status === 'queued') &&
            Date.now() - row.updatedAt.getTime() > STALE_AFTER_MS
          ) {
            const message = 'The server restarted while importing. Please try again.';
            await db.importJob
              .update({ where: { id: jobId }, data: { status: 'failed', error: message } })
              .catch(() => {
                /* best-effort — the error event below is what matters */
              });
            controller.enqueue(sseEvent('error', { message }));
            break;
          }

          const snap = readSnapshot(row.status, row.progress);
          const snapStr = JSON.stringify(snap);
          if (snapStr !== lastSnap) {
            controller.enqueue(sseEvent('progress', snap));
            lastSnap = snapStr;
          }

          if (row.status === 'ready') {
            controller.enqueue(
              sseEvent('done', { pageId: row.resultPageId, truncated: row.truncated }),
            );
            break;
          }
          if (row.status === 'failed') {
            controller.enqueue(sseEvent('error', { message: row.error ?? 'Import failed' }));
            break;
          }
        }
      } catch (error) {
        console.error('[pdf-import progress SSE]', error);
        try {
          controller.enqueue(sseEvent('error', { message: 'Server error' }));
        } catch {
          /* controller may already be closed */
        }
      } finally {
        request.signal.removeEventListener('abort', onAbort);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
