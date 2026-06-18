'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import CreateChatModal from '@/components/learn/CreateChatModal';

// Phase 9.3 — /learn/chats list+detail rail. Renders the left rail (chats
// grouped by source notebook + cross-notebook fallback) and a main slot for
// either the empty-state index or [chatId] detail page.

interface ChatRow {
  id: string;
  title: string;
  primaryNotebookId: string | null;
  primaryNotebookName: string | null;
  primaryNotebookColor: string | null;
  primaryNotebookKind: string | null;
  contextNotebookIds: string[];
  contextPageIds: string[];
  contextDocIds: string[];
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ChatGroup {
  key: string;
  label: string;
  color: string | null;
  kind: 'standard' | 'inbox' | 'cross';
  chats: ChatRow[];
}

const RAIL_WIDTH = 280;
const CROSS_NOTEBOOK_KEY = '__cross__';

export default function LearnChatsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const params = useParams();
  // Pull the active chatId out of the URL segment. Used both for highlight-
  // pulse gating in the rail and for scroll-into-view on navigation.
  const activeChatId = typeof params?.chatId === 'string' ? (params.chatId as string) : null;
  const { isPhone, isTablet } = useBreakpoint();
  const isNarrow = isPhone || isTablet;

  const [chats, setChats] = useState<ChatRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [showRailOnPhone, setShowRailOnPhone] = useState(false);
  // Desktop-only rail collapse. Persists per-browser so the layout
  // survives reloads. The phone flow uses `showRailOnPhone` instead and
  // ignores this state.
  const [collapsed, setCollapsed] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setCollapsed(window.localStorage.getItem('learn.chats.rail.collapsed') === '1');
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('learn.chats.rail.collapsed', collapsed ? '1' : '0');
  }, [collapsed]);
  // Pulse the rail row when the active chatId changes (incoming navigation
  // from anywhere — e.g. notification, deep link, GenerateDropdown). Don't
  // re-pulse on every render or on the very first mount.
  const [pulseChatId, setPulseChatId] = useState<string | null>(null);
  const lastSeenChatIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeChatId) return;
    if (lastSeenChatIdRef.current === activeChatId) return;
    const isFirstMount = lastSeenChatIdRef.current === null;
    lastSeenChatIdRef.current = activeChatId;
    if (isFirstMount) return; // skip pulse on the initial render
    setPulseChatId(activeChatId);
    const t = window.setTimeout(() => setPulseChatId(null), 2000);
    return () => window.clearTimeout(t);
  }, [activeChatId]);

  const loadChats = useCallback(async () => {
    try {
      const res = await fetch('/api/learn/chats');
      const body = await res.json();
      if (body?.success) {
        setChats((body.data ?? []) as ChatRow[]);
      } else {
        setError(body?.error ?? 'Failed to load chats');
        setChats([]);
      }
    } catch {
      setError('Failed to load chats');
      setChats([]);
    }
  }, []);

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  useEffect(() => {
    const onTitleUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ chatId: string; title: string }>).detail;
      if (!detail?.chatId || !detail?.title) return;
      setChats((prev) =>
        prev ? prev.map((c) => (c.id === detail.chatId ? { ...c, title: detail.title } : c)) : prev,
      );
    };
    window.addEventListener('notemage:chat-title-updated', onTitleUpdated);
    return () => window.removeEventListener('notemage:chat-title-updated', onTitleUpdated);
  }, []);

  // Close phone rail once a chat is selected.
  useEffect(() => {
    if (isNarrow) setShowRailOnPhone(false);
  }, [pathname, isNarrow]);

  const filtered = useMemo<ChatRow[]>(() => {
    if (!chats) return [];
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) => c.title.toLowerCase().includes(q));
  }, [chats, search]);

  const groups = useMemo<ChatGroup[]>(() => {
    const byKey = new Map<string, ChatGroup>();

    for (const chat of filtered) {
      let key: string;
      let label: string;
      let color: string | null;
      let kind: ChatGroup['kind'];

      if (!chat.primaryNotebookId) {
        // No primary notebook. If the chat has at least one context notebook
        // it lives in the Cross-notebook bucket (rare: primary deleted).
        // Otherwise it's a pure Inbox/uploads chat — bucket it under cross
        // too so it doesn't get dropped.
        key = CROSS_NOTEBOOK_KEY;
        label = 'Across packs';
        color = null;
        kind = 'cross';
      } else if (chat.primaryNotebookKind === 'inbox') {
        key = chat.primaryNotebookId;
        label = 'Inbox';
        color = null;
        kind = 'inbox';
      } else {
        key = chat.primaryNotebookId;
        label = chat.primaryNotebookName ?? 'Untitled Study Pack';
        color = chat.primaryNotebookColor;
        kind = 'standard';
      }

      const existing = byKey.get(key);
      if (existing) {
        existing.chats.push(chat);
      } else {
        byKey.set(key, { key, label, color, kind, chats: [chat] });
      }
    }

    // Order: Inbox first, then standard notebooks (alpha), then cross-notebook.
    const list = Array.from(byKey.values());
    list.sort((a, b) => {
      const orderOf = (g: ChatGroup) =>
        g.kind === 'inbox' ? 0 : g.kind === 'standard' ? 1 : 2;
      const ao = orderOf(a);
      const bo = orderOf(b);
      if (ao !== bo) return ao - bo;
      return a.label.localeCompare(b.label);
    });
    return list;
  }, [filtered]);

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleCreated = useCallback(
    (chatId: string) => {
      setShowCreate(false);
      void loadChats();
      router.push(`/learn/chats/${chatId}`);
    },
    [loadChats, router],
  );

  const railVisible = isNarrow ? showRailOnPhone : !collapsed;

  return (
    <div
      style={{
        display: 'flex',
        flex: 1,
        minHeight: 0,
        position: 'relative',
        background: 'var(--background)',
      }}
    >
      {isNarrow && (
        <button
          type="button"
          onClick={() => setShowRailOnPhone((v) => !v)}
          aria-label={showRailOnPhone ? 'Hide chat list' : 'Show chat list'}
          style={{
            position: 'absolute',
            top: '12px',
            left: '12px',
            zIndex: 20,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '40px',
            height: '40px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--outline-variant)',
            background: 'var(--surface-container)',
            color: 'var(--on-surface)',
            cursor: 'pointer',
          }}
        >
          <span className="material-symbols-outlined" aria-hidden>
            {showRailOnPhone ? 'close' : 'menu'}
          </span>
        </button>
      )}

      {!isNarrow && collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Show chat list"
          style={{
            position: 'absolute',
            top: '12px',
            left: '12px',
            zIndex: 20,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '40px',
            height: '40px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--outline-variant)',
            background: 'var(--surface-container)',
            color: 'var(--on-surface)',
            cursor: 'pointer',
          }}
        >
          <span className="material-symbols-outlined" aria-hidden>
            chevron_right
          </span>
        </button>
      )}

      {railVisible && (
        <aside
          aria-label="Chats"
          style={{
            position: isNarrow ? 'absolute' : 'relative',
            top: 0,
            left: 0,
            bottom: 0,
            zIndex: 15,
            width: isNarrow ? 'min(320px, 90vw)' : `${RAIL_WIDTH}px`,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--surface-container-low)',
            borderRight: '1px solid var(--outline-variant)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '16px 16px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              borderBottom: '1px solid var(--outline-variant)',
            }}
          >
            <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--primary)',
                  color: 'var(--on-primary)',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }} aria-hidden>
                  add
                </span>
                New chat
              </button>
              {!isNarrow && (
                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
                  aria-label="Hide chat list"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '40px',
                    flexShrink: 0,
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--outline-variant)',
                    background: 'var(--surface-container)',
                    color: 'var(--on-surface)',
                    cursor: 'pointer',
                  }}
                >
                  <span className="material-symbols-outlined" aria-hidden>
                    chevron_left
                  </span>
                </button>
              )}
            </div>

            <label
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <span
                className="material-symbols-outlined"
                aria-hidden
                style={{
                  position: 'absolute',
                  left: '10px',
                  fontSize: '18px',
                  color: 'var(--on-surface-variant)',
                  pointerEvents: 'none',
                }}
              >
                search
              </span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chats"
                aria-label="Search chats by title"
                style={{
                  width: '100%',
                  padding: '8px 10px 8px 34px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--outline-variant)',
                  background: 'var(--surface-container)',
                  color: 'var(--on-surface)',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
            </label>
          </div>

          <div
            className="custom-scrollbar"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: '8px 0 16px',
            }}
          >
            {chats === null ? (
              <p
                style={{
                  margin: 0,
                  padding: '16px',
                  color: 'var(--on-surface-variant)',
                  fontSize: '13px',
                }}
              >
                Loading chats…
              </p>
            ) : error && chats.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  padding: '16px',
                  color: 'var(--error)',
                  fontSize: '13px',
                }}
              >
                {error}
              </p>
            ) : groups.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  padding: '16px',
                  color: 'var(--on-surface-variant)',
                  fontSize: '13px',
                  lineHeight: 1.5,
                }}
              >
                {search.trim().length > 0
                  ? 'No chats match that search.'
                  : 'No chats yet. Start one with the button above.'}
              </p>
            ) : (
              groups.map((group) => (
                <ChatGroupSection
                  key={group.key}
                  group={group}
                  isCollapsed={collapsedGroups.has(group.key)}
                  onToggle={() => toggleGroup(group.key)}
                  activePath={pathname}
                  pulseChatId={pulseChatId}
                />
              ))
            )}
          </div>
        </aside>
      )}

      <main
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--background)',
        }}
      >
        {children}
      </main>

      {showCreate && (
        <CreateChatModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreated}
        />
      )}
    </div>
  );
}

function ChatGroupSection({
  group,
  isCollapsed,
  onToggle,
  activePath,
  pulseChatId,
}: {
  group: ChatGroup;
  isCollapsed: boolean;
  onToggle: () => void;
  activePath: string;
  pulseChatId: string | null;
}) {
  return (
    <section style={{ marginBottom: '4px' }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!isCollapsed}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          padding: '8px 12px',
          background: 'transparent',
          border: 'none',
          color: 'var(--on-surface-variant)',
          fontSize: '12px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          cursor: 'pointer',
        }}
      >
        <span
          className="material-symbols-outlined"
          aria-hidden
          style={{
            fontSize: '18px',
            transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          expand_more
        </span>

        {group.kind === 'inbox' ? (
          <span
            className="material-symbols-outlined"
            aria-hidden
            style={{ fontSize: '16px', color: 'var(--on-surface-variant)' }}
          >
            mail
          </span>
        ) : group.kind === 'cross' ? (
          <span
            className="material-symbols-outlined"
            aria-hidden
            style={{ fontSize: '16px', color: 'var(--on-surface-variant)' }}
          >
            hub
          </span>
        ) : (
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: '10px',
              height: '10px',
              borderRadius: 'var(--radius-full)',
              background: group.color ?? 'var(--outline)',
              border: '1px solid var(--outline-variant)',
            }}
          />
        )}

        <span
          style={{
            flex: 1,
            textAlign: 'left',
            color: 'var(--on-surface)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {group.label}
        </span>

        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--on-surface-variant)',
          }}
        >
          {group.chats.length}
        </span>
      </button>

      {!isCollapsed && (
        <ul style={{ listStyle: 'none', margin: 0, padding: '2px 8px 8px' }}>
          {group.chats.map((chat) => {
            const href = `/learn/chats/${chat.id}`;
            const isActive = activePath === href || activePath.startsWith(`${href}/`);
            const isPulsing = pulseChatId === chat.id;
            return (
              <li key={chat.id}>
                <ChatRailRow
                  chat={chat}
                  href={href}
                  isActive={isActive}
                  isPulsing={isPulsing}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ChatRailRow({
  chat,
  href,
  isActive,
  isPulsing,
}: {
  chat: ChatRow;
  href: string;
  isActive: boolean;
  isPulsing: boolean;
}) {
  const rowRef = useRef<HTMLAnchorElement | null>(null);

  // Scroll the pulsing row into view so deep-link navigations don't leave
  // it off-screen. Triggers once per pulse activation.
  useEffect(() => {
    if (!isPulsing) return;
    const node = rowRef.current;
    if (node) {
      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [isPulsing]);

  return (
    <Link
      ref={rowRef}
      href={href}
      aria-current={isActive ? 'page' : undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        padding: '8px 10px',
        borderRadius: 'var(--radius-md)',
        background:
          isPulsing
            ? 'var(--surface-container-high)'
            : isActive
              ? 'var(--surface-container-high)'
              : 'transparent',
        color: 'var(--on-surface)',
        textDecoration: 'none',
        border:
          isPulsing || isActive
            ? '1px solid var(--primary)'
            : '1px solid transparent',
        boxShadow: isPulsing
          ? '0 0 0 3px color-mix(in srgb, var(--primary) 30%, transparent)'
          : 'none',
        transition:
          'background-color 0.35s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.35s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
      onMouseEnter={(e) => {
        if (!isActive && !isPulsing) {
          e.currentTarget.style.background = 'var(--surface-container)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive && !isPulsing) {
          e.currentTarget.style.background = 'transparent';
        }
      }}
    >
      <span
        style={{
          fontSize: '13px',
          fontWeight: isActive ? 700 : 600,
          color: 'var(--on-surface)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {chat.title}
      </span>
      <span
        style={{
          fontSize: '11px',
          color: 'var(--on-surface-variant)',
        }}
      >
        {chat.messageCount} {chat.messageCount === 1 ? 'message' : 'messages'}
      </span>
    </Link>
  );
}
