import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { loadPathForUser, serializePath } from '@/lib/path-loader';

// Phase 10.3 — SSE stream for path generation progress.
//
// Wire format (Server-Sent Events):
//   event: progress
//   data: { totalSlots, completedSlots, currentSlot: { id, title } | null,
//           currentActivity: 'theory' | 'flashcards' | 'quiz' | null,
//           status: 'queued' | 'generating' | 'ready' | 'failed' }
//
//   event: done
//   data: <serialized path tree>
//
//   event: error
//   data: { message }
//
// Implementation: the orchestrator (`path-generator.ts`) writes
// `StudyPlan.generationProgress` after each slot. This handler polls
// the DB every 500ms, diffs against the last snapshot, and emits a
// `progress` event whenever something changed. Stateless — a client
// that connects mid-generation gets the current snapshot immediately
// and continues streaming.

type Params = { params: Promise<{ planId: string }> };

interface ProgressPayload {
  totalSlots: number;
  completedSlots: number;
  currentSlot: { id: string; title: string } | null;
  currentActivity: 'theory' | 'flashcards' | 'quiz' | null;
}

interface SnapshotEnvelope {
  status: string;
  progress: ProgressPayload | null;
}

function readSnapshot(
  status: string,
  progress: unknown,
): SnapshotEnvelope {
  return {
    status,
    progress: (progress as ProgressPayload | null) ?? null,
  };
}

const POLL_INTERVAL_MS = 500;

export async function GET(request: NextRequest, { params }: Params) {
  const userId = await getAuthUserId(request);
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { planId } = await params;

  const initial = await db.studyPlan.findFirst({
    where: { id: planId, userId },
    select: {
      id: true,
      generationStatus: true,
      generationProgress: true,
      generationError: true,
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

      const emitDone = async () => {
        const plan = await loadPathForUser(userId, planId);
        if (plan) {
          controller.enqueue(sseEvent('done', serializePath(plan)));
        } else {
          controller.enqueue(sseEvent('error', { message: 'Path disappeared mid-stream' }));
        }
      };

      try {
        // Initial snapshot — always emit so a reconnecting client sees
        // current state before having to wait for a tick.
        const initialSnap = readSnapshot(initial.generationStatus, initial.generationProgress);
        controller.enqueue(sseEvent('progress', initialSnap));
        let lastSnap = JSON.stringify(initialSnap);

        if (initial.generationStatus === 'ready') {
          await emitDone();
          controller.close();
          return;
        }
        if (initial.generationStatus === 'failed') {
          controller.enqueue(
            sseEvent('error', {
              message: initial.generationError ?? 'Generation failed',
            }),
          );
          controller.close();
          return;
        }

        // Poll loop.
        while (!cancelled) {
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
          if (cancelled) break;

          const row = await db.studyPlan.findFirst({
            where: { id: planId, userId },
            select: {
              generationStatus: true,
              generationProgress: true,
              generationError: true,
            },
          });
          if (!row) {
            controller.enqueue(sseEvent('error', { message: 'Path no longer exists' }));
            break;
          }

          const snap = readSnapshot(row.generationStatus, row.generationProgress);
          const snapStr = JSON.stringify(snap);
          if (snapStr !== lastSnap) {
            controller.enqueue(sseEvent('progress', snap));
            lastSnap = snapStr;
          }

          if (row.generationStatus === 'ready') {
            await emitDone();
            break;
          }
          if (row.generationStatus === 'failed') {
            controller.enqueue(
              sseEvent('error', {
                message: row.generationError ?? 'Generation failed',
              }),
            );
            break;
          }
        }
      } catch (error) {
        console.error('[learn/paths/generation SSE]', error);
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
