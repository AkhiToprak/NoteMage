'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';

/* ─── Types ─── */
interface CommunityNotebook {
  shareId: string;
  notebookId: string;
  title: string;
  name: string;
  description: string;
  subject: string;
  authorName: string;
  authorAvatar?: string | null;
  downloadCount: number;
  averageRating: number;
  ratingCount: number;
  viewCount: number;
  color: string;
  sharedAt: string;
  tags: string[];
  coverImageUrl?: string | null;
}

type MainTab = 'library' | 'friends';
type FilterTab = 'latest' | 'popular' | 'rated';

/* ─── Constants ─── */
const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const COLORS = {
  pageBg: '#111126',
  surface: '#12121f',
  cardBg: '#161630',
  elevated: '#232342',
  primary: '#8c52ff',
  primaryLight: '#ae89ff',
  secondary: '#ffde59',
  textPrimary: '#ede9ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  border: '#555578',
  borderSubtle: '#2a2a44',
} as const;

const SUBJECT_COLORS: Record<string, { bg: string; text: string }> = {
  Physics: { bg: 'rgba(255,107,107,0.15)', text: '#ff6b6b' },
  Design: { bg: 'rgba(255,222,89,0.15)', text: '#ffde59' },
  History: { bg: 'rgba(255,177,66,0.15)', text: '#ffb142' },
  'Computer Science': { bg: 'rgba(78,205,196,0.15)', text: '#4ecdc4' },
  Philosophy: { bg: 'rgba(166,137,255,0.15)', text: '#a689ff' },
  Languages: { bg: 'rgba(99,205,255,0.15)', text: '#63cdff' },
  Mathematics: { bg: 'rgba(255,107,171,0.15)', text: '#ff6bab' },
  Science: { bg: 'rgba(72,219,156,0.15)', text: '#48db9c' },
  default: { bg: 'rgba(140,82,255,0.12)', text: '#ae89ff' },
};

function getSubjectColor(subject: string) {
  return SUBJECT_COLORS[subject] || SUBJECT_COLORS.default;
}

/* ─── Cover gradients — no placeholder images ─── */
const COVER_GRADIENTS = [
  'linear-gradient(135deg, #1a0533 0%, #3d1a78 40%, #8c52ff 100%)',
  'linear-gradient(135deg, #0d1a2e 0%, #1a3a5c 40%, #ffb142 100%)',
  'linear-gradient(135deg, #0d2618 0%, #1a5c3a 40%, #4ecdc4 100%)',
  'linear-gradient(135deg, #2e0d1a 0%, #5c1a3a 40%, #ff6b6b 100%)',
  'linear-gradient(135deg, #1a1a0d 0%, #3a3a1a 40%, #ffde59 100%)',
  'linear-gradient(135deg, #0d1a2e 0%, #1a3a5c 40%, #63cdff 100%)',
];

function getCoverGradient(id: string, color?: string): string {
  if (color) {
    return `linear-gradient(135deg, ${color}22 0%, ${color}66 40%, ${color} 100%)`;
  }
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return COVER_GRADIENTS[Math.abs(hash) % COVER_GRADIENTS.length];
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/* ─── Skeleton loaders ─── */
function FeaturedSkeleton() {
  return (
    <div
      style={{
        minWidth: 260,
        maxWidth: 280,
        height: 280,
        borderRadius: 16,
        background: COLORS.cardBg,
        flexShrink: 0,
        animation: 'communityPulse 1.5s ease-in-out infinite',
      }}
    />
  );
}

function GridSkeleton() {
  return (
    <div
      style={{
        height: 200,
        borderRadius: 16,
        background: COLORS.cardBg,
        animation: 'communityPulse 1.5s ease-in-out infinite',
      }}
    />
  );
}

/* ─── Featured Notebook Card ─── */
function FeaturedNotebookCard({ notebook }: { notebook: CommunityNotebook }) {
  const [hovered, setHovered] = useState(false);
  const sc = getSubjectColor(notebook.subject);

  return (
    <Link
      href={`/community/${notebook.shareId}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        minWidth: 260,
        maxWidth: 280,
        borderRadius: 16,
        background: COLORS.cardBg,
        border: `1px solid ${hovered ? 'rgba(140,82,255,0.3)' : COLORS.borderSubtle}`,
        overflow: 'hidden',
        cursor: 'pointer',
        flexShrink: 0,
        transition: `border-color 0.2s ${EASING}, transform 0.2s ${EASING}, box-shadow 0.2s ${EASING}`,
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hovered ? '0 8px 32px rgba(140,82,255,0.15)' : '0 2px 8px rgba(0,0,0,0.2)',
        textDecoration: 'none',
      }}
    >
      {/* Cover area */}
      <div
        style={{
          height: 130,
          background: notebook.coverImageUrl ? undefined : getCoverGradient(notebook.shareId, notebook.color),
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {notebook.coverImageUrl ? (
          <img
            src={notebook.coverImageUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 48, color: 'rgba(255,255,255,0.12)', position: 'absolute' }}
          >
            auto_stories
          </span>
        )}
        {notebook.subject && (
          <span
            style={{
              position: 'absolute', top: 10, right: 10,
              padding: '3px 10px', borderRadius: 8,
              background: sc.bg, color: sc.text,
              fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
              backdropFilter: 'blur(8px)',
            }}
          >
            {notebook.subject}
          </span>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: '14px 16px 16px' }}>
        <div style={{
          fontSize: 15, fontWeight: 700, color: COLORS.textPrimary,
          marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {notebook.title || notebook.name}
        </div>
        <div style={{
          fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.5,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
          overflow: 'hidden', marginBottom: 12,
        }}>
          {notebook.description}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 20, height: 20, borderRadius: 6,
              background: `linear-gradient(135deg, ${notebook.color || COLORS.primary}, ${notebook.color || COLORS.primary}88)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700, color: '#fff',
            }}>
              {notebook.authorName[0]}
            </div>
            <span style={{ fontSize: 11, color: COLORS.textMuted }}>{notebook.authorName}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, color: COLORS.textMuted }}>download</span>
              <span style={{ fontSize: 11, color: COLORS.textMuted }}>{formatCount(notebook.downloadCount)}</span>
            </div>
            {notebook.averageRating > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: COLORS.secondary }}>star</span>
                <span style={{ fontSize: 11, color: COLORS.textMuted }}>{notebook.averageRating}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ─── Library Grid Card (small) ─── */
function LibraryCard({ notebook }: { notebook: CommunityNotebook }) {
  const [hovered, setHovered] = useState(false);
  const sc = getSubjectColor(notebook.subject);

  return (
    <Link
      href={`/community/${notebook.shareId}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 16,
        background: COLORS.cardBg,
        border: `1px solid ${hovered ? 'rgba(140,82,255,0.25)' : COLORS.borderSubtle}`,
        padding: 18,
        cursor: 'pointer',
        transition: `border-color 0.2s ${EASING}, transform 0.2s ${EASING}`,
        transform: hovered ? 'translateY(-1px)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: 190,
        textDecoration: 'none',
      }}
    >
      {/* Top row */}
      <div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: sc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: sc.text }}>auto_stories</span>
          </div>
          {notebook.subject && (
            <span style={{
              padding: '3px 8px', borderRadius: 6, background: sc.bg, color: sc.text,
              fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
            }}>
              {notebook.subject}
            </span>
          )}
        </div>

        <div style={{
          fontSize: 14, fontWeight: 700, color: COLORS.textPrimary,
          marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {notebook.title || notebook.name}
        </div>
        <div style={{
          fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.5,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
          overflow: 'hidden',
        }}>
          {notebook.description}
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
        <span style={{ fontSize: 11, color: COLORS.textMuted }}>By {notebook.authorName}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: COLORS.textMuted }}>visibility</span>
            <span style={{ fontSize: 10, color: COLORS.textMuted }}>{formatCount(notebook.viewCount)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: COLORS.textMuted }}>download</span>
            <span style={{ fontSize: 10, color: COLORS.textMuted }}>{formatCount(notebook.downloadCount)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ─── Large Spanning Card ─── */
function LargeFeatureCard({ notebook }: { notebook: CommunityNotebook }) {
  const [hovered, setHovered] = useState(false);
  const sc = getSubjectColor(notebook.subject);

  return (
    <Link
      href={`/community/${notebook.shareId}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="community-large-card-responsive"
      style={{
        gridColumn: 'span 2',
        borderRadius: 16,
        background: COLORS.cardBg,
        border: `1px solid ${hovered ? 'rgba(140,82,255,0.3)' : COLORS.borderSubtle}`,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: `border-color 0.2s ${EASING}, transform 0.2s ${EASING}`,
        transform: hovered ? 'translateY(-1px)' : 'none',
        display: 'flex',
        minHeight: 200,
        textDecoration: 'none',
      }}
    >
      {/* Text side */}
      <div style={{ flex: 1, padding: 22, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 8, background: 'rgba(140,82,255,0.12)', marginBottom: 12,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: COLORS.secondary }}>emoji_events</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: COLORS.secondary, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Community Favorite
            </span>
          </div>

          <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.textPrimary, lineHeight: 1.3, marginBottom: 8 }}>
            {notebook.title || notebook.name}
          </div>
          <div style={{
            fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6,
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const,
            overflow: 'hidden',
          }}>
            {notebook.description}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, background: COLORS.primary, color: '#fff', fontSize: 12, fontWeight: 700 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
            {formatCount(notebook.downloadCount)} downloads
          </span>
          {notebook.averageRating > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: COLORS.textMuted }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: COLORS.secondary }}>star</span>
              {notebook.averageRating} ({notebook.ratingCount})
            </span>
          )}
        </div>
      </div>

      {/* Gradient side */}
      <div style={{
        width: 200, background: notebook.coverImageUrl ? undefined : getCoverGradient(notebook.shareId, notebook.color),
        position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        overflow: 'hidden',
      }}>
        {notebook.coverImageUrl ? (
          <img
            src={notebook.coverImageUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', position: 'absolute', inset: 0 }}
          />
        ) : (
          <span className="material-symbols-outlined" style={{ fontSize: 56, color: 'rgba(255,255,255,0.1)' }}>school</span>
        )}
        {notebook.subject && (
          <span style={{
            position: 'absolute', top: 12, right: 12,
            padding: '3px 8px', borderRadius: 6, background: sc.bg, color: sc.text,
            fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
            {notebook.subject}
          </span>
        )}
      </div>
    </Link>
  );
}

/* ─── Map API response to component type ─── */
function mapApiNotebook(nb: Record<string, unknown>): CommunityNotebook {
  const author = nb.author as { username?: string; avatarUrl?: string | null } | undefined;
  return {
    shareId: (nb.shareId as string) || '',
    notebookId: (nb.notebookId as string) || '',
    title: (nb.title as string) || (nb.name as string) || 'Untitled',
    name: (nb.name as string) || 'Untitled',
    description: (nb.description as string) || '',
    subject: (nb.subject as string) || '',
    authorName: author?.username || 'Unknown',
    authorAvatar: author?.avatarUrl,
    downloadCount: (nb.downloadCount as number) || 0,
    averageRating: (nb.averageRating as number) || 0,
    ratingCount: (nb.ratingCount as number) || 0,
    viewCount: (nb.viewCount as number) || 0,
    color: (nb.color as string) || '#8c52ff',
    sharedAt: (nb.sharedAt as string) || new Date().toISOString(),
    tags: (nb.tags as string[]) || [],
    coverImageUrl: (nb.coverImageUrl as string) || null,
  };
}

/* ─── Main component ─── */
export default function CommunityHub() {
  const [mainTab, setMainTab] = useState<MainTab>('library');
  const [filterTab, setFilterTab] = useState<FilterTab>('latest');
  const [featured, setFeatured] = useState<CommunityNotebook[]>([]);
  const [library, setLibrary] = useState<CommunityNotebook[]>([]);
  const [loadingFeatured, setLoadingFeatured] = useState(true);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [hoveredMainTab, setHoveredMainTab] = useState<string | null>(null);
  const [hoveredFilterTab, setHoveredFilterTab] = useState<string | null>(null);
  const [hoveredViewAll, setHoveredViewAll] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchNotebooks = useCallback(async () => {
    try {
      // Fetch most downloaded for featured row
      const [featuredRes, libraryRes] = await Promise.all([
        fetch('/api/community/notebooks?filter=all&sort=downloads&period=week&limit=4'),
        fetch('/api/community/notebooks?filter=all&sort=newest&limit=5'),
      ]);

      if (featuredRes.ok) {
        const json = await featuredRes.json();
        if (json.success && json.data?.notebooks?.length) {
          setFeatured(json.data.notebooks.map(mapApiNotebook));
        }
      }
      setLoadingFeatured(false);

      if (libraryRes.ok) {
        const json = await libraryRes.json();
        if (json.success && json.data?.notebooks?.length) {
          setLibrary(json.data.notebooks.map(mapApiNotebook));
        }
      }
      setLoadingLibrary(false);
    } catch {
      setLoadingFeatured(false);
      setLoadingLibrary(false);
    }
  }, []);

  // Re-fetch library when filter changes
  const fetchLibrary = useCallback(async () => {
    setLoadingLibrary(true);
    const sortMap: Record<FilterTab, string> = {
      latest: 'newest',
      popular: 'downloads',
      rated: 'rating',
    };
    try {
      const res = await fetch(`/api/community/notebooks?filter=all&sort=${sortMap[filterTab]}&limit=5`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.notebooks?.length) {
          setLibrary(json.data.notebooks.map(mapApiNotebook));
        } else {
          setLibrary([]);
        }
      }
    } catch {
      // keep existing
    }
    setLoadingLibrary(false);
  }, [filterTab]);

  useEffect(() => { fetchNotebooks(); }, [fetchNotebooks]);

  useEffect(() => {
    // Skip initial load (handled by fetchNotebooks)
    if (!loadingFeatured) {
      fetchLibrary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterTab]);

  const communityFavorite = library.length > 0 ? library[library.length - 1] : null;
  const gridCards = library.slice(0, Math.min(3, library.length - 1));

  const mainTabs: { key: MainTab; label: string }[] = [
    { key: 'library', label: 'Public Library' },
    { key: 'friends', label: 'Friends Feed' },
  ];

  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: 'latest', label: 'Latest' },
    { key: 'popular', label: 'Most Popular' },
    { key: 'rated', label: 'Highest Rated' },
  ];

  return (
    <div>
      <style>{`
        @keyframes communityPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .community-scroll::-webkit-scrollbar { height: 6px; }
        .community-scroll::-webkit-scrollbar-track { background: transparent; }
        .community-scroll::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 3px; }
        .community-scroll::-webkit-scrollbar-thumb:hover { background: ${COLORS.textMuted}; }
        .community-large-card-responsive { grid-column: span 2; }
        @media (max-width: 700px) {
          .community-large-card-responsive { grid-column: span 1 !important; }
          .community-bento-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Main tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: `1px solid ${COLORS.borderSubtle}` }}>
        {mainTabs.map((tab) => {
          const isActive = mainTab === tab.key;
          const isHovered = hoveredMainTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setMainTab(tab.key)}
              onMouseEnter={() => setHoveredMainTab(tab.key)}
              onMouseLeave={() => setHoveredMainTab(null)}
              style={{
                padding: '10px 20px',
                border: 'none',
                borderBottom: `2px solid ${isActive ? COLORS.secondary : 'transparent'}`,
                background: 'transparent',
                color: isActive ? COLORS.secondary : isHovered ? COLORS.textPrimary : COLORS.textMuted,
                fontSize: 14,
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                transition: `color 0.15s ${EASING}, border-color 0.15s ${EASING}`,
                marginBottom: -1,
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {mainTab === 'library' ? (
        <>
          {/* Most Downloaded This Week */}
          <div style={{ marginBottom: 36 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textPrimary, margin: 0, fontFamily: 'inherit' }}>
                Most Downloaded This Week
              </h2>
              <Link
                href="/community"
                onMouseEnter={() => setHoveredViewAll(true)}
                onMouseLeave={() => setHoveredViewAll(false)}
                style={{
                  border: 'none', background: 'transparent',
                  color: hoveredViewAll ? COLORS.primaryLight : COLORS.textMuted,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                  transition: `color 0.15s ${EASING}`, textDecoration: 'none',
                }}
              >
                View All
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
              </Link>
            </div>

            {/* Horizontal scroll */}
            <div
              ref={scrollRef}
              className="community-scroll"
              style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 8, scrollSnapType: 'x mandatory' }}
            >
              {loadingFeatured
                ? Array.from({ length: 3 }).map((_, i) => <FeaturedSkeleton key={i} />)
                : featured.map((nb) => <FeaturedNotebookCard key={nb.shareId} notebook={nb} />)}
              {!loadingFeatured && featured.length === 0 && (
                <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted, fontSize: 13, width: '100%' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 32, display: 'block', marginBottom: 8, opacity: 0.4 }}>library_books</span>
                  No featured notebooks yet. Be the first to share!
                </div>
              )}
            </div>
          </div>

          {/* Library Explorer */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textPrimary, margin: 0, fontFamily: 'inherit' }}>
                Library Explorer
              </h2>

              <div style={{ display: 'flex', gap: 2, background: COLORS.surface, borderRadius: 10, padding: 3 }}>
                {filterTabs.map((tab) => {
                  const isActive = filterTab === tab.key;
                  const isHovered = hoveredFilterTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setFilterTab(tab.key)}
                      onMouseEnter={() => setHoveredFilterTab(tab.key)}
                      onMouseLeave={() => setHoveredFilterTab(null)}
                      style={{
                        padding: '6px 14px', borderRadius: 8, border: 'none',
                        background: isActive ? COLORS.elevated : 'transparent',
                        color: isActive ? COLORS.textPrimary : isHovered ? COLORS.textSecondary : COLORS.textMuted,
                        fontSize: 12, fontWeight: isActive ? 600 : 500, cursor: 'pointer',
                        transition: `background 0.15s ${EASING}, color 0.15s ${EASING}`,
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bento grid */}
            {loadingLibrary ? (
              <div className="community-bento-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {Array.from({ length: 4 }).map((_, i) => <GridSkeleton key={i} />)}
              </div>
            ) : library.length === 0 ? (
              <div style={{
                padding: 60, textAlign: 'center', color: COLORS.textMuted, fontSize: 13,
                background: COLORS.cardBg, borderRadius: 16, border: `1px solid ${COLORS.borderSubtle}`,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 36, display: 'block', marginBottom: 10, opacity: 0.4 }}>search</span>
                No notebooks found. Try adjusting your filters.
              </div>
            ) : (
              <div className="community-bento-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {gridCards.map((nb) => <LibraryCard key={nb.shareId} notebook={nb} />)}
                {communityFavorite && <LargeFeatureCard notebook={communityFavorite} />}
                {library.length > 4 && <LibraryCard notebook={library[library.length - 2] || library[0]} />}
              </div>
            )}
          </div>
        </>
      ) : (
        <div>
          <FriendsFeedPlaceholder />
        </div>
      )}
    </div>
  );
}

/* ─── Friends Feed placeholder ─── */
function FriendsFeedPlaceholder() {
  return (
    <div style={{
      textAlign: 'center', padding: 60, color: COLORS.textMuted, fontSize: 14,
      background: COLORS.cardBg, borderRadius: 16, border: `1px solid ${COLORS.borderSubtle}`,
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 40, display: 'block', marginBottom: 12, opacity: 0.4 }}>group</span>
      <div style={{ fontWeight: 600, color: COLORS.textSecondary, marginBottom: 6 }}>Friends Feed</div>
      <div style={{ fontSize: 12, color: COLORS.textMuted }}>
        See what your friends are studying and sharing. Add friends to get started!
      </div>
    </div>
  );
}
