import type { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
  tooManyRequestsResponse,
} from '@/lib/api-response';
import { persistPlanStructure } from '@/lib/persist-plan-structure';
import { costRateLimit, rateLimitKey } from '@/lib/rate-limit';
import type { PathStructureToolInput } from '@/lib/ai-tools';
import type { PreviewLesson } from '@/lib/path-preview';
import { enqueueJob } from '@/lib/background-jobs';
import { enqueueStructuralEdgeDerivation } from '@/lib/concept-edges';
import { enqueueConceptDedupForPlan } from '@/lib/concept-dedup';

/**
 * Onboarding-real-generation P4 — claim the anonymous preview on sign-up.
 *
 * Reads the `nm_anon` cookie → loads the visitor's `PendingOnboardingPath` →
 * materializes it into an OWNED StudyPlan (D8: reuse the stored Stage A
 * structure verbatim via `persistPlanStructure`, never regenerate it), attaches
 * the preview lesson the learner already read as the first slot's theory
 * activity (D8/D12 — Stage B is idempotent and skips it), then queues the full
 * Stage B over the whole material. The pending row is marked `claimed`.
 *
 * Corpus for completion: notes/link have `fullText`; a PDF has only the stored
 * `cappedCorpus` slice (its bytes never reached us — D2) — either becomes a real
 * Document so Stage B grounds the path in it. A full-PDF re-upload through the
 * authenticated importer is the deferred "deeper path" enhancement.
 *
 * Onboarding completion is intentionally NOT metered (it's the sign-up reward,
 * naturally bounded to ~one per anon session by the per-IP preview limit), so a
 * free user can always finish their first path — `generatePath` does no usage
 * gating of its own. Public-by-middleware (/api/start) but self-guards on auth.
 */

export const runtime = 'nodejs';

const ANON_COOKIE = 'nm_anon';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The claim does more than a plain create (notebook + Document + slots + theory),
// so give the transaction a little more room than Prisma's 5s default.
const CLAIM_TX_TIMEOUT_MS = 20_000;

function sourceFileName(kind: string): string {
  if (kind === 'link') return 'Video transcript';
  if (kind === 'notes') return 'Your notes';
  return 'Your material';
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    // A converted user claims ~once; cheap burst cap (fails closed in prod).
    const burst = await costRateLimit(rateLimitKey('start-claim', request, userId), 5, 60_000);
    if (!burst.success) {
      return tooManyRequestsResponse('Please wait a moment and try again.', burst.retryAfterMs);
    }

    const anonToken = request.cookies.get(ANON_COOKIE)?.value;
    if (!anonToken || !UUID_RE.test(anonToken)) {
      return badRequestResponse('No pending preview to claim.');
    }

    const pending = await db.pendingOnboardingPath.findUnique({ where: { anonToken } });
    if (!pending) return notFoundResponse('Pending preview not found or expired.');

    // Idempotent: a double-submit (or a retried claim) returns the plan it
    // already created instead of building a second one.
    if (pending.status === 'claimed' && pending.claimedPlanId) {
      return successResponse({
        planId: pending.claimedPlanId,
        status: 'generating',
        alreadyClaimed: true,
      });
    }

    // Lazy TTL sweep (P5): an expired, unclaimed row is dead — delete it on read
    // and treat the preview as gone. (A still-`claimed` row at this point lacks a
    // planId, so it never deletes here; the opportunistic deleteMany on the
    // preview route handles general cleanup.)
    if (pending.expiresAt.getTime() < Date.now()) {
      if (pending.status !== 'claimed') {
        await db.pendingOnboardingPath.delete({ where: { id: pending.id } }).catch(() => {});
      }
      return notFoundResponse('This preview has expired. Start again to build a fresh path.');
    }

    const structure = pending.structureJson as unknown as PathStructureToolInput;
    if (!structure?.phases?.length) {
      return internalErrorResponse('Stored preview is malformed.');
    }
    const lesson = pending.lessonJson as unknown as PreviewLesson | null;
    const corpusText = (pending.fullText ?? pending.cappedCorpus ?? '').trim();
    const language = pending.language || 'en';

    const planId = await db.$transaction(
      async (tx) => {
        // A real notebook (the study-pack container) homes this path's generated
        // bundles + the source material — a fresh sign-up has none yet.
        const notebook = await tx.studyContainer.create({
          data: {
            userId,
            name: pending.title.slice(0, 120) || 'My study path',
            kind: 'standard',
          },
          select: { id: true },
        });

        // Stored text → a Document so Stage B rebuilds the grounding corpus from
        // the same material ids the live create route uses.
        const materialIds: string[] = [];
        if (corpusText.length > 0) {
          const doc = await tx.document.create({
            data: {
              notebookId: notebook.id,
              fileName: (pending.title || sourceFileName(pending.sourceKind)).slice(0, 200),
              filePath: `onboarding/${pending.id}`,
              fileSize: Buffer.byteLength(corpusText, 'utf8'),
              fileType: 'text/plain',
              textContent: corpusText,
            },
            select: { id: true },
          });
          materialIds.push(doc.id);
        }

        const newPlanId = await persistPlanStructure(tx, {
          userId,
          notebookId: notebook.id,
          contextNotebookIds: [notebook.id],
          materialIds,
          fallbackTitle: pending.title,
          learnerBrief: pending.goal,
          structure,
          source: 'ai',
          ultra: false,
          gemini: false,
          language,
          subjects: ['general'],
          subjectWeights: [1],
          generationStatus: 'generating',
        });

        // Attach the already-read preview lesson to the first learning slot as
        // its theory activity. Stage B skips kinds a slot already has, so this
        // survives and the full run only fills the remaining activities.
        if (lesson?.body) {
          const slot = await tx.checkpointSlot.findFirst({
            where: { phase: { planId: newPlanId }, kind: 'learning' },
            orderBy: [{ phase: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
            select: { id: true },
          });
          if (slot) {
            const theory = await tx.theoryContent.create({
              data: {
                title: lesson.title,
                body: lesson.body as unknown as Prisma.InputJsonValue,
              },
            });
            await tx.checkpointActivity.create({
              data: {
                slotId: slot.id,
                kind: 'theory',
                title: lesson.title,
                sortOrder: 0,
                theoryId: theory.id,
              },
            });
          }
        }

        await tx.pendingOnboardingPath.update({
          where: { id: pending.id },
          data: { status: 'claimed', claimedByUserId: userId, claimedPlanId: newPlanId },
        });

        return newPlanId;
      },
      { timeout: CLAIM_TX_TIMEOUT_MS }
    );

    // Weakness Training Phase 4.2a (phase4 §12.7) — best-effort, tier-0
    // structural edge derivation. Gated on Concept rows actually existing;
    // never blocks or fails the claim.
    await enqueueStructuralEdgeDerivation(planId);

    // Weakness Training Phase 4.1b (phase4 §11.2 tier 2) — best-effort
    // tier-2 embedding dedup for concepts tier-1 didn't match at creation.
    // Flag-gated; never blocks or fails the claim.
    await enqueueConceptDedupForPlan(planId);

    // Full Stage B over the whole material, like the live create route.
    // allowRefund:false (nothing was metered to refund).
    await enqueueJob(
      'path.generate',
      { planId, allowRefund: false },
      {
        dedupeKey: `path:generate:${planId}`,
      }
    );

    return successResponse({ planId, status: 'generating' });
  } catch (error) {
    console.error('[start/claim]', error);
    return internalErrorResponse();
  }
}
