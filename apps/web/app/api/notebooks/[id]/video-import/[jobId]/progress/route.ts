import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { refundUsage } from '@/lib/usage-limits';
import { VIDEO_STALE_AFTER_MS } from '@/lib/video-import/staleness';
import { minutesForDuration } from '@/lib/video-import/submit';

// P3 — SSE stream for video-import progress. Structural copy of the PDF-import
// progress route; the same `useImportJobStream` hook consumes it (the UI passes
// this URL as `progressUrl`). Format-agnostic: it keys off `ImportJob.id` and
// just relays `status` + `progress` Json.
//
// Wire format (Server-Sent Events):
//   event: progress
//   data: { status, progress: { phase, message } | null }
//
//   event: done
//   data: { pageId, truncated }
//
//   event: error
//   data: { message }
//
// A `processing`/`queued` job whose `updatedAt` has gone stale was almost
// certainly killed by a redeploy (the detached worker is not durable). The
// handler flags such a job `failed`, refunds the charged minutes, and emits
// `error` so the UI can offer retry/cancel.

type Params = { params: Promise<{ id: string; jobId: string }> };

interface ProgressPayload {
  phase: string;
  message: string;
}

interface SnapshotEnvelope {
  status: string;
  progress: ProgressPayload | null;
}

function readSnapshot(status: string, progress: unknown): SnapshotEnvelope {
  return { status, progress: (progress as ProgressPayload | null) ?? null };
}

const POLL_INTERVAL_MS = 500;

export async function GET(request: NextRequest, { params }: Params) {
  const userId = await getAuthUserId(request);
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { id: notebookId, jobId } = await params;

  const initial = await db.importJob.findFirst({
    where: { id: jobId, notebookId, userId, sourceFormat: 'video' },
    select: {
      id: true,
      status: true,
      progress: true,
      error: true,
      resultPageId: true,
      truncated: true,
      videoDurationSec: true,
      updatedAt: true,
    },
  });
  if (!initial) return new Response('Not found', { status: 404 });

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

        while (!cancelled) {
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
          if (cancelled) break;

          const row = await db.importJob.findFirst({
            where: { id: jobId, notebookId, userId, sourceFormat: 'video' },
            select: {
              status: true,
              progress: true,
              error: true,
              resultPageId: true,
              truncated: true,
              videoDurationSec: true,
              updatedAt: true,
            },
          });
          if (!row) {
            controller.enqueue(sseEvent('error', { message: 'This import no longer exists.' }));
            break;
          }

          // Stale unfinished job — the worker was killed by a redeploy. Mark it
          // failed AND refund the minutes charged on submit (the worker that
          // would have refunded is dead), so the user is never billed for a
          // wedged job.
          if (
            (row.status === 'processing' || row.status === 'queued') &&
            Date.now() - row.updatedAt.getTime() > VIDEO_STALE_AFTER_MS
          ) {
            const message = 'The server restarted while importing. Please try again.';
            // Atomic claim so only ONE stale-detector refunds: flip to failed
            // only if still unfinished, and refund just once on a winning claim.
            const claimed = await db.importJob.updateMany({
              where: {
                id: jobId,
                status: { in: ['processing', 'queued'] },
              },
              data: { status: 'failed', error: message, finishedAt: new Date() },
            });
            if (claimed.count > 0) {
              await refundUsage(
                userId,
                'video_ingest',
                minutesForDuration(row.videoDurationSec),
              ).catch(() => {});
            }
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
        console.error('[video-import progress SSE]', error);
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
