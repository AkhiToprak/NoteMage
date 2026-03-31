'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface RecentNotebook {
  id: string;
  name: string;
  color: string | null;
  updatedAt: string;
}

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const COLORS = {
  cardBg: '#161630',
  elevated: '#232342',
  primary: '#ae89ff',
  deepPurple: '#884efb',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  border: '#555578',
} as const;

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `updated ${mins}m ago`;
  if (hrs < 24) return `updated ${hrs}h ago`;
  if (days < 7) return `updated ${days}d ago`;
  return `updated ${Math.floor(days / 7)}w ago`;
}

export default function RecentNotebooksPanel() {
  const [notebooks, setNotebooks] = useState<RecentNotebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredNb, setHoveredNb] = useState<string | null>(null);
  const [hoveredDashboard, setHoveredDashboard] = useState(false);
  const [hoveredNew, setHoveredNew] = useState(false);
  const [hoveredViewAll, setHoveredViewAll] = useState(false);

  const fetchNotebooks = useCallback(async () => {
    try {
      const res = await fetch('/api/notebooks?limit=5&sort=updatedAt');
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setNotebooks((json.data.notebooks || json.data || []).slice(0, 5));
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotebooks();
  }, [fetchNotebooks]);

  return (
    <div
      style={{
        position: 'sticky',
        top: 88,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* Dashboard card */}
      <Link
        href="/dashboard"
        onMouseEnter={() => setHoveredDashboard(true)}
        onMouseLeave={() => setHoveredDashboard(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '16px 18px',
          borderRadius: 16,
          background: hoveredDashboard
            ? `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.deepPurple})`
            : `linear-gradient(135deg, rgba(174,137,255,0.15), rgba(136,78,251,0.1))`,
          border: `1px solid ${hoveredDashboard ? 'rgba(174,137,255,0.4)' : 'rgba(174,137,255,0.15)'}`,
          textDecoration: 'none',
          transition: `all 0.2s ${EASING}`,
          transform: hoveredDashboard ? 'translateY(-1px)' : 'none',
          boxShadow: hoveredDashboard ? '0 8px 24px rgba(174,137,255,0.2)' : 'none',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: 24,
            color: hoveredDashboard ? '#fff' : COLORS.primary,
          }}
        >
          dashboard
        </span>
        <div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: hoveredDashboard ? '#fff' : COLORS.textPrimary,
            }}
          >
            Go to Dashboard
          </div>
          <div
            style={{
              fontSize: 11,
              color: hoveredDashboard ? 'rgba(255,255,255,0.7)' : COLORS.textMuted,
              marginTop: 1,
            }}
          >
            Notebooks, stats & more
          </div>
        </div>
      </Link>

      {/* Recent notebooks */}
      <div
        style={{
          background: COLORS.cardBg,
          borderRadius: 16,
          border: `1px solid ${COLORS.border}`,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px 10px',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
            Recent Notebooks
          </span>
          <Link
            href="/dashboard"
            onMouseEnter={() => setHoveredViewAll(true)}
            onMouseLeave={() => setHoveredViewAll(false)}
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: hoveredViewAll ? COLORS.primary : COLORS.textMuted,
              textDecoration: 'none',
              transition: `color 0.15s ${EASING}`,
            }}
          >
            View All
          </Link>
        </div>

        <div style={{ padding: '0 8px 8px' }}>
          {loading ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: COLORS.textMuted, fontSize: 12 }}>
              Loading...
            </div>
          ) : notebooks.length === 0 ? (
            <div
              style={{
                padding: '24px 12px',
                textAlign: 'center',
                color: COLORS.textMuted,
                fontSize: 12,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 28, opacity: 0.4, display: 'block', marginBottom: 6 }}>
                menu_book
              </span>
              No notebooks yet
            </div>
          ) : (
            notebooks.map((nb) => {
              const isHovered = hoveredNb === nb.id;
              return (
                <Link
                  key={nb.id}
                  href={`/notebooks/${nb.id}`}
                  onMouseEnter={() => setHoveredNb(nb.id)}
                  onMouseLeave={() => setHoveredNb(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 10,
                    background: isHovered ? 'rgba(174,137,255,0.06)' : 'transparent',
                    textDecoration: 'none',
                    transition: `background 0.1s`,
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 3,
                      background: nb.color || COLORS.primary,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: COLORS.textPrimary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {nb.name}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 1 }}>
                      {timeAgo(nb.updatedAt)}
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>

        {/* New notebook button */}
        <div style={{ padding: '0 8px 10px' }}>
          <Link
            href="/dashboard"
            onMouseEnter={() => setHoveredNew(true)}
            onMouseLeave={() => setHoveredNew(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              width: '100%',
              padding: '9px 14px',
              borderRadius: 10,
              border: `1.5px dashed ${hoveredNew ? COLORS.primary : COLORS.border}`,
              background: 'transparent',
              color: hoveredNew ? COLORS.primary : COLORS.textMuted,
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'none',
              transition: `all 0.15s ${EASING}`,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            New Notebook
          </Link>
        </div>
      </div>
    </div>
  );
}
