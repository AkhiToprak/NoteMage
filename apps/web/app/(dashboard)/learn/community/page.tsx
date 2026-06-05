'use client';

// Phase 8 of plans/path-publishing-community-library.md — community
// library browse surface. Auth-gated (dashboard route group already
// redirects unauth visits to /auth/login), lists only approved paths
// per AC-Browse-1, and exposes the v1 social signals (download count,
// view count, rating) per AC-Browse-8.
//
// Visual conventions follow the project's locked design system: inline
// `style={{}}` objects + CSS custom-property tokens, Material Symbols
// Outlined icons, no Tailwind utilities. The page is intentionally a
// sibling-shape to /learn/paths (the user's own paths) so the two
// surfaces feel cohesive without sharing a component file — library
// rows carry social signals; private-path rows carry progress bars.

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { SUBJECT_REGISTRY, SUBJECT_IDS, isSubjectId, type SubjectId } from '@/lib/path-subjects';
import {
  PATH_LANGUAGES,
  POPULAR_PATH_LANGUAGE_CODES,
  type PathLanguageCode,
} from '@/lib/path-languages';

// Popular languages render as chips (the eagerly pre-translated set); every
// other supported language lives in the "More…" dropdown beside them.
const POPULAR_LANGUAGE_OPTIONS = PATH_LANGUAGES.filter((l) =>
  POPULAR_PATH_LANGUAGE_CODES.includes(l.code),
).map((l) => ({ value: l.code as string, label: l.endonym, icon: 'translate' }));

const OTHER_LANGUAGES = PATH_LANGUAGES.filter(
  (l) => !POPULAR_PATH_LANGUAGE_CODES.includes(l.code),
);

// Slot-range presets keep the filter strip honest — most learners think
// in "quick / serious / long-haul" not in slot counts. The API accepts
// minSlots/maxSlots independently, so a custom range is a future
// improvement; v1 ships the three named buckets.
const SLOT_RANGES = [
  { id: 'short', label: 'Short', min: 0, max: 9 },
  { id: 'medium', label: 'Medium', min: 10, max: 18 },
  { id: 'long', label: 'Long', min: 19, max: undefined },
] as const;
type SlotRangeId = (typeof SLOT_RANGES)[number]['id'];

type SortMode = 'popular' | 'recent' | 'rating';
type FilterMode = 'all' | 'mine';

const SORT_LABELS: Record<SortMode, { label: string; icon: string }> = {
  popular: { label: 'Most popular', icon: 'trending_up' },
  recent: { label: 'Recently added', icon: 'schedule' },
  rating: { label: 'Highest rated', icon: 'star' },
};

interface PathListItem {
  shareId: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  language: string;
  subjects: string[];
  phaseCount: number;
  slotCount: number;
  downloadCount: number;
  viewCount: number;
  ratingAverage: number | null;
  ratingCount: number;
  seeded: boolean;
  approvedAt: string | null;
  author: { id: string; username: string | null; avatarUrl: string | null };
}

interface ListResponse {
  paths: PathListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const LIMIT = 20;
const DEBOUNCE_MS = 300;

export default function CommunityLibraryPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [sort, setSort] = useState<SortMode>('popular');
  const [subject, setSubject] = useState<SubjectId | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [slotRange, setSlotRange] = useState<SlotRangeId | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // Phase 12 — the create-path CTA routes blocked FREE users here with
  // ?from=create. Read it from the URL in an effect rather than
  // useSearchParams (which would opt this page out of static rendering)
  // and show a one-time explainer banner. AC-Switch-3.
  const [fromCreate, setFromCreate] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  useEffect(() => {
    setFromCreate(
      new URLSearchParams(window.location.search).get('from') === 'create',
    );
  }, []);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors the live `searchInput` so the filter-change effect can flush the
  // pending search debounce WITHOUT taking `searchInput` as a dependency
  // (which would re-run that effect — and reset the page — every keystroke).
  const searchInputRef = useRef(searchInput);

  // Debounced search — typing in the input updates `searchInput` every
  // keystroke (so the box stays responsive); the committed `search`
  // value (which actually triggers a fetch) trails by DEBOUNCE_MS so we
  // don't fire a query per character. Same shape as useSearch's
  // existing debounce.
  useEffect(() => {
    searchInputRef.current = searchInput;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1); // any search change resets pagination
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // Reset to page 1 whenever a filter dimension changes — paging into
  // page 7 of one filter set and then flipping subjects to a smaller
  // result set would otherwise land on an empty page.
  useEffect(() => {
    // Flush any pending search debounce so the filter change commits the
    // current input in the SAME render cycle — otherwise the trailing
    // debounce fires a second fetch ~300ms later, showing results for the
    // {new filter, old search} pair in between. Reading the ref avoids a
    // `searchInput` dep that would re-run this (and reset the page) on
    // every keystroke.
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearch(searchInputRef.current.trim());
    setPage(1);
  }, [filter, sort, subject, language, slotRange]);

  const fetchPaths = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    const range = slotRange ? SLOT_RANGES.find((r) => r.id === slotRange) : null;

    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(LIMIT));
    params.set('sort', sort);
    params.set('filter', filter);
    if (subject) params.set('subject', subject);
    if (language) params.set('language', language);
    if (search) params.set('search', search);
    if (range) {
      params.set('minSlots', String(range.min));
      if (range.max !== undefined) params.set('maxSlots', String(range.max));
    }

    try {
      const res = await fetch(`/api/community/paths?${params.toString()}`, {
        signal: controller.signal,
      });
      const json = await res.json();
      if (json?.success) {
        setData(json.data as ListResponse);
      } else {
        setError(json?.error ?? 'Could not load the library.');
        setData(null);
      }
    } catch (err) {
      const e = err as { name?: string };
      if (e?.name !== 'AbortError') {
        setError('Network error. Try again.');
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  }, [page, sort, filter, subject, language, slotRange, search]);

  useEffect(() => {
    void fetchPaths();
  }, [fetchPaths]);

  const totalPages = data?.totalPages ?? 1;
  const hasResults = data && data.paths.length > 0;

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '24px 16px 48px' }}>
      <header
        style={{
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div data-tutorial="learn-community" style={{ minWidth: 0, flex: '1 1 260px' }}>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: '28px',
              fontWeight: 800,
              color: 'var(--on-surface)',
              letterSpacing: '-0.02em',
            }}
          >
            Community paths
          </h1>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: '14px',
              color: 'var(--on-surface-variant)',
              lineHeight: 1.5,
            }}
          >
            Clone any path to study it as your own.
          </p>
        </div>
        <Link
          href="/learn/paths"
          style={{
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '10px 16px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-container)',
            color: 'var(--on-surface)',
            border: '1px solid var(--outline-variant)',
            fontFamily: 'inherit',
            fontSize: '14px',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '18px' }}>
            school
          </span>
          My paths
        </Link>
      </header>

      {fromCreate && !bannerDismissed ? (
        <SwitchoverBanner onDismiss={() => setBannerDismissed(true)} />
      ) : null}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <SearchBar value={searchInput} onChange={setSearchInput} />

        <div
          role="toolbar"
          aria-label="Filter community paths"
          style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}
        >
          <SegmentedControl
            options={[
              { value: 'all', label: 'All' },
              { value: 'mine', label: 'My shared' },
            ]}
            value={filter}
            onChange={(v) => setFilter(v as FilterMode)}
          />
          <SortDropdown value={sort} onChange={setSort} />
        </div>

        <FilterChipRow
          label="Subject"
          options={[
            { value: null, label: 'Any subject', icon: 'all_inclusive' },
            ...SUBJECT_IDS.map((id) => ({
              value: id,
              label: SUBJECT_REGISTRY[id].shortLabel,
              icon: SUBJECT_REGISTRY[id].icon,
            })),
          ]}
          value={subject}
          onChange={(v) => setSubject(typeof v === 'string' && isSubjectId(v) ? v : null)}
        />

        <FilterChipRow
          label="Language"
          options={[
            { value: null, label: 'Any language', icon: 'language' },
            ...POPULAR_LANGUAGE_OPTIONS,
          ]}
          value={language}
          onChange={(v) => setLanguage(typeof v === 'string' ? v : null)}
          trailing={<LanguageMoreDropdown value={language} onChange={setLanguage} />}
        />

        <FilterChipRow
          label="Length"
          options={[
            { value: null, label: 'Any length', icon: 'straighten' },
            ...SLOT_RANGES.map((r) => ({ value: r.id, label: r.label, icon: 'straighten' })),
          ]}
          value={slotRange}
          onChange={(v) =>
            setSlotRange(
              v === 'short' || v === 'medium' || v === 'long' ? (v as SlotRangeId) : null,
            )
          }
        />
      </div>

      {error ? <ErrorPanel error={error} onRetry={() => void fetchPaths()} /> : null}

      {loading && !data ? (
        <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px' }}>
          Loading community paths…
        </p>
      ) : !hasResults && !error ? (
        <EmptyState filter={filter} search={search} />
      ) : data ? (
        <>
          <ResultsMeta total={data.total} page={data.page} totalPages={totalPages} loading={loading} />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))',
              gap: '14px',
            }}
          >
            {data.paths.map((p) => (
              <PathCard key={p.shareId} path={p} />
            ))}
          </div>

          <Paginator
            page={page}
            totalPages={totalPages}
            onChange={setPage}
            disabled={loading}
          />
        </>
      ) : null}

      <style>{`
        .community-path-card {
          transition:
            transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
            border-color 0.22s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .community-path-card:hover {
          transform: translateY(-2px);
          border-color: var(--primary);
        }
        .community-path-card:focus-visible {
          outline: 3px solid var(--primary);
          outline-offset: 2px;
        }
        .community-filter-chip:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }
        .community-paginator-btn:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }
        .community-search-input:focus {
          border-color: var(--primary);
        }
        @media (prefers-reduced-motion: reduce) {
          .community-path-card { transition: none; }
          .community-path-card:hover { transform: none; }
        }
      `}</style>
    </div>
  );
}

// ── primitives ──────────────────────────────────────────────────────

function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-md)',
        padding: '0 12px',
      }}
    >
      <span
        className="material-symbols-outlined"
        aria-hidden
        style={{
          fontSize: '20px',
          color: 'var(--on-surface-variant)',
          marginRight: '8px',
        }}
      >
        search
      </span>
      <input
        className="community-search-input"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search title or description…"
        aria-label="Search community paths"
        maxLength={100}
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          padding: '12px 0',
          color: 'var(--on-surface)',
          fontFamily: 'inherit',
          fontSize: '14px',
        }}
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--on-surface-variant)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px',
          }}
        >
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '18px' }}>
            close
          </span>
        </button>
      ) : null}
    </label>
  );
}

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Library scope"
      style={{
        display: 'inline-flex',
        gap: '2px',
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-md)',
        padding: '3px',
      }}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className="community-filter-chip"
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              background: active ? 'var(--primary)' : 'transparent',
              color: active ? 'var(--on-primary)' : 'var(--on-surface-variant)',
              border: 'none',
              fontFamily: 'inherit',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function SortDropdown({
  value,
  onChange,
}: {
  value: SortMode;
  onChange: (v: SortMode) => void;
}) {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-md)',
        padding: '0 12px',
      }}
    >
      <span
        className="material-symbols-outlined"
        aria-hidden
        style={{ fontSize: '18px', color: 'var(--on-surface-variant)' }}
      >
        {SORT_LABELS[value].icon}
      </span>
      <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)', fontWeight: 600 }}>
        Sort
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SortMode)}
        aria-label="Sort by"
        style={{
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: 'var(--on-surface)',
          fontFamily: 'inherit',
          fontSize: '13px',
          fontWeight: 700,
          padding: '8px 0',
          cursor: 'pointer',
        }}
      >
        <option value="popular">{SORT_LABELS.popular.label}</option>
        <option value="recent">{SORT_LABELS.recent.label}</option>
        <option value="rating">{SORT_LABELS.rating.label}</option>
      </select>
    </label>
  );
}

// The long-tail (non-popular) languages live in this "More…" dropdown so
// the chip row stays compact. When one is active the control highlights
// like an active chip; switching back to a popular language or "Any" is
// done via the chips (the dropdown is purely additive).
function LanguageMoreDropdown({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const isOther =
    value != null && !POPULAR_PATH_LANGUAGE_CODES.includes(value as PathLanguageCode);
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        background: isOther ? 'var(--primary)' : 'var(--surface-container)',
        border: `1px solid ${isOther ? 'var(--primary)' : 'var(--outline-variant)'}`,
        borderRadius: 'var(--radius-full)',
        padding: '0 8px 0 10px',
        maxWidth: '100%',
      }}
    >
      <span
        className="material-symbols-outlined"
        aria-hidden
        style={{
          fontSize: '16px',
          color: isOther ? 'var(--on-primary)' : 'var(--on-surface-variant)',
        }}
      >
        more_horiz
      </span>
      <select
        value={isOther ? (value as string) : ''}
        onChange={(e) => {
          // Additive only — picking a language sets it; selecting the
          // placeholder is a no-op (clear via the "Any language" chip).
          if (e.target.value) onChange(e.target.value);
        }}
        aria-label="More languages"
        style={{
          background: 'transparent',
          border: 'none',
          color: isOther ? 'var(--on-primary)' : 'var(--on-surface-variant)',
          fontFamily: 'inherit',
          fontSize: '12px',
          fontWeight: 700,
          letterSpacing: '0.02em',
          padding: '7px 0',
          cursor: 'pointer',
          maxWidth: '150px',
        }}
      >
        <option value="">More…</option>
        {OTHER_LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label} ({l.endonym})
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterChipRow<T extends string | null>({
  label,
  options,
  value,
  onChange,
  trailing,
}: {
  label: string;
  options: Array<{ value: T; label: string; icon: string }>;
  value: T;
  onChange: (v: T) => void;
  /** Optional control rendered after the chips, inside the same row (e.g.
   *  the language "More…" dropdown for the long-tail languages). */
  trailing?: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      style={{
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      <span
        style={{
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--on-surface-variant)',
          minWidth: '70px',
        }}
      >
        {label}
      </span>
      {options.map((opt) => {
        const active = value === opt.value;
        const id = String(opt.value ?? '__null__');
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className="community-filter-chip"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: 'var(--radius-full)',
              background: active ? 'var(--primary)' : 'var(--surface-container)',
              color: active ? 'var(--on-primary)' : 'var(--on-surface-variant)',
              border: `1px solid ${active ? 'var(--primary)' : 'var(--outline-variant)'}`,
              fontFamily: 'inherit',
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.02em',
              cursor: 'pointer',
            }}
          >
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '16px' }}>
              {opt.icon}
            </span>
            {opt.label}
          </button>
        );
      })}
      {trailing}
    </div>
  );
}

function ResultsMeta({
  total,
  page,
  totalPages,
  loading,
}: {
  total: number;
  page: number;
  totalPages: number;
  loading: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
        fontSize: '12px',
        color: 'var(--on-surface-variant)',
      }}
    >
      <span aria-live="polite">
        {loading
          ? 'Refreshing…'
          : `${total} ${total === 1 ? 'path' : 'paths'} found`}
      </span>
      <span aria-hidden style={{ fontVariantNumeric: 'tabular-nums' }}>
        Page {page} / {totalPages}
      </span>
    </div>
  );
}

function Paginator({
  page,
  totalPages,
  onChange,
  disabled,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
  disabled: boolean;
}) {
  if (totalPages <= 1) return null;
  return (
    <div
      style={{
        display: 'flex',
        gap: '8px',
        justifyContent: 'center',
        marginTop: '24px',
        flexWrap: 'wrap',
      }}
    >
      <PageButton
        label="Previous"
        icon="chevron_left"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={disabled || page === 1}
      />
      <span
        aria-hidden
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '8px 16px',
          background: 'var(--surface-container)',
          border: '1px solid var(--outline-variant)',
          borderRadius: 'var(--radius-md)',
          fontSize: '13px',
          fontWeight: 700,
          color: 'var(--on-surface)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {page} / {totalPages}
      </span>
      <PageButton
        label="Next"
        icon="chevron_right"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={disabled || page === totalPages}
        iconRight
      />
    </div>
  );
}

function PageButton({
  label,
  icon,
  onClick,
  disabled,
  iconRight = false,
}: {
  label: string;
  icon: string;
  onClick: () => void;
  disabled: boolean;
  iconRight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="community-paginator-btn"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 14px',
        background: 'var(--surface-container)',
        color: disabled ? 'var(--outline)' : 'var(--on-surface)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-md)',
        fontFamily: 'inherit',
        fontSize: '13px',
        fontWeight: 700,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {!iconRight && (
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '18px' }}>
          {icon}
        </span>
      )}
      {label}
      {iconRight && (
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '18px' }}>
          {icon}
        </span>
      )}
    </button>
  );
}

// ── card ────────────────────────────────────────────────────────────

function PathCard({ path }: { path: PathListItem }) {
  const subjectId = path.subjects.find((s) => isSubjectId(s)) as SubjectId | undefined;
  const subjectDef = subjectId ? SUBJECT_REGISTRY[subjectId] : null;
  const ratingDisplay =
    path.ratingAverage !== null && path.ratingCount > 0
      ? path.ratingAverage.toFixed(1)
      : null;

  return (
    <Link
      href={`/learn/community/${encodeURIComponent(path.shareId)}`}
      className="community-path-card"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '16px',
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
        textDecoration: 'none',
        color: 'var(--on-surface)',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <span
          aria-hidden
          style={{
            width: '44px',
            height: '44px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-container-high)',
            color: 'var(--primary)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>
            {subjectDef?.icon ?? 'menu_book'}
          </span>
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: '16px',
              fontWeight: 700,
              color: 'var(--on-surface)',
              letterSpacing: '-0.01em',
              lineHeight: 1.3,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              overflowWrap: 'anywhere',
            }}
          >
            {path.title}
          </h2>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: '12px',
              color: 'var(--on-surface-variant)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            by @{path.author.username ?? 'unknown'}
          </p>
        </div>
      </div>

      {path.description ? (
        <p
          style={{
            margin: 0,
            fontSize: '13px',
            color: 'var(--on-surface-variant)',
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            overflowWrap: 'anywhere',
          }}
        >
          {path.description}
        </p>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {subjectDef ? (
          <Pill icon={subjectDef.icon} label={subjectDef.shortLabel} />
        ) : null}
        <Pill icon="translate" label={path.language.toUpperCase()} />
        {path.seeded ? <Pill icon="verified" label="Curated" accent /> : null}
      </div>

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '6px 16px',
          margin: 0,
          fontSize: '12px',
          color: 'var(--on-surface-variant)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <Metric icon="route" label="Checkpoints" value={String(path.slotCount)} />
        <Metric icon="layers" label="Phases" value={String(path.phaseCount)} />
        <Metric
          icon="download"
          label="Clones"
          value={formatCount(path.downloadCount)}
        />
        <Metric
          icon={ratingDisplay ? 'star' : 'visibility'}
          label={ratingDisplay ? `Rating · ${path.ratingCount}` : 'Views'}
          value={ratingDisplay ?? formatCount(path.viewCount)}
        />
      </dl>
    </Link>
  );
}

function Pill({
  icon,
  label,
  accent = false,
}: {
  icon: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 8px',
        borderRadius: 'var(--radius-full)',
        background: accent ? 'rgba(174,137,255,0.12)' : 'var(--surface-container-high)',
        border: `1px solid ${accent ? 'rgba(174,137,255,0.32)' : 'var(--outline-variant)'}`,
        color: accent ? 'var(--primary)' : 'var(--on-surface-variant)',
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    >
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '12px' }}>
        {icon}
      </span>
      {label}
    </span>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
      <span
        className="material-symbols-outlined"
        aria-hidden
        style={{ fontSize: '16px', color: 'var(--on-surface-variant)', flexShrink: 0 }}
      >
        {icon}
      </span>
      <dt style={{ display: 'none' }}>{label}</dt>
      <dd style={{ margin: 0, color: 'var(--on-surface)', fontWeight: 700 }}>{value}</dd>
      <span
        style={{
          color: 'var(--on-surface-variant)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontWeight: 400,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function EmptyState({ filter, search }: { filter: FilterMode; search: string }) {
  return (
    <section
      style={{
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
        padding: '32px',
        textAlign: 'center',
      }}
    >
      <span
        className="material-symbols-outlined"
        aria-hidden
        style={{ fontSize: '40px', color: 'var(--on-surface-variant)' }}
      >
        explore
      </span>
      <h2
        style={{
          margin: '12px 0 6px',
          fontFamily: 'var(--font-display)',
          fontSize: '18px',
          fontWeight: 700,
          color: 'var(--on-surface)',
        }}
      >
        {filter === 'mine'
          ? "You haven’t shared any approved paths yet"
          : search
            ? 'No paths match your search'
            : 'No paths match these filters'}
      </h2>
      <p
        style={{
          margin: 0,
          fontSize: '14px',
          color: 'var(--on-surface-variant)',
          lineHeight: 1.5,
        }}
      >
        {filter === 'mine'
          ? 'Publish one of your own paths to see it here once moderation approves it.'
          : 'Try clearing a filter, broadening the language, or searching by topic.'}
      </p>
    </section>
  );
}

function ErrorPanel({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <section
      role="alert"
      style={{
        background: 'var(--surface-container)',
        border: '1px solid var(--error)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        <span
          className="material-symbols-outlined"
          aria-hidden
          style={{ color: 'var(--error)', fontSize: '20px' }}
        >
          error
        </span>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--on-surface)' }}>{error}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        style={{
          padding: '6px 14px',
          background: 'var(--error)',
          color: 'var(--on-error)',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          fontFamily: 'inherit',
          fontSize: '13px',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Retry
      </button>
    </section>
  );
}

// ── helpers ──────────────────────────────────────────────────────────

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

// Phase 12 — explainer shown when a blocked FREE user arrives from the
// create-path CTA (?from=create). Frames the library as the path source
// and AI generation as a Pro perk; dismissible. On-system tokens, solid
// colours (no gradients), light-mode-safe text. AC-Switch-3.
function SwitchoverBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <section
      role="status"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '14px',
        padding: '16px 18px',
        marginBottom: '20px',
        background: 'var(--surface-container-high)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <span
        aria-hidden
        style={{
          width: '40px',
          height: '40px',
          flexShrink: 0,
          borderRadius: 'var(--radius-full)',
          background: 'var(--surface-container)',
          color: 'var(--primary)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>
          auto_stories
        </span>
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: '15px',
            fontWeight: 800,
            color: 'var(--on-surface)',
            letterSpacing: '-0.01em',
          }}
        >
          Looking to create a path?
        </h2>
        <p
          style={{
            margin: '4px 0 0',
            fontSize: '13px',
            lineHeight: 1.6,
            color: 'var(--on-surface-variant)',
          }}
        >
          Generating your own paths with AI is part of Pro. In the meantime, browse the
          library below and clone any path to your own library — free, instantly.
        </p>
        <Link
          href="/pricing"
          className="community-switchover-link"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            marginTop: '8px',
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--primary)',
            textDecoration: 'none',
          }}
        >
          See what Pro includes
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '16px' }}>
            arrow_forward
          </span>
        </Link>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="community-switchover-dismiss"
        style={{
          flexShrink: 0,
          background: 'transparent',
          border: 'none',
          color: 'var(--on-surface-variant)',
          cursor: 'pointer',
          padding: '4px',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
        }}
      >
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '18px' }}>
          close
        </span>
      </button>

      <style>{`
        .community-switchover-link,
        .community-switchover-dismiss {
          transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1),
            opacity 0.2s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .community-switchover-link:hover { opacity: 0.82; }
        .community-switchover-link:active { opacity: 0.7; }
        .community-switchover-dismiss:hover { opacity: 0.7; }
        .community-switchover-link:focus-visible,
        .community-switchover-dismiss:focus-visible {
          outline: 3px solid var(--primary);
          outline-offset: 2px;
          border-radius: var(--radius-sm);
        }
        @media (prefers-reduced-motion: reduce) {
          .community-switchover-link,
          .community-switchover-dismiss { transition: none; }
        }
      `}</style>
    </section>
  );
}
