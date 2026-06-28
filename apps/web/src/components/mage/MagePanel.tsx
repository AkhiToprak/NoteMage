'use client';

/* Hallmark · component: side-panel + chat · genre: editorial · theme: project (Neon Scholar)
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass (uses --surface-* / --on-surface / --primary / --on-primary tokens)
 *
 * Mage Revolution Phase 1 — the global Mage panel. Desktop: a right-anchored
 * overlay (clamp 360–420px). Mobile: a full-bleed drawer with a scrim. Streams
 * an answer from POST /api/mage/messages with source chips (Phase 4), action
 * cards (Phase 6), and the server-authoritative reveal gate (Phase 8) — exam
 * answers stay sealed; practice answers hide behind a Reveal button. Motion is
 * transform/opacity only with the project spring easing, and collapses under
 * prefers-reduced-motion.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getMageName } from '@/lib/scholar';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { Mascot } from '@/components/mascot';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useStreamingChat } from '@/hooks/useStreamingChat';
import {
  gateVisibility,
  mageContextKey,
  mageSourceLabel,
  type MageContextType,
  type MageMessageMetadata,
  type MageMode,
  type MageRevealGate,
  type MageSource,
  type MageSourceMode,
} from '@/lib/mage-types';
import type { MageActionCard } from '@/lib/mage-actions';
import { useMage } from './MageProvider';
import { presentMageContext } from './mage-presentation';

interface PanelMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Phase 4 — resolved citation chips + the server-set source mode. */
  sources?: MageSource[];
  sourceMode?: MageSourceMode;
  notFoundInMaterial?: boolean;
  /** Phase 6 — recommended action cards (navigate / prefill / generate). */
  actions?: MageActionCard[];
  /** Phase 8 — server-set reveal gate; the body renders behind it. */
  revealGate?: MageRevealGate;
  /** Phase 9 — the answer mode that produced this turn, so the switch row
   *  offers the OTHER two modes. */
  mode?: MageMode;
  /** Phase 9 — the user question this answer responded to, so a mode switch can
   *  re-ask it. Absent for action-card / aborted turns (no switch row). */
  question?: string;
}

/**
 * Phase 9 — the mode switch chips. Each answer offers the OTHER two modes as a
 * one-tap re-ask, so there's no mode to manage before asking: `quick` is the
 * automatic default, and the learner reaches for depth / rigor / speed only when
 * an answer prompts them to.
 */
const MODE_SWITCHES: Record<MageMode, { label: string; icon: string }> = {
  quick: { label: 'Answer faster', icon: 'bolt' },
  deep: { label: 'Go deeper', icon: 'psychology' },
  strict: { label: 'Use only my material', icon: 'menu_book' },
};

/** Stable display order for the switch row (the current mode is filtered out). */
const MODE_ORDER: MageMode[] = ['deep', 'strict', 'quick'];

let idCounter = 0;
const nextId = () => `mage-${++idCounter}`;

/** Header subtitle reflecting the current surface's answer stance (presentation
 *  only — the real reveal gate is still server-derived per turn). */
function subtitleFor(type: MageContextType | undefined): string {
  switch (type) {
    case 'exam':
      return 'Exam mode · answers stay sealed';
    case 'practice':
    case 'quiz-question':
      return 'Concept help · hints, not answers';
    default:
      // Global surface: no subtitle — the header shows just the Mage's name.
      return '';
  }
}

/** A past Mage conversation, as listed by `GET /api/mage/chats`. */
interface ChatSummary {
  id: string;
  title: string;
  contextKey: string | null;
  updatedAt: string;
}

/** Compact relative time for the history list ("just now", "3h", "2d"). */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d`;
  return `${Math.round(days / 7)}w`;
}

/** A persisted message row as returned by `GET /api/mage/messages`. */
interface ServerMessageRow {
  id: string;
  role: string;
  content: string;
  metadata: unknown;
}

/**
 * Phase 10 — rebuild the transcript from a resumed thread. A row's `metadata`
 * sidecar (Mage turns) restores its chips / cards / gate / mode; a null sidecar
 * (plain chat + every legacy row) renders as plain prose. Each assistant turn's
 * `question` is reconstructed from the preceding user message so the mode-switch
 * row still works on a resumed answer — but only for Mage turns (metadata
 * present), never for legacy plain prose.
 */
function hydrateMessages(rows: ServerMessageRow[]): PanelMessage[] {
  const out: PanelMessage[] = [];
  let lastUserContent: string | undefined;
  for (const row of rows) {
    if (row.role === 'user') {
      lastUserContent = row.content;
      out.push({ id: row.id, role: 'user', content: row.content });
      continue;
    }
    const meta = (row.metadata ?? null) as MageMessageMetadata | null;
    out.push({
      id: row.id,
      role: 'assistant',
      content: row.content,
      sources: meta?.sources,
      sourceMode: meta?.sourceMode,
      notFoundInMaterial: meta?.notFoundInMaterial,
      actions: meta?.actions,
      revealGate: meta?.revealGate,
      mode: meta?.mode,
      question: meta ? lastUserContent : undefined,
    });
  }
  return out;
}

export function MagePanel() {
  const { isOpen, close, context, setContext } = useMage();
  const { isPhone } = useBreakpoint();
  const router = useRouter();
  const { data: session } = useSession();
  // The Mage's display name follows the user's custom name (Settings → Mage
  // name), falling back to "Mage". The server already greets/answers under this
  // name; the header now matches it.
  const mageDisplayName = getMageName(session?.user?.scholarName);

  // Navigate to a deep link (source chip or action card), closing the panel on
  // the way so the route change isn't hidden behind the overlay.
  const navigateTo = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router]
  );

  // Presentation follows the surface the panel was opened from (Phase 2): the
  // context card's icon/label + the starter chips both derive from it.
  const presentation = presentMageContext(context);
  const contextTitle = context.title?.trim();
  const showContextCard = (context.type ?? 'global') !== 'global' || Boolean(contextTitle);
  const headerSubtitle = subtitleFor(context.type);

  const [messages, setMessages] = useState<PanelMessage[]>([]);
  const [input, setInput] = useState('');
  // Phase 6 — a medium-risk (generate) card awaiting confirmation.
  const [pendingAction, setPendingAction] = useState<MageActionCard | null>(null);
  // Phase 7 — true while a confirmed practice session is being assembled
  // (POST /api/mage/practice-sessions). Blocks re-entry + the composer.
  const [building, setBuilding] = useState(false);
  // Chat history overlay — start a fresh thread or reopen a past one.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const chatIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // Bumped on every send, so a slow thread-resume that resolves AFTER the
  // learner has already sent a message discards its (now-stale) result instead
  // of clobbering the live turn.
  const turnSeqRef = useRef(0);

  const handleResponse = useCallback((res: Response) => {
    const id = res.headers.get('X-Mage-Chat-Id');
    if (id) chatIdRef.current = id;
  }, []);

  const { streamingText, status, error, send, abort, revealGate } = useStreamingChat({
    endpoint: '/api/mage/messages',
    onResponse: handleResponse,
  });
  const isStreaming = status === 'streaming';

  // Phase 10 — the persistent-thread key for the current surface. The panel
  // resumes one conversation per context; the server re-derives the same key
  // from authorized ids on every send.
  const contextKey = mageContextKey(context);
  // The study pack a `notebook:`-scoped thread is homed in — lets resumed legacy
  // `[quiz_set:id]` / `[flashcard_set:id]` markers deep-link to their viewer.
  const groundedNotebookId = context.ids?.notebookId;
  // The contextKey whose thread is currently loaded, so we only re-resume when
  // the surface actually changes (not on every streaming toggle / reopen).
  const loadedKeyRef = useRef<string | null>(null);

  // Resume the surface's thread when the panel opens or the surface changes.
  // Skipped mid-turn so an in-flight stream is never clobbered; failures fall
  // back to a fresh empty transcript.
  useEffect(() => {
    if (!isOpen || isStreaming || building) return;
    if (loadedKeyRef.current === contextKey) return;
    loadedKeyRef.current = contextKey;
    const seq = turnSeqRef.current;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/mage/messages?contextKey=${encodeURIComponent(contextKey)}`);
        const json = (await res.json().catch(() => null)) as
          | { success?: boolean; data?: { chatId: string | null; messages: ServerMessageRow[] } }
          | null;
        // Drop a stale resume: the panel was navigated away, or the learner
        // already started a turn while this was in flight.
        if (cancelled || turnSeqRef.current !== seq) return;
        if (res.ok && json?.success && json.data) {
          setMessages(hydrateMessages(json.data.messages ?? []));
          chatIdRef.current = json.data.chatId ?? null;
        } else {
          setMessages([]);
          chatIdRef.current = null;
        }
      } catch {
        if (!cancelled) {
          setMessages([]);
          chatIdRef.current = null;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, contextKey, isStreaming, building]);

  // Focus the composer when the panel opens.
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // Phase 10 — when the panel was opened from a text selection ("Ask Mage"),
  // seed the composer once with a starter quoting the highlighted text, so a
  // single send asks about exactly what was selected. Only seeds an empty
  // composer, so it never clobbers what the learner is already typing.
  const seededSelectionRef = useRef<string | null>(null);
  useEffect(() => {
    const sel = context.selectedText?.trim();
    if (!isOpen || !sel) return;
    if (seededSelectionRef.current === sel) return;
    seededSelectionRef.current = sel;
    const snippet = sel.length > 280 ? `${sel.slice(0, 280)}…` : sel;
    setInput((cur) => (cur.trim().length === 0 ? `Explain this: “${snippet}”` : cur));
    // Drop the selection from context now that it's seeded into the composer —
    // the question text carries it, so follow-up turns shouldn't keep re-sending
    // a stale highlight.
    setContext({ ...context, selectedText: undefined });
  }, [isOpen, context, setContext]);

  // Keep the transcript pinned to the latest content.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamingText, isOpen]);

  // Esc closes the panel.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, close]);

  // Plain function — the React Compiler memoizes it; a manual useCallback here
  // can't preserve its memo (the inferred deps include the stable state setters,
  // which the explicit [isStreaming, send, context] list omits).
  const handleSend = async (raw: string, modeOverride?: MageMode) => {
    const text = raw.trim();
    if (!text || isStreaming || building) return;
    turnSeqRef.current += 1; // invalidate any in-flight thread-resume
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setMessages((m) => [...m, { id: nextId(), role: 'user', content: text }]);
    // Phase 9 — a mode switch ([Go deeper] / [Use only my material] /
    // [Answer faster]) re-asks the question in that mode; a plain send uses the
    // automatic default (quick). The mode rides in the context the server
    // re-authorizes — it never trusts a client-claimed policy.
    const effectiveMode: MageMode = modeOverride ?? context.mode ?? 'quick';
    const done = await send(text, {
      chatId: chatIdRef.current ?? undefined,
      context: modeOverride ? { ...context, mode: modeOverride } : context,
    });
    if (done?.assistantMessage) {
      setMessages((m) => [
        ...m,
        {
          id: done.assistantMessage.id || nextId(),
          role: 'assistant',
          content: done.assistantMessage.content,
          sources: done.sources?.sources,
          sourceMode: done.sources?.sourceMode,
          notFoundInMaterial: done.sources?.notFoundInMaterial,
          actions: done.actions,
          revealGate: done.revealGate,
          mode: effectiveMode,
          question: text,
        },
      ]);
    } else if (done?.aborted && done.partialText) {
      // A gated turn that was stopped mid-stream still hides its partial behind
      // the gate — never leak an exam/practice answer just because it was aborted.
      setMessages((m) => [
        ...m,
        { id: nextId(), role: 'assistant', content: done.partialText!, revealGate: done.revealGate },
      ]);
    }
  };

  // Open the history overlay and (re)load the user's recent conversations.
  const openHistory = async () => {
    setHistoryOpen(true);
    setChatsLoading(true);
    try {
      const res = await fetch('/api/mage/chats');
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; data?: { chats?: ChatSummary[] } }
        | null;
      setChats(json?.data?.chats ?? []);
    } catch {
      setChats([]);
    } finally {
      setChatsLoading(false);
    }
  };

  // Start a brand-new conversation on the current surface. Creates an empty
  // thread server-side (excluded from history until its first turn) and points
  // the panel at it, so the next send opens a fresh chat instead of resuming the
  // surface's latest one.
  const startNewChat = async () => {
    if (isStreaming || building) return;
    turnSeqRef.current += 1; // invalidate any in-flight thread-resume
    setHistoryOpen(false);
    setMessages([]);
    chatIdRef.current = null;
    try {
      const res = await fetch('/api/mage/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contextKey }),
      });
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; data?: { id?: string } }
        | null;
      if (json?.data?.id) chatIdRef.current = json.data.id;
    } catch {
      /* fall back to a fresh-on-next-send thread */
    }
    // Mark the surface as loaded so the resume effect doesn't refill the new chat.
    loadedKeyRef.current = contextKey;
    inputRef.current?.focus();
  };

  // Reopen a past conversation from the history overlay. Loads its messages by
  // id (ownership-scoped) and makes it the active thread; follow-up sends
  // continue it via the explicit chatId, regardless of the current surface.
  const openChat = async (id: string) => {
    if (isStreaming || building) return;
    turnSeqRef.current += 1;
    setHistoryOpen(false);
    try {
      const res = await fetch(`/api/mage/messages?chatId=${encodeURIComponent(id)}`);
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; data?: { chatId: string | null; messages: ServerMessageRow[] } }
        | null;
      if (res.ok && json?.success && json.data) {
        setMessages(hydrateMessages(json.data.messages ?? []));
        chatIdRef.current = json.data.chatId ?? id;
        loadedKeyRef.current = contextKey; // don't let the resume effect clobber it
      }
    } catch {
      /* leave the current transcript as-is on failure */
    }
  };

  // Run a recommended action card. Low-risk navigation + high-risk prefill open
  // a deep link the server already authorized → run immediately. Medium-risk
  // generation routes through a confirm dialog first (it spends quota).
  const handleAction = (card: MageActionCard) => {
    if (card.href) {
      navigateTo(card.href);
      return;
    }
    if (card.kind === 'generate') {
      if (card.confirm) setPendingAction(card);
      else runGenerateAction(card);
    }
  };

  // Execute a confirmed generate action (Phase 7). The three quiz-assembling
  // actions POST to the practice-session generator (its own server-side context
  // re-auth + quota re-check), then deep-link into the assembled quiz. Explaining
  // missed questions isn't a new quiz — it's a grounded chat turn, so it falls
  // through to the normal send path.
  const startPracticeSession = async (card: MageActionCard) => {
    if (building || isStreaming) return;
    turnSeqRef.current += 1; // invalidate any in-flight thread-resume
    setBuilding(true);
    const placeholderId = nextId();
    setMessages((m) => [
      ...m,
      { id: placeholderId, role: 'assistant', content: 'Building your practice set… this takes a few seconds.' },
    ]);
    try {
      const res = await fetch('/api/mage/practice-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: card.id, context }),
      });
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; data?: { quizUrl?: string }; error?: string }
        | null;
      const quizUrl = json?.data?.quizUrl;
      if (res.ok && json?.success && quizUrl) {
        navigateTo(quizUrl);
        return;
      }
      const fallback =
        res.status === 429
          ? 'You have used up your practice-generation allowance for now.'
          : "Mage couldn't build a practice set right now. Try again in a moment.";
      const message = json?.error || fallback;
      setMessages((m) => m.map((x) => (x.id === placeholderId ? { ...x, content: message } : x)));
    } catch {
      setMessages((m) =>
        m.map((x) => (x.id === placeholderId ? { ...x, content: 'Network error — please try again.' } : x))
      );
    } finally {
      setBuilding(false);
    }
  };

  const runGenerateAction = (card: MageActionCard) => {
    if (card.id === 'EXPLAIN_MISTAKE') {
      void handleSend(card.label);
      return;
    }
    void startPracticeSession(card);
  };

  const showEmptyState = messages.length === 0 && !isStreaming && !streamingText;
  // Phase 9 — the mode switch row only hangs off the LATEST settled answer, so a
  // long transcript isn't littered with re-ask controls.
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;
  const switchesIdle = !isStreaming && !building;

  const panelWidth = isPhone ? '100vw' : 'clamp(360px, 30vw, 420px)';

  return (
    <>
      {/* Scrim — mobile only; click to dismiss. */}
      <div
        className="mage-scrim"
        data-open={isOpen && isPhone ? 'true' : 'false'}
        aria-hidden="true"
        onClick={close}
        style={{
          position: 'fixed',
          inset: 0,
          // Above the immersive quiz shell (z1300) + its source drawer (z1400) so
          // "Ask Mage" from a checkpoint / exam / practice run opens IN FRONT of
          // the shell, not behind it. (Phase E — the shell contexts depend on
          // Mage being reachable; before this it slid in under the cream frame.)
          zIndex: 1440,
          background: 'rgba(8, 6, 24, 0.55)',
          opacity: isOpen && isPhone ? 1 : 0,
          pointerEvents: isOpen && isPhone ? 'auto' : 'none',
        }}
      />

      <aside
        className="mage-panel"
        role="dialog"
        aria-modal={isPhone ? true : undefined}
        aria-label="Mage study companion"
        aria-hidden={isOpen ? undefined : true}
        inert={isOpen ? undefined : true}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: panelWidth,
          // Rides above the quiz shell (z1300) + source drawer (z1400) — see the
          // scrim note above. Paired so the panel sits just over its own scrim.
          zIndex: 1450,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface-container-low)',
          borderLeft: isPhone ? 'none' : '1px solid var(--outline-variant)',
          boxShadow: '-10px 0 40px rgba(24, 32, 47, 0.10), -2px 0 10px rgba(24, 32, 47, 0.05)',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
      >
        {/* Header */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '11px',
            padding: '12px 14px',
            borderBottom: '1px solid var(--outline-variant)',
            flexShrink: 0,
            background: 'var(--surface-container)',
          }}
        >
          <span
            aria-hidden
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              flexShrink: 0,
              borderRadius: 12,
              background: 'var(--mage-lilac-soft)',
              overflow: 'hidden',
            }}
          >
            <Mascot pose="chatting" size={34} idle="none" />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2, flex: 1, minWidth: 0 }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '16px',
                fontWeight: 700,
                color: 'var(--on-surface)',
                letterSpacing: '-0.01em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {mageDisplayName}
            </span>
            {headerSubtitle && (
              <span
                style={{
                  fontSize: '11.5px',
                  color: 'var(--on-surface-variant)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {headerSubtitle}
              </span>
            )}
          </div>
          <button
            type="button"
            className="mage-icon-btn"
            onClick={startNewChat}
            disabled={isStreaming || building}
            aria-label="New chat"
            title="New chat"
          >
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '20px' }}>
              edit_square
            </span>
          </button>
          <button
            type="button"
            className="mage-icon-btn"
            onClick={openHistory}
            aria-label="Chat history"
            title="Chat history"
          >
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '20px' }}>
              history
            </span>
          </button>
          <button
            type="button"
            className="mage-icon-btn"
            onClick={close}
            aria-label="Close Mage"
          >
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '20px' }}>
              close
            </span>
          </button>
        </header>

        {/* Context card now rides at the top of the transcript (scrolls with it). */}

        {/* Transcript */}
        <div
          ref={scrollRef}
          className="mage-scroll custom-scrollbar"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '16px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {showContextCard && (
            <div
              style={{
                flexShrink: 0,
                background: 'var(--surface-container)',
                border: '1px solid var(--outline-variant)',
                borderRadius: 16,
                boxShadow: 'var(--mage-shadow)',
                padding: '14px 16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: contextTitle ? 9 : 0 }}>
                <span
                  aria-hidden
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 22,
                    height: 22,
                    flexShrink: 0,
                    borderRadius: 999,
                    background: 'var(--mage-lilac)',
                    color: 'var(--mage-accent)',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                    {presentation.icon}
                  </span>
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--mage-accent)',
                  }}
                >
                  {presentation.label}
                </span>
              </div>
              {contextTitle && (
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--on-surface)', lineHeight: 1.35 }}>
                  {contextTitle}
                </p>
              )}
            </div>
          )}
          {showEmptyState ? (
            <div
              style={{
                margin: 'auto 0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '14px',
                padding: '8px 4px',
              }}
            >
              <Mascot pose="holding-wand" size={96} idle="float" />
              <p
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '18px',
                  fontWeight: 700,
                  color: 'var(--on-surface)',
                  margin: 0,
                }}
              >
                Ask Mage anything
              </p>
              <p style={{ fontSize: '13px', color: 'var(--on-surface-variant)', margin: 0, maxWidth: '260px' }}>
                {contextTitle
                  ? `Ask about ${contextTitle}, or anything else you’re studying.`
                  : 'Get explanations, quiz yourself, or plan what to study next.'}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px', marginTop: '4px' }}>
                {presentation.chips.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="mage-chip"
                    onClick={() => handleSend(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((m) =>
                m.role === 'user' ? (
                  <MessageBubble key={m.id} role="user" content={m.content} />
                ) : (
                  // Assistant turn — mascot avatar + a column holding the gated
                  // answer, its source chips, action cards, and the mode-switch row.
                  <div key={m.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <MageAvatar />
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <GatedAnswer
                        content={m.content}
                        gate={m.revealGate ?? 'open'}
                        notebookId={groundedNotebookId}
                        onNavigate={navigateTo}
                      />
                      <SourceFooter
                        sources={m.sources}
                        sourceMode={m.sourceMode}
                        notFoundInMaterial={m.notFoundInMaterial}
                        onNavigate={navigateTo}
                      />
                      {m.actions && m.actions.length > 0 && (
                        <ActionCardList actions={m.actions} onRun={handleAction} />
                      )}
                      {/* Phase 9 — re-ask the same question in a different mode. Only
                          under the latest answer, and only for answers born of a
                          question (not action-card / aborted turns). */}
                      {m.question && m.id === lastMessageId && switchesIdle && (
                        <ModeSwitchRow
                          current={m.mode ?? 'quick'}
                          onSwitch={(mode) => handleSend(m.question!, mode)}
                        />
                      )}
                    </div>
                  </div>
                )
              )}
              {isStreaming && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <MageAvatar />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {revealGate === 'open' ? (
                      <MessageBubble
                        role="assistant"
                        content={streamingText}
                        streaming
                        notebookId={groundedNotebookId}
                        onNavigate={navigateTo}
                      />
                    ) : (
                      // Phase 8 — never paint the live answer text under a gate; show
                      // the barrier instead (sealed copy, or a "preparing" placeholder
                      // for hint_only — the Reveal button arrives once the turn settles).
                      <GateBubble variant={revealGate === 'sealed' ? 'sealed' : 'hint'} streaming />
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Error row */}
        {error && (
          <div
            role="alert"
            style={{
              flexShrink: 0,
              padding: '8px 14px',
              fontSize: '12px',
              color: 'var(--error)',
              borderTop: '1px solid var(--outline-variant)',
            }}
          >
            {error}
          </div>
        )}

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(input);
          }}
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'flex-end',
            gap: '8px',
            padding: '10px 12px',
            paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
            borderTop: '1px solid var(--outline-variant)',
            background: 'var(--surface-container)',
          }}
        >
          <textarea
            ref={inputRef}
            className="mage-input"
            value={input}
            rows={1}
            placeholder={showContextCard ? 'Ask Mage about this…' : 'Ask Mage anything…'}
            disabled={isStreaming || building}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(input);
              }
            }}
            style={{
              flex: 1,
              resize: 'none',
              maxHeight: '140px',
              padding: '10px 16px',
              borderRadius: '22px',
              border: '1px solid var(--outline-variant)',
              background: 'var(--surface-container-high)',
              color: 'var(--on-surface)',
              fontFamily: 'inherit',
              fontSize: '14px',
              lineHeight: 1.4,
              outline: 'none',
            }}
          />
          {isStreaming ? (
            <button
              type="button"
              className="mage-send"
              onClick={abort}
              aria-label="Stop generating"
            >
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '20px' }}>
                stop
              </span>
            </button>
          ) : (
            <button
              type="submit"
              className="mage-send"
              disabled={input.trim().length === 0 || building}
              aria-label="Send message"
            >
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '20px' }}>
                arrow_upward
              </span>
            </button>
          )}
        </form>

        {/* Phase 6 — medium-risk generation confirm (overlays the panel). */}
        {pendingAction && (
          <ActionConfirm
            card={pendingAction}
            onConfirm={() => {
              const card = pendingAction;
              setPendingAction(null);
              runGenerateAction(card);
            }}
            onCancel={() => setPendingAction(null)}
          />
        )}

        {/* Chat history — a simple overlay to start a new chat or reopen an old
            one. Clicking the scrim or an item closes it. */}
        {historyOpen && (
          <div
            className="mage-history"
            role="dialog"
            aria-label="Chat history"
            onClick={() => setHistoryOpen(false)}
          >
            <div className="mage-history-card" onClick={(e) => e.stopPropagation()}>
              <div className="mage-history-head">
                <span className="mage-history-title">Your chats</span>
                <button
                  type="button"
                  className="mage-icon-btn"
                  onClick={() => setHistoryOpen(false)}
                  aria-label="Close history"
                >
                  <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '20px' }}>
                    close
                  </span>
                </button>
              </div>
              <button type="button" className="mage-history-new" onClick={startNewChat}>
                <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '18px' }}>
                  add
                </span>
                New chat
              </button>
              <div className="mage-history-list custom-scrollbar">
                {chatsLoading ? (
                  <p className="mage-history-empty">Loading…</p>
                ) : chats.length === 0 ? (
                  <p className="mage-history-empty">No chats yet. Start one above.</p>
                ) : (
                  chats.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="mage-history-item"
                      onClick={() => openChat(c.id)}
                    >
                      <span className="mage-history-item-title">{c.title || 'Untitled chat'}</span>
                      <span className="mage-history-item-time">{relativeTime(c.updatedAt)}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </aside>

      <style>{`
        .mage-panel {
          /* Cream palette — scoped to the panel so every semantic token it uses
             resolves to the warm redesign instead of the dark global theme. The
             panel rides at the document root (outside the AppShell .shell), so it
             can't inherit those vars; it declares its own here. Children (incl.
             the confirm overlay) inherit them. */
          --surface-container-low: #faf7f0;
          --surface-container: #ffffff;
          --surface-container-high: #ffffff;
          --surface-bright: #f6f3ec;
          --outline: #e4ddcd;
          --outline-variant: #ece6d8;
          --on-surface: #18202f;
          --on-surface-variant: #6b7280;
          --primary: #7c5cff;
          --primary-dim: #6a47f4;
          --on-primary: #ffffff;
          --error: #c0392b;
          /* extra cream accents the redesign uses for chips / badges / avatars */
          --mage-lilac: #ede9ff;
          --mage-lilac-soft: #f4f1ff;
          --mage-accent: #4326b8;
          --mage-shadow: 0 1px 2px rgba(24, 32, 47, 0.04), 0 8px 22px rgba(24, 32, 47, 0.06);
          transition:
            transform 0.32s cubic-bezier(0.22, 1, 0.36, 1),
            opacity 0.32s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .mage-scrim {
          transition: opacity 0.32s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .mage-icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 11px;
          border: none;
          background: #f4f0e8;
          color: var(--on-surface);
          cursor: pointer;
          flex-shrink: 0;
          transition:
            background 0.14s cubic-bezier(0.22, 1, 0.36, 1),
            transform 0.14s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .mage-icon-btn:hover { background: #ece6d8; color: var(--on-surface); }
        .mage-icon-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
        .mage-icon-btn:active { transform: scale(0.92); }
        .mage-icon-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        /* Chat history overlay — start a new chat / reopen an old one. */
        .mage-history {
          position: absolute;
          inset: 0;
          z-index: 20;
          display: flex;
          flex-direction: column;
          background: rgba(24, 32, 47, 0.28);
          backdrop-filter: blur(2px);
          padding: 52px 12px 12px;
          animation: mage-history-in 0.18s cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes mage-history-in { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .mage-history { animation: none; } }
        .mage-history-card {
          display: flex;
          flex-direction: column;
          min-height: 0;
          max-height: 100%;
          background: var(--surface-container);
          border: 1px solid var(--outline-variant);
          border-radius: 16px;
          box-shadow: var(--mage-shadow);
          overflow: hidden;
        }
        .mage-history-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 12px 10px 8px 16px;
          flex-shrink: 0;
        }
        .mage-history-title {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 15px;
          color: var(--on-surface);
        }
        .mage-history-new {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin: 0 12px 8px;
          padding: 10px 14px;
          border: none;
          border-radius: 12px;
          background: var(--primary);
          color: var(--on-primary);
          font-family: inherit;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          flex-shrink: 0;
          transition:
            background 0.14s cubic-bezier(0.22, 1, 0.36, 1),
            transform 0.14s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .mage-history-new:hover { background: var(--primary-dim); }
        .mage-history-new:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
        .mage-history-new:active { transform: translateY(1px); }
        .mage-history-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 2px 8px 10px;
          overflow-y: auto;
          min-height: 0;
        }
        .mage-history-empty {
          margin: 0;
          padding: 18px 8px;
          text-align: center;
          font-size: 13px;
          color: var(--on-surface-variant);
        }
        .mage-history-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          width: 100%;
          text-align: left;
          padding: 10px 12px;
          border: none;
          border-radius: 10px;
          background: transparent;
          color: var(--on-surface);
          font-family: inherit;
          cursor: pointer;
          transition: background 0.14s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .mage-history-item:hover { background: var(--mage-lilac-soft); }
        .mage-history-item:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
        .mage-history-item:active { background: var(--mage-lilac); }
        .mage-history-item-title {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 13.5px;
          font-weight: 600;
        }
        .mage-history-item-time {
          flex-shrink: 0;
          font-size: 11.5px;
          color: var(--on-surface-variant);
        }

        .mage-chip {
          text-align: center;
          padding: 9px 15px;
          border-radius: 999px;
          border: none;
          background: var(--mage-lilac-soft);
          color: var(--mage-accent);
          font-family: inherit;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition:
            background 0.14s cubic-bezier(0.22, 1, 0.36, 1),
            transform 0.14s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .mage-chip:hover { background: var(--mage-lilac); }
        .mage-chip:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
        .mage-chip:active { transform: translateY(1px); }

        .mage-input:focus-visible { border-color: var(--primary); }
        .mage-input::placeholder { color: var(--on-surface-variant); }
        .mage-input:disabled { opacity: 0.6; cursor: not-allowed; }

        .mage-send {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          flex-shrink: 0;
          border-radius: var(--radius-full);
          border: none;
          background: var(--primary);
          color: var(--on-primary);
          cursor: pointer;
          transition:
            background 0.14s cubic-bezier(0.22, 1, 0.36, 1),
            transform 0.14s cubic-bezier(0.22, 1, 0.36, 1),
            opacity 0.14s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .mage-send:hover { background: var(--primary-dim); }
        .mage-send:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
        .mage-send:active { transform: scale(0.92); }
        .mage-send:disabled { opacity: 0.4; cursor: not-allowed; }

        .mage-caret {
          color: var(--primary);
          margin-left: 1px;
          animation: mage-blink 1s step-end infinite;
        }
        @keyframes mage-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

        .mage-source-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 11px 3px 3px;
          max-width: 100%;
          border-radius: 999px;
          border: none;
          background: var(--mage-lilac-soft);
          color: var(--on-surface);
          font-family: inherit;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition:
            background 0.14s cubic-bezier(0.22, 1, 0.36, 1),
            color 0.14s cubic-bezier(0.22, 1, 0.36, 1),
            transform 0.14s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .mage-source-chip:hover { background: var(--mage-lilac); color: var(--on-surface); }
        .mage-source-chip:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
        .mage-source-chip:active { transform: translateY(1px); }
        .mage-source-chip--static { cursor: default; }
        .mage-source-chip--static:hover { background: var(--mage-lilac-soft); color: var(--on-surface); }
        .mage-source-chip--static:active { transform: none; }
        .mage-snum {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 22px;
          height: 22px;
          padding: 0 5px;
          border-radius: 7px;
          background: var(--primary);
          color: #fff;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.02em;
          flex-shrink: 0;
        }

        .mage-source-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 9px;
          border-radius: var(--radius-full);
          border: 1px dashed var(--outline-variant);
          background: transparent;
          color: var(--on-surface-variant);
          font-size: 11px;
          font-weight: 600;
        }

        .mage-gate-bubble {
          max-width: 88%;
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 11px 13px;
          border-radius: var(--radius-lg);
          background: var(--surface-container-high);
          border: 1px solid var(--outline-variant);
          color: var(--on-surface);
        }
        .mage-gate-bubble[data-variant='sealed'] { border-style: dashed; }
        .mage-gate-head { display: flex; align-items: center; gap: 8px; }
        .mage-gate-ico {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          flex-shrink: 0;
          border-radius: var(--radius-sm);
          background: var(--mage-lilac-soft);
          color: var(--mage-accent);
        }
        .mage-gate-title {
          font-family: var(--font-display);
          font-size: 14px;
          font-weight: 700;
          color: var(--on-surface);
          letter-spacing: -0.01em;
        }
        .mage-gate-body {
          margin: 0;
          font-size: 13px;
          line-height: 1.5;
          color: var(--on-surface-variant);
        }
        .mage-reveal-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          align-self: flex-start;
          padding: 7px 13px;
          border-radius: var(--radius-full);
          border: 1px solid var(--outline-variant);
          background: var(--surface-container);
          color: var(--on-surface);
          font-family: inherit;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition:
            background 0.14s cubic-bezier(0.22, 1, 0.36, 1),
            transform 0.14s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .mage-reveal-btn:hover { background: var(--surface-bright); }
        .mage-reveal-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
        .mage-reveal-btn:active { transform: translateY(1px); }

        .mage-action-card {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          text-align: left;
          padding: 9px 11px;
          border-radius: var(--radius-md);
          border: 1px solid var(--outline-variant);
          background: var(--surface-container-high);
          color: var(--on-surface);
          font-family: inherit;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition:
            background 0.14s cubic-bezier(0.22, 1, 0.36, 1),
            transform 0.14s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .mage-action-card:hover { background: var(--surface-bright); }
        .mage-action-card:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
        .mage-action-card:active { transform: translateY(1px); }
        .mage-action-ico {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          flex-shrink: 0;
          border-radius: var(--radius-sm);
          background: var(--mage-lilac-soft);
          color: var(--mage-accent);
        }

        .mage-artifact-pill {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          align-self: flex-start;
          padding: 8px 12px;
          border-radius: var(--radius-md);
          border: 1px solid var(--outline-variant);
          background: var(--surface-container);
          color: var(--primary);
          font-family: inherit;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition:
            background 0.14s cubic-bezier(0.22, 1, 0.36, 1),
            transform 0.14s cubic-bezier(0.22, 1, 0.36, 1);
        }
        button.mage-artifact-pill { min-width: 180px; }
        .mage-artifact-pill:hover { background: var(--surface-bright); }
        .mage-artifact-pill:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
        .mage-artifact-pill:active { transform: translateY(1px); }
        .mage-artifact-pill--static {
          cursor: default;
          color: var(--on-surface-variant);
        }
        .mage-artifact-pill--static:hover { background: var(--surface-container); }
        .mage-artifact-pill--static:active { transform: none; }

        .mage-mode-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 2px;
          max-width: 88%;
        }
        .mage-mode-switch {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          border-radius: 999px;
          border: none;
          background: var(--mage-lilac-soft);
          color: var(--mage-accent);
          font-family: inherit;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition:
            background 0.14s cubic-bezier(0.22, 1, 0.36, 1),
            color 0.14s cubic-bezier(0.22, 1, 0.36, 1),
            transform 0.14s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .mage-mode-switch:hover { background: var(--mage-lilac); color: var(--mage-accent); }
        .mage-mode-switch:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
        .mage-mode-switch:active { transform: translateY(1px); }

        .mage-confirm-scrim {
          position: absolute;
          inset: 0;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          background: rgba(8, 6, 24, 0.6);
          animation: mage-confirm-in 0.16s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .mage-confirm {
          width: 100%;
          max-width: 320px;
          border-radius: var(--radius-lg);
          border: 1px solid var(--outline-variant);
          background: var(--surface-container-high);
          padding: 16px;
          box-shadow: 0 8px 32px rgba(174, 137, 255, 0.06), 0 2px 8px rgba(0, 0, 0, 0.3);
        }
        .mage-confirm-btn {
          flex: 1;
          padding: 9px 12px;
          border-radius: var(--radius-md);
          border: 1px solid var(--outline-variant);
          background: var(--surface-container);
          color: var(--on-surface);
          font-family: inherit;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition:
            background 0.14s cubic-bezier(0.22, 1, 0.36, 1),
            transform 0.14s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .mage-confirm-btn:hover { background: var(--surface-bright); }
        .mage-confirm-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
        .mage-confirm-btn:active { transform: translateY(1px); }
        .mage-confirm-btn--primary {
          background: var(--primary);
          color: var(--on-primary);
          border-color: transparent;
        }
        .mage-confirm-btn--primary:hover { background: var(--primary-dim); }
        @keyframes mage-confirm-in { from { opacity: 0; } to { opacity: 1; } }

        @media (prefers-reduced-motion: reduce) {
          .mage-panel, .mage-scrim { transition: opacity 0.12s linear; }
          .mage-icon-btn, .mage-chip, .mage-send, .mage-source-chip, .mage-action-card, .mage-confirm-btn, .mage-reveal-btn, .mage-mode-switch, .mage-artifact-pill { transition: none; }
          .mage-icon-btn:active, .mage-chip:active, .mage-send:active, .mage-source-chip:active, .mage-action-card:active, .mage-confirm-btn:active, .mage-reveal-btn:active, .mage-mode-switch:active, .mage-artifact-pill:active { transform: none; }
          .mage-caret { animation: none; }
          .mage-confirm-scrim { animation: none; }
        }
      `}</style>
    </>
  );
}

/**
 * Phase 4 — the citation footer under an assistant answer. Renders a chip per
 * resolved source (deep-linking when the source has a route) plus a "General
 * knowledge" badge when the answer wasn't grounded in the learner's material.
 * Renders nothing when there's neither.
 */
function SourceFooter({
  sources,
  sourceMode,
  notFoundInMaterial,
  onNavigate,
}: {
  sources?: MageSource[];
  sourceMode?: MageSourceMode;
  notFoundInMaterial?: boolean;
  onNavigate: (href: string) => void;
}) {
  const chips = sources ?? [];
  const hasChips = chips.length > 0;
  const showGeneralBadge = Boolean(notFoundInMaterial) || (sourceMode === 'general' && !hasChips);
  if (!hasChips && !showGeneralBadge) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px',
        paddingLeft: '2px',
        maxWidth: '88%',
      }}
    >
      {chips.map((s) => {
        const href = s.href;
        const fullLabel = `${mageSourceLabel(s.kind)}: ${s.title}${s.subtitle ? ` — ${s.subtitle}` : ''}${
          s.pageLabel ? ` (${s.pageLabel})` : ''
        }`;
        const inner = (
          <>
            <span className="mage-snum" aria-hidden>
              S{s.n}
            </span>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '170px',
              }}
            >
              {s.title}
            </span>
            {s.pageLabel && (
              <span style={{ opacity: 0.7, flexShrink: 0 }}>· {s.pageLabel}</span>
            )}
          </>
        );
        return href ? (
          <button
            key={s.n}
            type="button"
            className="mage-source-chip"
            title={fullLabel}
            onClick={() => onNavigate(href)}
          >
            {inner}
          </button>
        ) : (
          <span key={s.n} className="mage-source-chip mage-source-chip--static" title={fullLabel}>
            {inner}
          </span>
        );
      })}
      {showGeneralBadge && (
        <span className="mage-source-badge" title="Answered from general knowledge, not your material">
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '14px', flexShrink: 0 }}>
            public
          </span>
          General knowledge
        </span>
      )}
    </div>
  );
}

/** Trailing glyph per action kind — open vs. edit vs. generate. */
const ACTION_TRAILING: Record<MageActionCard['kind'], string> = {
  navigate: 'arrow_outward',
  prefill: 'edit',
  generate: 'auto_awesome',
  gate: '',
};

/**
 * Phase 6 — the action cards under an assistant answer. Each runs a
 * server-offered action: low-risk navigation + high-risk prefill open a deep
 * link the server already authorized; medium-risk generation routes through a
 * confirm dialog (handled by the parent). The icon + label come straight from
 * the resolved card; the trailing glyph hints at the action kind.
 */
function ActionCardList({
  actions,
  onRun,
}: {
  actions: MageActionCard[];
  onRun: (card: MageActionCard) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '88%', marginTop: '2px' }}>
      {actions.map((card) => (
        <button key={card.id} type="button" className="mage-action-card" onClick={() => onRun(card)}>
          <span className="mage-action-ico" aria-hidden>
            <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>
              {card.icon}
            </span>
          </span>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {card.label}
          </span>
          {ACTION_TRAILING[card.kind] && (
            <span
              className="material-symbols-outlined"
              aria-hidden
              style={{ fontSize: '16px', flexShrink: 0, color: 'var(--on-surface-variant)' }}
            >
              {ACTION_TRAILING[card.kind]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * Phase 9 — the mode switch row under the latest answer. Offers the two modes
 * the current answer ISN'T, each re-asking the same question in that mode:
 * `[Go deeper]` (Sonnet, thorough), `[Use only my material]` (source-bound +
 * hint-gated), `[Answer faster]` (Haiku, concise). The server re-authorizes the
 * mode like any other context field.
 */
function ModeSwitchRow({
  current,
  onSwitch,
}: {
  current: MageMode;
  onSwitch: (mode: MageMode) => void;
}) {
  const others = MODE_ORDER.filter((m) => m !== current);
  return (
    <div className="mage-mode-row" role="group" aria-label="Answer in a different mode">
      {others.map((m) => (
        <button key={m} type="button" className="mage-mode-switch" onClick={() => onSwitch(m)}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '15px' }}>
            {MODE_SWITCHES[m].icon}
          </span>
          {MODE_SWITCHES[m].label}
        </button>
      ))}
    </div>
  );
}

/**
 * Phase 6 — confirm dialog for a medium-risk (generate) action. It spends
 * generation quota, so the learner approves first; the server re-checks quota
 * again at execution (Phase 7). Overlays the panel; Esc / Cancel dismiss
 * without bubbling the close to the panel itself.
 */
function ActionConfirm({
  card,
  onConfirm,
  onCancel,
}: {
  card: MageActionCard;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirm = card.confirm;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  return (
    <div
      className="mage-confirm-scrim"
      role="dialog"
      aria-modal="true"
      aria-label={confirm?.title ?? card.label}
      onClick={onCancel}
    >
      <div className="mage-confirm" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <span className="mage-action-ico" aria-hidden>
            <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>
              {card.icon}
            </span>
          </span>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '15px',
              fontWeight: 700,
              color: 'var(--on-surface)',
            }}
          >
            {confirm?.title ?? card.label}
          </span>
        </div>
        {confirm?.body && (
          <p style={{ margin: '0 0 14px', fontSize: '13px', lineHeight: 1.5, color: 'var(--on-surface-variant)' }}>
            {confirm.body}
          </p>
        )}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" className="mage-confirm-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="mage-confirm-btn mage-confirm-btn--primary" onClick={onConfirm}>
            {confirm?.confirmLabel ?? 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Phase 8 — an assistant answer rendered behind the server's reveal gate. The
 * gate decision is the pure `gateVisibility` (server-authoritative — the model
 * can't leak past it):
 *  - `open`      → the prose renders as a normal bubble.
 *  - `sealed`    → the prose NEVER renders (exam): a locked notice instead, with
 *                  no way to reveal it.
 *  - `hint_only` → the prose hides behind a "Reveal answer" button (practice):
 *                  hint-first, then reveal on click.
 * Source chips + action cards live OUTSIDE this gate (rendered by the caller),
 * so an exam answer still surfaces its readiness chips while staying sealed.
 */
function GatedAnswer({
  content,
  gate,
  notebookId,
  onNavigate,
}: {
  content: string;
  gate: MageRevealGate;
  notebookId?: string;
  onNavigate?: (href: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const vis = gateVisibility(gate, revealed);
  if (vis.showBody)
    return (
      <MessageBubble role="assistant" content={content} notebookId={notebookId} onNavigate={onNavigate} />
    );
  if (vis.sealed) return <GateBubble variant="sealed" />;
  return <GateBubble variant="hint" onReveal={() => setRevealed(true)} />;
}

/**
 * Phase 8 — the barrier shown in place of a gated answer body. `sealed` (exam)
 * shows a locked notice with no reveal affordance; `hint` (practice) nudges the
 * learner to try first, then offers a Reveal button — except while `streaming`,
 * when the answer isn't ready yet so we show a "preparing" placeholder instead.
 */
function GateBubble({
  variant,
  onReveal,
  streaming = false,
}: {
  variant: 'sealed' | 'hint';
  onReveal?: () => void;
  streaming?: boolean;
}) {
  const sealed = variant === 'sealed';
  const preparing = !sealed && streaming;
  const title = sealed ? 'Answer sealed' : preparing ? 'Preparing your answer' : 'Try it first';
  const body = sealed
    ? "Exam mode keeps answers hidden. I'll help you decide what to review — I just won't hand over the answer here."
    : preparing
      ? null
      : 'Give the question a go, then reveal the full answer when you’re ready.';
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <div className="mage-gate-bubble" data-variant={variant}>
        <div className="mage-gate-head">
          <span className="mage-gate-ico" aria-hidden>
            <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>
              {sealed ? 'lock' : 'lightbulb'}
            </span>
          </span>
          <span className="mage-gate-title">{title}</span>
          {preparing && <TypingDots />}
        </div>
        {body && <p className="mage-gate-body">{body}</p>}
        {onReveal && !preparing && (
          <button type="button" className="mage-reveal-btn" onClick={onReveal}>
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '16px' }}>
              visibility
            </span>
            Reveal answer
          </button>
        )}
      </div>
    </div>
  );
}

/** Small mascot avatar shown beside each assistant message (cream redesign). */
function MageAvatar() {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 30,
        height: 30,
        flexShrink: 0,
        borderRadius: 9,
        background: 'var(--mage-lilac-soft)',
        overflow: 'hidden',
        marginTop: 2,
      }}
    >
      <Mascot pose="chatting" size={26} idle="none" />
    </span>
  );
}

function MessageBubble({
  role,
  content,
  streaming = false,
  notebookId,
  onNavigate,
}: {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  /** Phase 10 — host study pack for resolving inline artifact-marker links. */
  notebookId?: string;
  onNavigate?: (href: string) => void;
}) {
  const isUser = role === 'user';
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <div
        style={{
          maxWidth: isUser ? '88%' : '100%',
          padding: isUser ? '10px 14px' : '11px 14px',
          borderRadius: 'var(--radius-lg)',
          background: isUser ? 'var(--primary)' : 'var(--surface-container-high)',
          color: isUser ? 'var(--on-primary)' : 'var(--on-surface)',
          border: isUser ? 'none' : '1px solid var(--outline-variant)',
          boxShadow: isUser
            ? '0 6px 16px rgba(124, 92, 255, 0.26)'
            : 'var(--mage-shadow)',
          fontSize: '14px',
          lineHeight: 1.55,
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
        }}
      >
        {isUser ? (
          content
        ) : content ? (
          <AssistantBody content={content} notebookId={notebookId} onNavigate={onNavigate} />
        ) : (
          <TypingDots />
        )}
        {streaming && content && (
          <span aria-hidden="true" className="mage-caret">
            ▍
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Phase 10 — salvaged from the retired `ChatThread`. Renders an assistant answer,
 * splitting out inline `[flashcard_set:id]` / `[quiz_set:id]` artifact markers
 * into deep-link pills. Mage panel turns generate artifacts via action cards (so
 * they rarely embed these), but a RESUMED legacy notebook chat can — without
 * this they'd render as raw `[quiz_set:…]` text. Plain answers (the common case)
 * skip straight to the markdown renderer.
 */
const SET_MARKER_RE = /\[(flashcard_set|quiz_set):([^\]]+)\]/g;

function AssistantBody({
  content,
  notebookId,
  onNavigate,
}: {
  content: string;
  notebookId?: string;
  onNavigate?: (href: string) => void;
}) {
  if (!content.includes('[flashcard_set:') && !content.includes('[quiz_set:')) {
    return <MarkdownRenderer content={content} variant="bubble" />;
  }

  const parts: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  const re = new RegExp(SET_MARKER_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) {
      const chunk = content.slice(last, m.index).trim();
      if (chunk) parts.push(<MarkdownRenderer key={`md-${key++}`} content={chunk} variant="bubble" />);
    }
    const isQuiz = m[1] === 'quiz_set';
    const setId = m[2];
    // Quiz sets run in the shared practice player; flashcard sets have no
    // standalone surface anymore, so only quizzes (with a notebook id) deep-link.
    const href =
      notebookId && isQuiz ? `/practice/session/${notebookId}/${setId}` : undefined;
    parts.push(
      <SetMarkerPill
        key={`set-${key++}`}
        isQuiz={isQuiz}
        href={onNavigate ? href : undefined}
        onNavigate={onNavigate}
      />
    );
    last = m.index + m[0].length;
  }
  if (last < content.length) {
    const tail = content.slice(last).trim();
    if (tail) parts.push(<MarkdownRenderer key={`md-${key++}`} content={tail} variant="bubble" />);
  }

  return <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>{parts}</div>;
}

/** A salvaged generated-artifact pill (flashcards / quiz). Clickable when the
 *  host study pack is known; otherwise a static label. */
function SetMarkerPill({
  isQuiz,
  href,
  onNavigate,
}: {
  isQuiz: boolean;
  href?: string;
  onNavigate?: (href: string) => void;
}) {
  const label = isQuiz ? 'Open quiz' : 'Open flashcards';
  const icon = isQuiz ? 'quiz' : 'style';
  if (href && onNavigate) {
    return (
      <button type="button" className="mage-artifact-pill" onClick={() => onNavigate(href)}>
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '17px' }}>
          {icon}
        </span>
        {label}
        <span
          className="material-symbols-outlined"
          aria-hidden
          style={{ fontSize: '15px', marginLeft: 'auto', color: 'var(--on-surface-variant)' }}
        >
          arrow_outward
        </span>
      </button>
    );
  }
  return (
    <span className="mage-artifact-pill mage-artifact-pill--static">
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '17px' }}>
        {icon}
      </span>
      {isQuiz ? 'Quiz' : 'Flashcards'}
    </span>
  );
}

function TypingDots() {
  return (
    <span
      aria-label="Mage is thinking"
      role="status"
      style={{ display: 'inline-flex', gap: '4px', alignItems: 'center', height: '18px' }}
    >
      <span className="mage-dot" />
      <span className="mage-dot" />
      <span className="mage-dot" />
      <style>{`
        .mage-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--on-surface-variant);
          opacity: 0.4;
          animation: mage-dot-pulse 1.2s ease-in-out infinite;
        }
        .mage-dot:nth-child(2) { animation-delay: 0.2s; }
        .mage-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes mage-dot-pulse {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-3px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .mage-dot { animation: none; opacity: 0.6; }
        }
      `}</style>
    </span>
  );
}

export default MagePanel;
