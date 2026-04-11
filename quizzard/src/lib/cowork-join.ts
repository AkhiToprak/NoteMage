'use client';

/**
 * Cowork session join helpers.
 *
 * Implements the auto-leave-old → join-new flow used by the "Join session"
 * button on cowork invite cards in group chats, plus a tiny localStorage
 * bucket so we remember which session the user is currently in across
 * navigations.
 *
 * The rest of the real-time cowork plumbing (ws-server, socket hook,
 * broadcast events) is already built — this file is purely the client-side
 * orchestration that ties a chat invite to the notebook page route.
 */

export interface CoworkInvitePayload {
  /** Server-assigned session id. */
  sessionId: string;
  /** Notebook the session lives on. */
  notebookId: string;
  /** Page the host picked as the landing page. */
  pageId: string;
  /** Page kind — used to choose an icon on the invite card. */
  pageType: 'text' | 'canvas';
  /** Display title of the page. */
  pageTitle: string;
  /** Display name of the notebook. */
  notebookName: string;
  /** Hex color of the notebook (nullable — defaults to primary purple). */
  notebookColor: string | null;
  /** User id of the host (whoever started the session). */
  hostId: string;
  /** ISO timestamp of session creation, used for relative time in the UI. */
  startedAt: string;
}

export interface CurrentCoworkSession {
  sessionId: string;
  notebookId: string;
}

const STORAGE_KEY = 'notemage.currentCoworkSession';

/**
 * Build the deep link the host and each joiner lands on. Keeps the query
 * param shape in one place so we don't have to remember it at every call
 * site.
 *
 * `originGroupId` is the StudyGroup the user came from (the chat where the
 * invite was posted, or where the host opened the start modal). Carrying it
 * in the URL means we can route every participant back to that exact chat
 * when the session ends or they leave — without relying on localStorage,
 * which doesn't survive cross-tab joins or refreshes from a cold cache.
 */
export function coworkPageUrl(
  payload: CoworkInvitePayload,
  originGroupId?: string | null
): string {
  const base = `/notebooks/${payload.notebookId}/pages/${payload.pageId}?cowork=${payload.sessionId}`;
  return originGroupId ? `${base}&from=${encodeURIComponent(originGroupId)}` : base;
}

/** Read the user's currently active cowork session from localStorage. */
export function readCurrentCoworkSession(): CurrentCoworkSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CurrentCoworkSession;
    if (
      typeof parsed?.sessionId !== 'string' ||
      typeof parsed?.notebookId !== 'string'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Mark a cowork session as the user's current active one (or clear it). */
export function setCurrentCoworkSession(
  session: CurrentCoworkSession | null
): void {
  if (typeof window === 'undefined') return;
  try {
    if (session === null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    }
  } catch {
    // Quota exceeded / private mode — silently ignore. Worst case: the
    // auto-leave path skips, leave is handled by the server's stale-
    // session cleanup on the next join attempt.
  }
}

export type CoworkJoinError = 'forbidden' | 'not_found' | 'network';

/**
 * Auto-leave the user's current cowork session (if any) then join the
 * session described by `payload`, updating localStorage along the way.
 *
 * @param payload The invite payload from the chat card.
 * @param groupId The StudyGroup id of the chat where the invite lives.
 *                Passed to the server so it can use the new group-member
 *                gating instead of the legacy friends-only check.
 */
export async function joinCoworkSession(
  payload: CoworkInvitePayload,
  groupId: string
): Promise<CurrentCoworkSession> {
  // 1. Leave the current session, if any — best-effort.
  const current = readCurrentCoworkSession();
  if (
    current &&
    (current.sessionId !== payload.sessionId ||
      current.notebookId !== payload.notebookId)
  ) {
    try {
      await fetch(
        `/api/notebooks/${current.notebookId}/cowork/${current.sessionId}/leave`,
        { method: 'POST' }
      );
    } catch {
      // Swallow network errors on leave — an already-ended session returns
      // 404 which is fine. The important step is the join below.
    }
  }

  // 2. Join the new session via the group-gated endpoint.
  let res: Response;
  try {
    res = await fetch(
      `/api/notebooks/${payload.notebookId}/cowork/${payload.sessionId}/join`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId }),
      }
    );
  } catch {
    throw new Error('network' satisfies CoworkJoinError);
  }

  if (res.status === 403) {
    throw new Error('forbidden' satisfies CoworkJoinError);
  }
  if (res.status === 404) {
    throw new Error('not_found' satisfies CoworkJoinError);
  }
  if (!res.ok) {
    throw new Error('network' satisfies CoworkJoinError);
  }

  const next: CurrentCoworkSession = {
    sessionId: payload.sessionId,
    notebookId: payload.notebookId,
  };
  setCurrentCoworkSession(next);
  return next;
}

/**
 * Mark the host as currently in a session they just started. Called from
 * `StartCoworkModal` immediately after the create-session API returns.
 */
export function registerHostedCoworkSession(
  payload: CoworkInvitePayload
): CurrentCoworkSession {
  const entry: CurrentCoworkSession = {
    sessionId: payload.sessionId,
    notebookId: payload.notebookId,
  };
  setCurrentCoworkSession(entry);
  return entry;
}
