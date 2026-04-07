'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const COLORS = {
  pageBg: '#0d0d1a',
  cardBg: '#121222',
  elevated: '#1d1d33',
  primary: '#8c52ff',
  primaryLight: '#ae89ff',
  secondary: '#ffde59',
  textPrimary: '#ede9ff',
  textSecondary: '#aaa8c8',
  textMuted: '#737390',
  border: '#464560',
  borderSubtle: '#2a2a44',
  success: '#4ade80',
} as const;

const SUBJECT_COLORS: Record<string, { bg: string; text: string }> = {
  Physics: { bg: 'rgba(255,107,107,0.15)', text: '#ff6b6b' },
  Design: { bg: 'rgba(255,222,89,0.15)', text: '#ffde59' },
  History: { bg: 'rgba(255,177,66,0.15)', text: '#ffb142' },
  'Computer Science': { bg: 'rgba(78,205,196,0.15)', text: '#4ecdc4' },
  Philosophy: { bg: 'rgba(166,137,255,0.15)', text: '#a689ff' },
  default: { bg: 'rgba(140,82,255,0.12)', text: '#ae89ff' },
};

interface CatalogNotebook {
  shareId: string;
  notebookId: string;
  name: string;
  subject?: string | null;
  color?: string | null;
  title?: string | null;
  description?: string | null;
  author: { id: string; username: string; avatarUrl?: string | null };
  sharedAt: string;
  downloadCount: number;
  ratingCount: number;
  averageRating: number;
  viewCount: number;
  tags: string[];
  coverImageUrl?: string | null;
}

const TAG_COLORS = ['#ff6b6b', '#ffde59', '#4ecdc4', '#ffb142', '#ae89ff', '#ff89ae', '#63cdff', '#48db9c'];

const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest' },
  { key: 'downloads', label: 'Most Downloaded' },
  { key: 'rating', label: 'Highest Rated' },
  { key: 'views', label: 'Most Viewed' },
  { key: 'oldest', label: 'Oldest' },
];

const PERIOD_OPTIONS = [
  { key: 'all', label: 'All Time' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

export default function CommunityCatalogPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [notebooks, setNotebooks] = useState<CatalogNotebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters from URL
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [sort, setSort] = useState(searchParams.get('sort') || 'newest');
  const [period, setPeriod] = useState(searchParams.get('period') || 'all');
  const [tagFilter, setTagFilter] = useState(searchParams.get('tag') || '');

  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchNotebooks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('filter', 'all');
      params.set('sort', sort);
      params.set('period', period);
      params.set('page', String(page));
      params.set('limit', '20');
      if (search) params.set('search', search);
      if (tagFilter) params.set('tag', tagFilter);

      const res = await fetch(`/api/community/notebooks?${params}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setNotebooks(json.data.notebooks || []);
          setTotal(json.data.total || 0);
          setTotalPages(json.data.totalPages || 1);
        }
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }, [sort, period, page, search, tagFilter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchNotebooks(); }, [fetchNotebooks]);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (sort !== 'newest') params.set('sort', sort);
    if (period !== 'all') params.set('period', period);
    if (tagFilter) params.set('tag', tagFilter);
    const qs = params.toString();
    const newUrl = qs ? `/community?${qs}` : '/community';
    window.history.replaceState(null, '', newUrl);
  }, [search, sort, period, tagFilter]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
    }, 300);
  };

  const [renderTimestamp] = useState(() => Date.now());

  function timeAgo(dateStr: string): string {
    const diff = renderTimestamp - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px 64px' }}>
      <style>{`
        @keyframes catalogPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <button
          onClick={() => router.push('/home')}
          style={{
            border: 'none', background: COLORS.elevated, borderRadius: 10,
            padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center',
            color: COLORS.textMuted, fontFamily: 'inherit',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_back</span>
        </button>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>
          Community Library
        </h1>
      </div>
      <p style={{ fontSize: 14, color: COLORS.textMuted, margin: '0 0 28px' }}>
        Discover notebooks shared by the community · {total} notebook{total !== 1 ? 's' : ''}
      </p>

      {/* Active tag filter */}
      {tagFilter && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: COLORS.textMuted }}>Filtered by:</span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 8,
            background: 'rgba(140,82,255,0.12)', color: COLORS.primaryLight,
            fontSize: 13, fontWeight: 600,
          }}>
            #{tagFilter}
            <button
              onClick={() => { setTagFilter(''); setPage(1); }}
              style={{ border: 'none', background: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 16, lineHeight: 1, display: 'flex' }}
            >
              ×
            </button>
          </span>
        </div>
      )}

      {/* Search + Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <span className="material-symbols-outlined" style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            fontSize: 18, color: COLORS.textMuted,
          }}>
            search
          </span>
          <input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search notebooks, tags, authors..."
            style={{
              width: '100%', padding: '10px 14px 10px 38px', borderRadius: 10,
              border: `1px solid ${COLORS.borderSubtle}`, background: COLORS.elevated,
              color: COLORS.textPrimary, fontSize: 13, fontFamily: 'inherit', outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Sort */}
        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value); setPage(1); }}
          style={{
            padding: '10px 14px', borderRadius: 10,
            border: `1px solid ${COLORS.borderSubtle}`, background: COLORS.elevated,
            color: COLORS.textPrimary, fontSize: 13, fontFamily: 'inherit', outline: 'none',
            cursor: 'pointer',
          }}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>

        {/* Period */}
        <select
          value={period}
          onChange={(e) => { setPeriod(e.target.value); setPage(1); }}
          style={{
            padding: '10px 14px', borderRadius: 10,
            border: `1px solid ${COLORS.borderSubtle}`, background: COLORS.elevated,
            color: COLORS.textPrimary, fontSize: 13, fontFamily: 'inherit', outline: 'none',
            cursor: 'pointer',
          }}
        >
          {PERIOD_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Notebook grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ height: 220, borderRadius: 16, background: COLORS.cardBg, animation: 'catalogPulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      ) : notebooks.length === 0 ? (
        <div style={{
          padding: 60, textAlign: 'center', color: COLORS.textMuted,
          background: COLORS.cardBg, borderRadius: 16, border: `1px solid ${COLORS.borderSubtle}`,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 40, display: 'block', marginBottom: 10, opacity: 0.4 }}>search_off</span>
          <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 6 }}>No notebooks found</div>
          <div style={{ fontSize: 13 }}>Try adjusting your search or filters.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {notebooks.map((nb) => {
            const isHovered = hoveredCard === nb.shareId;
            const sc = SUBJECT_COLORS[nb.subject || ''] || SUBJECT_COLORS.default;
            const displayTitle = nb.title || nb.name;
            const accentColor = nb.color || COLORS.primaryLight;

            return (
              <Link
                key={nb.shareId}
                href={`/community/${nb.shareId}`}
                onMouseEnter={() => setHoveredCard(nb.shareId)}
                onMouseLeave={() => setHoveredCard(null)}
                style={{
                  textDecoration: 'none',
                  borderRadius: 16,
                  background: COLORS.cardBg,
                  border: `1px solid ${isHovered ? 'rgba(140,82,255,0.3)' : COLORS.borderSubtle}`,
                  overflow: 'hidden',
                  transition: `border-color 0.2s ${EASING}, transform 0.2s ${EASING}`,
                  transform: isHovered ? 'translateY(-2px)' : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Cover image or color bar */}
                {nb.coverImageUrl ? (
                  <div style={{ height: 120, overflow: 'hidden', position: 'relative' }}>
                    <img src={nb.coverImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                ) : (
                  <div style={{ height: 4, background: accentColor }} />
                )}

                <div style={{ padding: 18, flex: 1, display: 'flex', flexDirection: 'column' }}>
                  {/* Subject + time */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    {nb.subject && (
                      <span style={{
                        padding: '2px 8px', borderRadius: 6,
                        background: sc.bg, color: sc.text,
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                      }}>
                        {nb.subject}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: COLORS.textMuted }}>{timeAgo(nb.sharedAt)}</span>
                  </div>

                  {/* Title */}
                  <div style={{
                    fontSize: 15, fontWeight: 700, color: COLORS.textPrimary,
                    marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {displayTitle}
                  </div>

                  {/* Description */}
                  {nb.description && (
                    <div style={{
                      fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.5,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                      overflow: 'hidden', marginBottom: 10,
                    }}>
                      {nb.description}
                    </div>
                  )}

                  {/* Tags */}
                  {nb.tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                      {nb.tags.slice(0, 4).map((tag, i) => (
                        <span key={tag} style={{
                          padding: '2px 8px', borderRadius: 6,
                          background: `${TAG_COLORS[i % TAG_COLORS.length]}15`,
                          color: TAG_COLORS[i % TAG_COLORS.length],
                          fontSize: 10, fontWeight: 600,
                        }}>
                          #{tag}
                        </span>
                      ))}
                      {nb.tags.length > 4 && (
                        <span style={{ fontSize: 10, color: COLORS.textMuted, padding: '2px 4px' }}>
                          +{nb.tags.length - 4}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Spacer */}
                  <div style={{ flex: 1 }} />

                  {/* Footer: author + metrics */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: 6,
                        background: `linear-gradient(135deg, ${accentColor}, ${accentColor}88)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 700, color: '#fff',
                      }}>
                        {nb.author.username[0].toUpperCase()}
                      </div>
                      <span style={{ fontSize: 11, color: COLORS.textMuted }}>{nb.author.username}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: COLORS.textMuted }}>visibility</span>
                        <span style={{ fontSize: 11, color: COLORS.textMuted }}>{nb.viewCount}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: COLORS.textMuted }}>download</span>
                        <span style={{ fontSize: 11, color: COLORS.textMuted }}>{nb.downloadCount}</span>
                      </div>
                      {nb.averageRating > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 14, color: COLORS.secondary }}>star</span>
                          <span style={{ fontSize: 11, color: COLORS.textMuted }}>{nb.averageRating}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 32 }}>
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            style={{
              padding: '8px 16px', borderRadius: 8, border: `1px solid ${COLORS.borderSubtle}`,
              background: 'transparent', color: page === 1 ? COLORS.textMuted : COLORS.textPrimary,
              fontSize: 13, cursor: page === 1 ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}
          >
            Previous
          </button>
          <span style={{ padding: '8px 12px', fontSize: 13, color: COLORS.textSecondary }}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            style={{
              padding: '8px 16px', borderRadius: 8, border: `1px solid ${COLORS.borderSubtle}`,
              background: 'transparent', color: page === totalPages ? COLORS.textMuted : COLORS.textPrimary,
              fontSize: 13, cursor: page === totalPages ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
