'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type {
  SearchResults,
  SearchContext,
  UserResult,
  NotebookResult,
  CommunityNotebookResult,
  PageResult,
} from '@/types/search';

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const C = {
  bg: '#161630',
  elevated: '#232342',
  inputBg: '#2a2a4c',
  primary: '#ae89ff',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  border: '#555578',
  highlight: 'rgba(174,137,255,0.15)',
} as const;

const AVATAR_COLORS = [
  'linear-gradient(135deg, #ae89ff, #884efb)',
  'linear-gradient(135deg, #ff89ae, #fb4e88)',
  'linear-gradient(135deg, #89ffd4, #4efba5)',
  'linear-gradient(135deg, #ffde59, #fbae4e)',
];

function getAvatarGradient(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function highlightMatch(text: string, query: string) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ color: C.primary, fontWeight: 600 }}>{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

/* ── Category header ─────────────────────────────────────── */
function CategoryHeader({ icon, label, count }: { icon: string; label: string; count: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 14px 4px',
      fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.06em', color: C.textMuted,
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{icon}</span>
      {label}
      <span style={{
        marginLeft: 'auto', fontSize: 10, fontWeight: 600,
        background: 'rgba(174,137,255,0.1)', color: C.primary,
        borderRadius: 6, padding: '1px 6px',
      }}>{count}</span>
    </div>
  );
}

/* ── Result items ────────────────────────────────────────── */

function FriendActionButton({ status, onSendRequest }: { status: string; onSendRequest: (e: React.MouseEvent) => void }) {
  switch (status) {
    case 'none':
      return (
        <button
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onSendRequest(e); }}
          style={{
            background: C.primary, color: '#2a0066', fontSize: 10, fontWeight: 700,
            borderRadius: 6, padding: '3px 10px', border: 'none', cursor: 'pointer',
            flexShrink: 0, transition: `opacity 0.15s ${EASING}`,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
        >
          Add
        </button>
      );
    case 'pending_sent':
      return (
        <span style={{ fontSize: 10, color: C.textMuted, fontStyle: 'italic', flexShrink: 0 }}>
          Pending
        </span>
      );
    case 'pending_received':
      return (
        <button
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onSendRequest(e); }}
          style={{
            background: '#4ade80', color: '#000', fontSize: 10, fontWeight: 700,
            borderRadius: 6, padding: '3px 10px', border: 'none', cursor: 'pointer',
            flexShrink: 0, transition: `opacity 0.15s ${EASING}`,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
        >
          Accept
        </button>
      );
    case 'accepted':
      return (
        <span style={{ fontSize: 10, color: '#4efba5', fontWeight: 600, flexShrink: 0 }}>Friend</span>
      );
    default:
      return null;
  }
}

function UserItem({ user, query, onClick, onSendRequest }: { user: UserResult; query: string; onClick: () => void; onSendRequest: (e: React.MouseEvent) => void }) {
  return (
    <button onMouseDown={onClick} style={itemStyle}>
      <div style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: user.avatarUrl ? undefined : getAvatarGradient(user.id),
        fontSize: 12, fontWeight: 700, color: '#fff',
      }}>
        {user.avatarUrl
          ? <img src={user.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : (user.username || '?')[0].toUpperCase()
        }
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: C.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {highlightMatch(user.username, query)}
        </div>
        {user.name && (
          <div style={{ fontSize: 11, color: C.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user.name}
          </div>
        )}
      </div>
      <FriendActionButton status={user.friendshipStatus} onSendRequest={onSendRequest} />
    </button>
  );
}

function NotebookItem({ nb, query, onClick }: { nb: NotebookResult; query: string; onClick: () => void }) {
  return (
    <button onMouseDown={onClick} style={itemStyle}>
      <div style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        background: nb.color || C.primary, opacity: 0.8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fff' }}>book</span>
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: C.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {highlightMatch(nb.name, query)}
        </div>
        {nb.subject && (
          <div style={{ fontSize: 11, color: C.textMuted }}>{nb.subject}</div>
        )}
      </div>
    </button>
  );
}

function CommunityItem({ nb, query, onClick }: { nb: CommunityNotebookResult; query: string; onClick: () => void }) {
  return (
    <button onMouseDown={onClick} style={itemStyle}>
      <div style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        background: 'rgba(174,137,255,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: C.primary }}>public</span>
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: C.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {highlightMatch(nb.title || nb.name, query)}
        </div>
        <div style={{ fontSize: 11, color: C.textMuted }}>
          by @{nb.ownerUsername}{nb.subject ? ` · ${nb.subject}` : ''}
        </div>
      </div>
    </button>
  );
}

function PageItem({ page, query, onClick }: { page: PageResult; query: string; onClick: () => void }) {
  return (
    <button onMouseDown={onClick} style={{ ...itemStyle, alignItems: 'flex-start' }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0, marginTop: 2,
        background: 'rgba(174,137,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: C.primary }}>description</span>
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: C.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {highlightMatch(page.title, query)}
        </div>
        <div style={{ fontSize: 11, color: C.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {page.notebookName} › {page.sectionTitle}
        </div>
        {page.textSnippet && (
          <div style={{
            fontSize: 12, color: C.textSecondary, marginTop: 3,
            lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {highlightMatch(page.textSnippet, query)}
          </div>
        )}
      </div>
    </button>
  );
}

const itemStyle: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
  padding: '8px 14px', border: 'none', borderRadius: 8,
  background: 'transparent', cursor: 'pointer', textAlign: 'left',
  fontFamily: 'inherit', transition: `background 0.1s ${EASING}`,
};

/* ── Main dropdown ───────────────────────────────────────── */

interface SearchDropdownProps {
  query: string;
  results: SearchResults | null;
  isLoading: boolean;
  isVisible: boolean;
  onClose: () => void;
  context: SearchContext;
  compact?: boolean;
}

export default function SearchDropdown({
  query, results, isLoading, isVisible, onClose, context, compact,
}: SearchDropdownProps) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});

  // Reset overrides when results change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatusOverrides({});
  }, [results]);

  const handleFriendRequest = useCallback(async (username: string) => {
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      if (!res.ok) return;
      const json = await res.json();
      const newStatus = json?.data?.friendship?.status === 'accepted' ? 'accepted' : 'pending_sent';
      setStatusOverrides((prev) => ({ ...prev, [username]: newStatus }));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isVisible) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isVisible, onClose]);

  if (!isVisible || query.length < 2) return null;

  const hasUsers = (results?.users?.length ?? 0) > 0;
  const hasNotebooks = (results?.notebooks?.length ?? 0) > 0;
  const hasCommunity = (results?.communityNotebooks?.length ?? 0) > 0;
  const hasPages = (results?.pages?.length ?? 0) > 0;
  const hasAny = hasUsers || hasNotebooks || hasCommunity || hasPages;

  return (
    <div
      ref={ref}
      style={{
        position: compact ? 'relative' : 'absolute',
        top: compact ? 0 : 'calc(100% + 6px)',
        left: 0, right: 0, zIndex: 300,
        background: C.bg,
        border: compact ? 'none' : `1px solid ${C.border}`,
        borderRadius: compact ? 0 : 14,
        boxShadow: compact ? 'none' : '0 16px 48px rgba(0,0,0,0.5)',
        maxHeight: compact ? 'none' : 420,
        overflowY: 'auto',
        animation: compact ? 'none' : `searchDropIn 0.15s ${EASING}`,
      }}
    >
      {!compact && (
        <style>{`
          @keyframes searchDropIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }
          .search-item:hover { background: ${C.highlight} !important; }
        `}</style>
      )}
      {compact && (
        <style>{`
          .search-item:hover { background: ${C.highlight} !important; }
        `}</style>
      )}

      {isLoading && !hasAny && (
        <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: 13, color: C.textMuted }}>
          Searching…
        </div>
      )}

      {!isLoading && !hasAny && query.length >= 2 && (
        <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: 13, color: C.textMuted }}>
          No results for &ldquo;{query}&rdquo;
        </div>
      )}

      {hasUsers && (
        <div style={{ padding: '4px 0' }}>
          <CategoryHeader icon="person" label="Users" count={results!.users!.length} />
          {results!.users!.map((u) => {
            const effectiveUser = statusOverrides[u.username]
              ? { ...u, friendshipStatus: statusOverrides[u.username] }
              : u;
            return (
              <div key={u.id} className="search-item" style={{ borderRadius: 8, margin: '0 6px' }}>
                <UserItem
                  user={effectiveUser}
                  query={query}
                  onClick={() => { router.push(`/profile/${u.username}`); onClose(); }}
                  onSendRequest={(e) => { e.preventDefault(); e.stopPropagation(); handleFriendRequest(u.username); }}
                />
              </div>
            );
          })}
        </div>
      )}

      {hasNotebooks && (
        <div style={{ padding: '4px 0', borderTop: hasUsers ? `1px solid ${C.border}` : 'none' }}>
          <CategoryHeader icon="book" label="My Notebooks" count={results!.notebooks!.length} />
          {results!.notebooks!.map((nb) => (
            <div key={nb.id} className="search-item" style={{ borderRadius: 8, margin: '0 6px' }}>
              <NotebookItem nb={nb} query={query} onClick={() => { router.push(`/notebooks/${nb.id}`); onClose(); }} />
            </div>
          ))}
        </div>
      )}

      {hasCommunity && (
        <div style={{ padding: '4px 0', borderTop: (hasUsers || hasNotebooks) ? `1px solid ${C.border}` : 'none' }}>
          <CategoryHeader icon="public" label="Published Notebooks" count={results!.communityNotebooks!.length} />
          {results!.communityNotebooks!.map((nb) => (
            <div key={nb.shareId} className="search-item" style={{ borderRadius: 8, margin: '0 6px' }}>
              <CommunityItem nb={nb} query={query} onClick={() => { router.push(`/community/notebooks/${nb.shareId}`); onClose(); }} />
            </div>
          ))}
        </div>
      )}

      {hasPages && (
        <div style={{ padding: '4px 0', borderTop: (hasUsers || hasNotebooks || hasCommunity) ? `1px solid ${C.border}` : 'none' }}>
          <CategoryHeader icon="description" label="Pages" count={results!.pages!.length} />
          {results!.pages!.map((p) => (
            <div key={p.id} className="search-item" style={{ borderRadius: 8, margin: '0 6px' }}>
              <PageItem
                page={p}
                query={query}
                onClick={() => {
                  router.push(`/notebooks/${p.notebookId}/pages/${p.id}?highlight=${encodeURIComponent(query)}`);
                  onClose();
                }}
              />
            </div>
          ))}
        </div>
      )}

      <div style={{ height: 4 }} />
    </div>
  );
}
