'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import NotebookPreviewCard from './NotebookPreviewCard';
import type { NotebookPreviewCardProps } from './NotebookPreviewCard';

type FilterTab = 'all' | 'friends' | 'mine';

interface NotebookResponse {
  success: boolean;
  data: {
    notebooks: Omit<NotebookPreviewCardProps, 'onCopy'>[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

const TRANSITION = 'cubic-bezier(0.22,1,0.36,1)';
const LIMIT = 20;

const FILTER_TABS: { key: FilterTab; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: 'public' },
  { key: 'friends', label: 'Friends', icon: 'group' },
  { key: 'mine', label: 'Mine', icon: 'person' },
];

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function NotebookBrowser() {
  const [filter, setFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [page, setPage] = useState(1);
  const [notebooks, setNotebooks] = useState<Omit<NotebookPreviewCardProps, 'onCopy'>[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [subjectFocused, setSubjectFocused] = useState(false);
  const [hoveredTab, setHoveredTab] = useState<FilterTab | null>(null);
  const [hoveredPrev, setHoveredPrev] = useState(false);
  const [hoveredNext, setHoveredNext] = useState(false);

  const debouncedSearch = useDebounce(search, 300);
  const debouncedSubject = useDebounce(subject, 300);
  const abortRef = useRef<AbortController | null>(null);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [filter, debouncedSearch, debouncedSubject]);

  const fetchNotebooks = useCallback(async () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        filter,
        page: String(page),
        limit: String(LIMIT),
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (debouncedSubject) params.set('subject', debouncedSubject);

      const res = await fetch(`/api/community/notebooks?${params.toString()}`, {
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch notebooks (${res.status})`);
      }

      const json: NotebookResponse = await res.json();

      if (!json.success) {
        throw new Error('Failed to load notebooks');
      }

      setNotebooks(json.data.notebooks);
      setTotalPages(json.data.totalPages);
      setTotal(json.data.total);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [filter, page, debouncedSearch, debouncedSubject]);

  useEffect(() => {
    fetchNotebooks();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchNotebooks]);

  const handleCopy = async (notebookId: string) => {
    setCopyingId(notebookId);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/share/copy`, {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error('Failed to copy notebook');
      }
      // Optionally refresh
      await fetchNotebooks();
    } catch {
      setError('Failed to copy notebook. Please try again.');
    } finally {
      setCopyingId(null);
    }
  };

  // Skeleton shimmer keyframes injected once
  const shimmerKeyframes = `
    @keyframes shimmer {
      0% { background-position: -400px 0; }
      100% { background-position: 400px 0; }
    }
    @keyframes fadeSlideIn {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;

  const renderSkeletons = () =>
    Array.from({ length: 6 }).map((_, i) => (
      <div
        key={`skeleton-${i}`}
        style={{
          background: '#121222',
          borderRadius: '16px',
          overflow: 'hidden',
          border: '1px solid #464560',
          minHeight: '220px',
        }}
      >
        {/* Color bar skeleton */}
        <div
          style={{
            height: '4px',
            background: 'linear-gradient(90deg, #1d1d33 0%, #23233c 50%, #1d1d33 100%)',
            backgroundSize: '800px 4px',
            animation: 'shimmer 1.5s infinite linear',
          }}
        />
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Title skeleton */}
          <div
            style={{
              height: '18px',
              width: '70%',
              borderRadius: '6px',
              background: 'linear-gradient(90deg, #1d1d33 0%, #23233c 50%, #1d1d33 100%)',
              backgroundSize: '800px 18px',
              animation: 'shimmer 1.5s infinite linear',
            }}
          />
          {/* Subject skeleton */}
          <div
            style={{
              height: '14px',
              width: '40%',
              borderRadius: '6px',
              background: 'linear-gradient(90deg, #1d1d33 0%, #23233c 50%, #1d1d33 100%)',
              backgroundSize: '800px 14px',
              animation: 'shimmer 1.5s infinite linear',
            }}
          />
          {/* Author skeleton */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: 'linear-gradient(90deg, #1d1d33 0%, #23233c 50%, #1d1d33 100%)',
                backgroundSize: '800px 24px',
                animation: 'shimmer 1.5s infinite linear',
              }}
            />
            <div
              style={{
                height: '12px',
                width: '80px',
                borderRadius: '4px',
                background: 'linear-gradient(90deg, #1d1d33 0%, #23233c 50%, #1d1d33 100%)',
                backgroundSize: '800px 12px',
                animation: 'shimmer 1.5s infinite linear',
              }}
            />
          </div>
          {/* Footer skeleton */}
          <div style={{ flex: 1 }} />
          <div
            style={{
              height: '12px',
              width: '60%',
              borderRadius: '4px',
              marginTop: '24px',
              background: 'linear-gradient(90deg, #1d1d33 0%, #23233c 50%, #1d1d33 100%)',
              backgroundSize: '800px 12px',
              animation: 'shimmer 1.5s infinite linear',
            }}
          />
        </div>
      </div>
    ));

  const renderEmptyState = () => (
    <div
      style={{
        gridColumn: '1 / -1',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 20px',
        gap: '12px',
      }}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: '48px', color: '#464560' }}
      >
        library_books
      </span>
      <p style={{ fontSize: '16px', fontWeight: 600, color: '#aaa8c8', margin: 0 }}>
        No notebooks found
      </p>
      <p style={{ fontSize: '13px', color: '#737390', margin: 0, textAlign: 'center' }}>
        {debouncedSearch || debouncedSubject
          ? 'Try adjusting your search or filters.'
          : 'Be the first to share a notebook with the community!'}
      </p>
    </div>
  );

  const renderError = () => (
    <div
      style={{
        gridColumn: '1 / -1',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 20px',
        gap: '12px',
      }}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: '48px', color: '#fd6f85' }}
      >
        error_outline
      </span>
      <p style={{ fontSize: '16px', fontWeight: 600, color: '#fd6f85', margin: 0 }}>
        Something went wrong
      </p>
      <p style={{ fontSize: '13px', color: '#737390', margin: 0, textAlign: 'center' }}>
        {error}
      </p>
      <button
        onClick={fetchNotebooks}
        style={{
          marginTop: '8px',
          padding: '8px 20px',
          background: '#ae89ff',
          color: '#fff',
          border: 'none',
          borderRadius: '9999px',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Retry
      </button>
    </div>
  );

  return (
    <div style={{ width: '100%', maxWidth: '1200px', margin: '0 auto', padding: '0 24px' }}>
      <style>{shimmerKeyframes}</style>

      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1
          style={{
            fontSize: '24px',
            fontWeight: 700,
            color: '#e5e3ff',
            margin: '0 0 6px 0',
            letterSpacing: '-0.01em',
          }}
        >
          Community Notebooks
        </h1>
        <p
          style={{
            fontSize: '14px',
            color: '#aaa8c8',
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          Discover and copy notebooks shared by the community
        </p>
      </div>

      {/* Filter bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '28px',
        }}
      >
        {/* Tab buttons */}
        <div style={{ display: 'flex', gap: '6px' }}>
          {FILTER_TABS.map(({ key, label, icon }) => {
            const isActive = filter === key;
            const isHovered = hoveredTab === key;
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                onMouseEnter={() => setHoveredTab(key)}
                onMouseLeave={() => setHoveredTab(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '7px 16px',
                  borderRadius: '9999px',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  background: isActive ? '#ae89ff' : isHovered ? '#23233c' : '#1d1d33',
                  color: isActive ? '#2a0066' : '#aaa8c8',
                  transition: `background 0.2s ${TRANSITION}, color 0.2s ${TRANSITION}`,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                  {icon}
                </span>
                {label}
              </button>
            );
          })}
        </div>

        {/* Search input */}
        <div
          style={{
            position: 'relative',
            flex: '1 1 200px',
            maxWidth: '320px',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '18px',
              color: searchFocused ? '#ae89ff' : '#737390',
              transition: `color 0.2s ${TRANSITION}`,
              pointerEvents: 'none',
            }}
          >
            search
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search notebooks..."
            style={{
              width: '100%',
              padding: '9px 12px 9px 38px',
              background: '#23233c',
              border: `1px solid ${searchFocused ? '#ae89ff' : '#464560'}`,
              borderRadius: '12px',
              color: '#e5e3ff',
              fontSize: '13px',
              fontFamily: 'inherit',
              outline: 'none',
              transition: `border-color 0.2s ${TRANSITION}`,
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Subject filter */}
        <div
          style={{
            position: 'relative',
            flex: '0 1 180px',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '18px',
              color: subjectFocused ? '#ae89ff' : '#737390',
              transition: `color 0.2s ${TRANSITION}`,
              pointerEvents: 'none',
            }}
          >
            label
          </span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onFocus={() => setSubjectFocused(true)}
            onBlur={() => setSubjectFocused(false)}
            placeholder="Filter by subject..."
            style={{
              width: '100%',
              padding: '9px 12px 9px 38px',
              background: '#23233c',
              border: `1px solid ${subjectFocused ? '#ae89ff' : '#464560'}`,
              borderRadius: '12px',
              color: '#e5e3ff',
              fontSize: '13px',
              fontFamily: 'inherit',
              outline: 'none',
              transition: `border-color 0.2s ${TRANSITION}`,
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Result count */}
        {!loading && !error && (
          <span style={{ fontSize: '12px', color: '#737390', marginLeft: 'auto' }}>
            {total} notebook{total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '20px',
          minHeight: '300px',
        }}
      >
        {loading && renderSkeletons()}
        {!loading && error && renderError()}
        {!loading && !error && notebooks.length === 0 && renderEmptyState()}
        {!loading &&
          !error &&
          notebooks.map((nb, index) => (
            <div
              key={nb.shareId}
              style={{
                animation: `fadeSlideIn 0.35s ${TRANSITION} ${index * 0.04}s both`,
              }}
            >
              <NotebookPreviewCard
                {...nb}
                onCopy={handleCopy}
              />
            </div>
          ))}
      </div>

      {/* Pagination */}
      {!loading && !error && totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            marginTop: '36px',
            paddingBottom: '24px',
          }}
        >
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            onMouseEnter={() => setHoveredPrev(true)}
            onMouseLeave={() => setHoveredPrev(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '8px 18px',
              borderRadius: '12px',
              border: `1px solid ${page <= 1 ? '#2a2a40' : hoveredPrev ? '#ae89ff' : '#464560'}`,
              background: hoveredPrev && page > 1 ? 'rgba(174,137,255,0.08)' : '#1d1d33',
              color: page <= 1 ? '#464560' : '#e5e3ff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: page <= 1 ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              transition: `all 0.2s ${TRANSITION}`,
              opacity: page <= 1 ? 0.5 : 1,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              chevron_left
            </span>
            Prev
          </button>

          <span style={{ fontSize: '13px', color: '#aaa8c8', fontWeight: 500 }}>
            Page {page} of {totalPages}
          </span>

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            onMouseEnter={() => setHoveredNext(true)}
            onMouseLeave={() => setHoveredNext(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '8px 18px',
              borderRadius: '12px',
              border: `1px solid ${page >= totalPages ? '#2a2a40' : hoveredNext ? '#ae89ff' : '#464560'}`,
              background: hoveredNext && page < totalPages ? 'rgba(174,137,255,0.08)' : '#1d1d33',
              color: page >= totalPages ? '#464560' : '#e5e3ff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: page >= totalPages ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              transition: `all 0.2s ${TRANSITION}`,
              opacity: page >= totalPages ? 0.5 : 1,
            }}
          >
            Next
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              chevron_right
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
