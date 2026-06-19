/* Hallmark · component-scope · genre: utilitarian (internal admin) · theme: project design system (figma-design-system.md tokens)
 * states: default · hover · focus-visible · active · disabled · loading · error
 * Imported-PDF assets debug view — reuses the /admin console primitives
 * (AdminHeader · DataTable · Chip · Paginator · useAdminData). No new tokens,
 * no gradients; every colour resolves to a CSS custom property.
 * pre-emit critique: P5 H5 E5 S5 R5 V4
 */
'use client';

import { useEffect, useState } from 'react';
import {
  AdminHeader,
  EmptyShell,
  ActionButton,
  DataTable,
  Chip,
  SearchInput,
  Paginator,
  StatTile,
  StatGrid,
  useAdminData,
  type ChipTone,
  type Column,
} from '../_components/ui';

type ReusedIn = { theory: boolean; flashcard: boolean; quiz: boolean };

type Asset = {
  id: string;
  documentName: string | null;
  pageTitle: string;
  pageNumber: number | null;
  ownerEmail: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  bbox: number[] | null;
  sourceType: string | null;
  caption: string | null;
  captioned: boolean;
  passedSanitize: boolean;
  inCatalog: boolean;
  reusedIn: ReusedIn;
  createdAt: string;
};

type AssetsResponse = {
  items: Asset[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  sourceTypes: { value: string; count: number }[];
};

const SOURCE_TONE: Record<string, ChipTone> = {
  vision_crop: 'primary',
  embedded_scan: 'info',
  manual_upload: 'neutral',
  pptx: 'warn',
  onenote: 'neutral',
  unknown: 'neutral',
};

const fmtKB = (b: number) => `${Math.max(1, Math.round(b / 1024)).toLocaleString()} KB`;

const fmtBbox = (bbox: number[] | null) =>
  Array.isArray(bbox) && bbox.length === 4
    ? `[${bbox.map((n) => (Number.isFinite(n) ? n.toFixed(2) : '?')).join(', ')}]`
    : '—';

function BoolChip({ value, yes, no }: { value: boolean; yes: string; no: string }) {
  return <Chip label={value ? yes : no} tone={value ? 'success' : 'danger'} />;
}

const COLUMNS: Column<Asset>[] = [
  {
    key: 'preview',
    header: 'Preview',
    width: 72,
    render: (r) => (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/admin/pdf-assets/image/${r.id}`}
        alt={r.caption ?? r.fileName}
        loading="lazy"
        width={56}
        height={56}
        style={{
          width: 56,
          height: 56,
          objectFit: 'contain',
          background: 'var(--surface-container-low)',
          border: '1px solid var(--outline-variant)',
          borderRadius: 'var(--radius-sm)',
        }}
      />
    ),
  },
  {
    key: 'document',
    header: 'Document / Page',
    render: (r) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, maxWidth: 240 }}>
        <span style={{ fontWeight: 600, color: 'var(--on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.documentName ?? r.pageTitle}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.ownerEmail}
        </span>
      </div>
    ),
  },
  {
    key: 'pageNumber',
    header: 'PDF pg',
    align: 'right',
    render: (r) => (r.pageNumber != null ? r.pageNumber : '—'),
  },
  {
    key: 'sourceType',
    header: 'Source',
    render: (r) => <Chip label={r.sourceType ?? 'unknown'} tone={SOURCE_TONE[r.sourceType ?? 'unknown'] ?? 'neutral'} />,
  },
  {
    key: 'bbox',
    header: 'bbox',
    render: (r) => (
      <span style={{ fontFamily: 'var(--font-brand, monospace)', fontSize: 12, color: 'var(--on-surface-variant)' }}>
        {fmtBbox(r.bbox)}
      </span>
    ),
  },
  {
    key: 'caption',
    header: 'Caption',
    render: (r) =>
      r.caption ? (
        <span style={{ display: 'inline-block', maxWidth: 280, color: 'var(--on-surface)' }} title={r.caption}>
          {r.caption}
        </span>
      ) : (
        <span style={{ color: 'var(--on-surface-variant)', fontStyle: 'italic' }}>uncaptioned</span>
      ),
  },
  {
    key: 'passedSanitize',
    header: 'Sanitize',
    align: 'center',
    render: (r) => <BoolChip value={r.passedSanitize} yes="pass" no="fail" />,
  },
  {
    key: 'inCatalog',
    header: 'In catalog',
    align: 'center',
    render: (r) => <BoolChip value={r.inCatalog} yes="yes" no="no" />,
  },
  {
    key: 'reused',
    header: 'Reused in',
    render: (r) => {
      const tags: string[] = [];
      if (r.reusedIn.theory) tags.push('theory');
      if (r.reusedIn.flashcard) tags.push('cards');
      if (r.reusedIn.quiz) tags.push('quiz');
      return tags.length > 0 ? (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {tags.map((t) => (
            <Chip key={t} label={t} tone="primary" />
          ))}
        </div>
      ) : (
        <span style={{ color: 'var(--on-surface-variant)' }}>—</span>
      );
    },
  },
  {
    key: 'fileSize',
    header: 'Size',
    align: 'right',
    render: (r) => <span style={{ color: 'var(--on-surface-variant)' }}>{fmtKB(r.fileSize)}</span>,
  },
];

export default function AdminPdfAssetsPage() {
  const [page, setPage] = useState(1);
  const [sourceType, setSourceType] = useState<string | null>(null);
  const [qInput, setQInput] = useState('');
  const [qApplied, setQApplied] = useState('');

  // Debounce the search box so typing doesn't refetch every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setQApplied(qInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [qInput]);

  const params = new URLSearchParams({ page: String(page) });
  if (sourceType) params.set('sourceType', sourceType);
  if (qApplied) params.set('q', qApplied);
  const { data, loading, error, reload } = useAdminData<AssetsResponse>(
    `/api/admin/pdf-assets?${params.toString()}`,
  );

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <AdminHeader
        eyebrow="Pipeline"
        title="PDF assets"
        description="Every image extracted from imports, with its provenance and whether the figure-reuse pipeline kept it — passed sanitize, entered the prompt catalog, and was reused in theory, cards, or quizzes."
        actions={
          <ActionButton icon="refresh" onClick={reload} loading={loading}>
            Refresh
          </ActionButton>
        }
      />

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <SearchInput value={qInput} onChange={setQInput} placeholder="Search by page title…" />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <FilterChip label="All" active={sourceType === null} onClick={() => { setSourceType(null); setPage(1); }} />
          {data?.sourceTypes.map((s) => (
            <FilterChip
              key={s.value}
              label={`${s.value} · ${s.count}`}
              active={sourceType === s.value}
              onClick={() => { setSourceType(s.value === 'unknown' ? 'unknown' : s.value); setPage(1); }}
            />
          ))}
        </div>
      </div>

      {error ? (
        <EmptyShell icon="error" title="Couldn’t load assets" body={`The /api/admin/pdf-assets request failed (${error}). Refresh to retry.`} />
      ) : loading && !data ? (
        <EmptyShell icon="hourglass_empty" title="Loading assets" body="Fetching imported PDF assets." />
      ) : data && data.items.length > 0 ? (
        <>
          <StatGrid>
            <StatTile label="Total assets" value={data.total.toLocaleString()} hint="Across all users" />
            <StatTile label="On this page" value={data.items.length} />
            <StatTile
              label="In catalog"
              value={data.items.filter((i) => i.inCatalog).length}
              hint="Of the rows shown"
              accent
            />
            <StatTile
              label="Reused"
              value={data.items.filter((i) => i.reusedIn.theory || i.reusedIn.flashcard || i.reusedIn.quiz).length}
              hint="Of the rows shown"
            />
          </StatGrid>

          <DataTable<Asset> columns={COLUMNS} rows={data.items} getRowKey={(r) => r.id} />

          <Paginator
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            shown={data.items.length}
            onPage={setPage}
          />
        </>
      ) : (
        <EmptyShell
          icon="image_not_supported"
          title="No assets found"
          body="No imported images match the current filter. Clear the filter or import a PDF with figures."
        />
      )}
    </div>
  );
}

/** Small filter pill — reuses the console's `adm-btn` state layer. */
function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="adm-btn"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: '5px 11px',
        fontSize: 12.5,
        fontWeight: 600,
        borderRadius: 'var(--radius-full)',
        border: `1px solid ${active ? 'var(--primary)' : 'var(--outline-variant)'}`,
        background: active ? 'rgba(174,137,255,0.14)' : 'var(--surface-container-high)',
        color: active ? 'var(--primary)' : 'var(--on-surface-variant)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}
