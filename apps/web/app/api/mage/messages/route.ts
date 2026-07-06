import { NextRequest } from 'next/server';
import { getAuthContext, getAuthUserId } from '@/lib/auth';
import { getMageName } from '@/lib/scholar';
import { db } from '@/lib/db';
import {
  badRequestResponse,
  unauthorizedResponse,
  tooManyRequestsResponse,
  internalErrorResponse,
  successResponse,
} from '@/lib/api-response';
import { costRateLimit, rateLimitKey } from '@/lib/rate-limit';
import { checkAndUnlockAchievements } from '@/lib/achievement-checker';
import { checkTokenBudget } from '@/lib/token-budget';
import { startChatStream } from '@/lib/chat-stream';
import { dbGroundingLoader, expandMageContext, resolveMageGrounding } from '@/lib/mage-context';
import {
  buildMageSourceManifest,
  mageContextKey,
  type MageClientContext,
  type MageSource,
} from '@/lib/mage-types';
import { resolveMageActionCards, type MageActionCard } from '@/lib/mage-actions';
import { formatExamStudyState, loadExamReadiness } from '@/lib/exam-scope';
import { mageGenerationActionsEnabled } from '@/lib/feature-flags';
import { detectExplicitWebIntent } from '@/lib/mage-web-intent';

/**
 * POST /api/mage/messages — the global Mage panel's send endpoint.
 *
 * Phase 1 (Foundation): mirrors the per-chat preflight (auth → rate limit →
 * token budget → message validation), authorizes the thin client context via
 * `expandMageContext` (dropping ids the user doesn't own), then delegates to
 * `startChatStream` UNCHANGED — a plain chat with no grounding, citations, or
 * action annotations yet (those land in Phases 2/4/6).
 *
 * Phase 10 — the thread is now per-context (`NotebookChat.contextKey`): one
 * persistent conversation per surface (exam / path / study pack / global). The
 * thread id is still returned in `X-Mage-Chat-Id`, and `GET` (below) resumes a
 * surface's thread + its persisted per-message sidecars so a reload rebuilds the
 * same chips / cards / gate.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return unauthorizedResponse();
    const userId = auth.userId;
    const mageName = getMageName(auth.scholarName);

    checkAndUnlockAchievements(userId).catch(console.error);

    const reqLimit = await costRateLimit(rateLimitKey('ai-chat', request, userId), 20, 60_000);
    if (!reqLimit.success) {
      return tooManyRequestsResponse('Too many requests. Please slow down.', reqLimit.retryAfterMs);
    }

    const { allowed: tokenAllowed, usedTokens, tokenLimit, tier } = await checkTokenBudget(userId);
    if (!tokenAllowed) {
      return tooManyRequestsResponse(
        `Monthly token limit reached (${tokenLimit.toLocaleString()} tokens). Resets on the 1st of next month.`
      );
    }

    const body = await request.json().catch(() => ({}));
    const { message, chatId, context } = body as {
      message?: string;
      chatId?: string;
      context?: MageClientContext;
    };

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return badRequestResponse('Message cannot be empty');
    }
    if (message.length > 10_000) {
      return badRequestResponse('Message is too long (max 10,000 characters)');
    }
    const userMessage = message.trim();
    // P4b — explicit web-intent heuristic (EN+DE, negation-first). Drives the
    // PRO grant-flip below and shapes the consent chips (request forces the web
    // offer, negation suppresses it). Web execution is P5.
    const webIntent = detectExplicitWebIntent(userMessage);

    // Authorize the client context (drops unauthorized ids) + derive the
    // server-authoritative policy/action menu. Never fatal — on failure we
    // fall back to a plain global turn.
    const resolved = await expandMageContext(userId, context ?? null, { tier }).catch((err) => {
      console.error('[mage/messages] context resolution failed', err);
      return null;
    });

    // Phase 2/4 — expand the AUTHORIZED ids into grounding material (lesson
    // theory, page text, pack/path outline, …) and number it into a `[S#]`
    // source manifest. The server owns this; the client never sends a page
    // list. Fail-soft: a grounding error just yields an ungrounded turn rather
    // than 500-ing the panel. When grounding exists this becomes a "Mage
    // answer" (GLM + citations); with none it stays a bare chat (Gemini).
    let groundingParts: string[] | undefined;
    let mageSources: MageSource[] | undefined;
    // Phase 5 — volatile study-state block (exam countdown + readiness +
    // weakest topics). UNCACHED and placed AFTER the cached corpus block by
    // chat-stream so a changing readiness never busts the 1h corpus cache (R2).
    let studyState: string | undefined;
    // Mage Real Context P1 — the on-screen activity block. Its own UNCACHED,
    // fenced system block (never rides the cached corpus). Composed per the
    // policy matrix: `safe` snapshot always; the revealing block ONLY when the
    // post-modeGate reveal gate is `open`.
    let mageActivity: string | undefined;
    if (resolved) {
      const sources = await resolveMageGrounding(resolved.ids, dbGroundingLoader(userId)).catch(
        (err) => {
          console.error('[mage/messages] grounding resolution failed', err);
          return [];
        }
      );
      const { corpusParts, manifest } = buildMageSourceManifest(sources);
      if (corpusParts.length > 0) {
        groundingParts = corpusParts;
        mageSources = manifest;
      }

      // When an exam is in context, fold its live readiness into the study-state
      // block. Fail-soft: a readiness error just omits the block.
      if (resolved.ids.examId) {
        const readiness = await loadExamReadiness(userId, resolved.ids.examId).catch((err) => {
          console.error('[mage/messages] exam readiness failed', err);
          return null;
        });
        if (readiness) studyState = formatExamStudyState(readiness);
      }

      // The on-screen activity the learner is looking at (options, their own
      // typed input, code + test output, post-submit verdict…). Its own fenced
      // UNCACHED block in chat-stream — NOT the cached corpus — so it never
      // busts the 1h corpus cache. Start with the `safe` snapshot; append the
      // revealing block ONLY when the reveal gate is `open` (matrix): a pre-submit
      // hint_only, a sealed exam, and strict mode all get safe-only. v1 composes
      // correctAnswer + pickedFeedback + fullExplanation; allOptionFeedback is
      // withheld. Fail-soft — never throws.
      if (resolved.activityContext) {
        let activity = resolved.activityContext;
        const rev = resolved.activityRevealing;
        if (resolved.revealGate === 'open' && rev) {
          const revealLines: string[] = [];
          if (rev.correctAnswer) revealLines.push(`Correct answer: ${rev.correctAnswer}`);
          if (rev.pickedFeedback) revealLines.push(`Why the picked answer is wrong: ${rev.pickedFeedback}`);
          if (rev.fullExplanation) revealLines.push(`Explanation: ${rev.fullExplanation}`);
          if (revealLines.length > 0) {
            activity +=
              '\n\nREVEALED ANSWER DATA (the learner has submitted; you MAY discuss it):\n' +
              revealLines.join('\n');
          }
        }
        mageActivity = activity;
      }
    }

    // Phase 6/7 — resolve the server's per-context action menu into cards with
    // authorized deep links (built only from ids the user owns). Low-risk
    // navigation + high-risk prefill cards plus the medium-risk generation cards
    // (Phase 7 executor: POST /api/mage/practice-sessions). The generation cards
    // are offered by default; MAGE_GENERATION_ACTIONS=0 is the kill-switch.
    let actionCards: MageActionCard[] | undefined;
    if (resolved && resolved.allowedActions.length > 0) {
      const cards = resolveMageActionCards(
        resolved.allowedActions,
        { type: resolved.type, ids: resolved.ids },
        { includeGeneration: mageGenerationActionsEnabled() }
      );
      if (cards.length > 0) actionCards = cards;
    }

    // Phase 10 — find-or-create the panel's PER-CONTEXT thread, so the panel
    // resumes one persistent conversation per surface. The key is built from
    // AUTHORIZED ids only (`resolved.ids`), so a thread is never homed under an
    // id the user can't see; on a context-resolution failure it falls back to
    // the plain global thread. A `notebook:`-scoped key also homes the thread in
    // that study pack's notebook, so legacy backfilled notebook chats and new
    // panel turns share one thread.
    const contextKey = mageContextKey(resolved ? { ids: resolved.ids } : null);
    const threadNotebookId = contextKey.startsWith('notebook:')
      ? (resolved?.ids.notebookId ?? null)
      : null;

    // Prefer an explicitly-selected owned chatId (the panel's active thread, incl.
    // one opened from the history overlay) — honored across surfaces, ownership
    // scoped by userId; else resume the latest thread for (user, contextKey);
    // else start fresh.
    let chat =
      typeof chatId === 'string' && chatId.length > 0
        ? await db.notebookChat.findFirst({ where: { id: chatId, userId } })
        : null;
    if (!chat) {
      chat = await db.notebookChat.findFirst({
        where: { userId, contextKey },
        orderBy: { updatedAt: 'desc' },
      });
    }
    if (!chat) {
      chat = await db.notebookChat.create({
        data: { userId, notebookId: threadNotebookId, contextKey, title: 'New Chat' },
      });
    }

    // P4b — an explicit "search the web" request flips the thread web grant
    // immediately (PRO + non-legacy only), so the header + prompt already reflect
    // it THIS turn without a chip round-trip. FREE / legacy do NOT grant (the
    // consent chip / upsell handles them). Goes through the (id, userId)-scoped
    // row (INVARIANT 4). Negation never grants — detectExplicitWebIntent already
    // returns 'negated' for it. Fail-soft: a write error just leaves the grant off.
    if (webIntent === 'request' && tier !== 'FREE' && !chat.allowWebSearch) {
      await db.notebookChat
        .update({ where: { id: chat.id }, data: { allowWebSearch: true } })
        .catch(() => {});
      chat.allowWebSearch = true;
    }

    // P4a — this thread's sticky consent grants (default false on a fresh row).
    // Passed to the stream for the ask-first prompt policy, and re-asserted as
    // response headers below so the client store can never go stale.
    const mageGrants = {
      allowWebSearch: chat.allowWebSearch,
      allowGeneralKnowledge: chat.allowGeneralKnowledge,
    };

    const response = await startChatStream({
      request,
      userId,
      messageNotebookId: chat.notebookId,
      mageGrants,
      // P4b — shapes the consent chips after the stream (request forces the web
      // offer, negation suppresses it).
      mageWebIntent: webIntent,
      chat: {
        id: chat.id,
        title: chat.title,
        notebookId: chat.notebookId,
        contextPageIds: chat.contextPageIds,
        contextDocIds: chat.contextDocIds,
      },
      userMessage,
      mageName,
      usedTokens,
      tokenLimit,
      tier,
      groundingParts,
      // Mage Real Context P1 — the on-screen activity block (safe snapshot +,
      // when the gate is open, the composed revealing block). Injected as a
      // fenced UNCACHED system block in chat-stream, adjacent to studyState.
      mageActivity,
      // Phase 8 — the server-authoritative reveal gate for this surface (exam →
      // sealed, practice / live question → hint_only). Streamed to the client so
      // the answer renders behind the gate, independent of the model path.
      revealGate: resolved?.revealGate,
      // Grounding OR study-state present → a Mage answer (GLM, citations,
      // annotate, action cards). `studyState` carries the volatile exam
      // readiness block (Phase 5); `actions` the offered menu (Phase 6). A bare
      // chat with neither stays on Gemini and surfaces no cards.
      // Phase 9 — an explicit non-default mode (deep / strict) is itself a
      // Mage-answer signal: deep needs glm-sonnet and strict needs material-bound
      // behaviour, both of which only the GLM Mage-answer path provides. So a
      // deep/strict turn routes to a Mage answer even with no grounding (it
      // answers from general knowledge, or — in strict — says the material
      // doesn't cover it). Plain `quick` with no grounding stays a Gemini chat.
      mageAnswer:
        mageSources || studyState || (resolved && resolved.mode !== 'quick')
          ? { sources: mageSources ?? [], mode: resolved?.mode, studyState, actions: actionCards }
          : undefined,
    });

    // Surface the thread id so the client keeps talking to the same chat, plus
    // a summary of the resolved context for observability (action cards render
    // in Phase 6 — here the menu is only derived + exposed).
    response.headers.set('X-Mage-Chat-Id', chat.id);
    // P4a — re-assert grant state on EVERY POST so the panel header can never go
    // stale. `X-Mage-Web-Available` is always '1' now: the web path rides the GLM
    // chat composition, which is the only composition (Claude/legacy is gone).
    // (Web execution itself is P5.)
    response.headers.set('X-Mage-Allow-Web', chat.allowWebSearch ? '1' : '0');
    response.headers.set('X-Mage-Allow-Gk', chat.allowGeneralKnowledge ? '1' : '0');
    response.headers.set('X-Mage-Web-Available', '1');
    if (resolved) {
      response.headers.set('X-Mage-Context-Type', resolved.type);
      response.headers.set('X-Mage-Assistance-Policy', resolved.assistancePolicy);
      response.headers.set('X-Mage-Reveal-Gate', resolved.revealGate);
      if (resolved.allowedActions.length > 0) {
        response.headers.set('X-Mage-Actions', resolved.allowedActions.join(','));
      }
      if (groundingParts) {
        response.headers.set('X-Mage-Grounding', String(groundingParts.length));
      }
    }
    return response;
  } catch (error) {
    console.error('[mage/messages POST]', error);
    return internalErrorResponse();
  }
}

/**
 * GET /api/mage/messages?contextKey=… — resume a surface's persistent thread.
 *
 * Phase 10. Returns the latest thread for `(userId, contextKey)` plus its last
 * messages, each carrying its persisted `metadata` sidecar (sources / sourceMode
 * / actions / revealGate / mode) so the panel rebuilds the same turn — gates
 * included, so a sealed exam answer stays sealed after a reload. Scoped to
 * `userId`, so a `contextKey` forged from someone else's id resolves to nothing.
 * No thread yet → `{ chatId: null, messages: [] }` (the panel shows its empty
 * state); a null `metadata` row renders as plain prose.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const params = new URL(request.url).searchParams;
    const explicitChatId = params.get('chatId')?.trim();
    const contextKey = params.get('contextKey')?.trim() || 'global';

    // The history overlay loads a specific thread by id (ownership-scoped);
    // otherwise resume the surface's latest thread for (userId, contextKey).
    const chat = explicitChatId
      ? await db.notebookChat.findFirst({
          where: { id: explicitChatId, userId },
          select: { id: true, allowWebSearch: true, allowGeneralKnowledge: true },
        })
      : await db.notebookChat.findFirst({
          where: { userId, contextKey },
          orderBy: { updatedAt: 'desc' },
          select: { id: true, allowWebSearch: true, allowGeneralKnowledge: true },
        });
    if (!chat)
      return successResponse({
        chatId: null,
        messages: [],
        grants: { allowWebSearch: false, allowGeneralKnowledge: false },
        webAvailable: true,
      });

    // Cap the resume payload to the most recent turns, then restore chronological
    // order for the transcript.
    const recent = await db.chatMessage.findMany({
      where: { chatId: chat.id, userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, role: true, content: true, metadata: true },
    });
    return successResponse({
      chatId: chat.id,
      messages: recent.reverse(),
      grants: {
        allowWebSearch: chat.allowWebSearch,
        allowGeneralKnowledge: chat.allowGeneralKnowledge,
      },
      webAvailable: true,
    });
  } catch (error) {
    console.error('[mage/messages GET]', error);
    return internalErrorResponse();
  }
}
