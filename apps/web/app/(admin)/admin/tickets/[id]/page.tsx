'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { describeModerationReason } from '@/lib/notification-utils';

/**
 * Admin ticket detail (P6).
 *
 * AC-Admin-3: surfaces SharedPath summary + the FULL ModerationAudit chain
 * (every layer, every reasoning) + author profile link. P6 is read-only —
 * approve / reject buttons land in P7; this page declares that intent
 * inline so the admin isn't surprised by the missing actions.
 */

type Actor = { id: string; username: string | null } | null;
type AuthorSummary = {
  id: string;
  username: string | null;
  avatarUrl: string | null;
  email: string | null;
};

type SharedPathDetail = {
  id: string;
  title: string;
  description: string | null;
  language: string;
  subjects: string[];
  phaseCount: number;
  slotCount: number;
  moderationStatus: string;
  rejectionReason: string | null;
  seeded: boolean;
  downloadCount: number;
  viewCount: number;
  ratingAverage: number | null;
  ratingCount: number;
  createdAt: string;
  approvedAt: string | null;
  sharedBy: AuthorSummary;
};

type AuditRow = {
  id: string;
  layer: number;
  verdict: string;
  reasonCode: string | null;
  reasoning: string | null;
  model: string | null;
  actor: Actor;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  createdAt: string;
};

type DetailResponse = {
  ticket: {
    id: string;
    type: string;
    refType: string;
    refId: string;
    status: string;
    assignee: Actor;
    resolvedBy: Actor;
    resolvedAt: string | null;
    resolutionNote: string | null;
    createdAt: string;
    updatedAt: string;
  };
  sharedPath: SharedPathDetail;
  audits: AuditRow[];
};

export default function AdminTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { isPhone } = useBreakpoint();

  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    // Sync setState in the effect body trips React Compiler's lint
    // (`react-hooks/set-state-in-effect`); the IIFE moves both resets
    // into an async branch where the rule is satisfied without changing
    // the visible behaviour.
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/tickets/${id}`);
        if (!res.ok) {
          if (!cancelled) {
            setError({ status: res.status, message: `ticket ${res.status}` });
            setLoading(false);
          }
          return;
        }
        const json = await res.json();
        if (!cancelled) {
          setData(json?.data as DetailResponse);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError({ status: 0, message: err instanceof Error ? err.message : 'failed' });
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Link
        href="/admin/tickets"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
          color: 'var(--on-surface-variant)',
          textDecoration: 'none',
          alignSelf: 'flex-start',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
          arrow_back
        </span>
        Back to tickets
      </Link>

      {loading ? (
        <Notice icon="hourglass_empty" title="Loading ticket" body="Fetching SharedPath + audit chain." />
      ) : error ? (
        <Notice
          icon={error.status === 404 ? 'search_off' : 'error'}
          title={error.status === 404 ? 'Ticket not found' : 'Couldn’t load ticket'}
          body={
            error.status === 404
              ? 'The ticket may have been auto-dismissed (author deleted the path) or never existed.'
              : `Request failed (${error.message}). Refresh to retry.`
          }
        />
      ) : data ? (
        <DetailBody data={data} isPhone={isPhone} />
      ) : null}
    </div>
  );
}

function DetailBody({ data, isPhone }: { data: DetailResponse; isPhone: boolean }) {
  const { ticket, sharedPath, audits } = data;
  return (
    <>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p
          style={{
            fontSize: 12,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--on-surface-variant)',
            margin: 0,
          }}
        >
          Ticket · {ticket.type.replace(/_/g, ' ')}
        </p>
        <h1
          className="font-display"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: isPhone ? 24 : 30,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            margin: 0,
            color: 'var(--on-surface)',
            wordBreak: 'break-word',
          }}
        >
          {sharedPath.title}
        </h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 2 }}>
          <StatusChip status={ticket.status} />
          <ModerationStateChip status={sharedPath.moderationStatus} />
          <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
            Opened {fmtDate(ticket.createdAt)}
          </span>
          {ticket.resolvedAt ? (
            <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
              · Resolved {fmtDate(ticket.resolvedAt)}
            </span>
          ) : null}
        </div>
      </header>

      <PathSummary path={sharedPath} />

      <section
        aria-label="Moderation audit chain"
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <h2
          className="font-display"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            margin: 0,
            color: 'var(--on-surface)',
          }}
        >
          Audit chain
        </h2>
        {audits.length === 0 ? (
          <Notice
            icon="info"
            title="No audit rows yet"
            body="A ticket without a prior L1/L2/L3 chain is unusual — check the moderation pipeline logs."
          />
        ) : (
          <ol
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {audits.map((row) => (
              <li key={row.id}>
                <AuditRowCard row={row} />
              </li>
            ))}
          </ol>
        )}
      </section>

      <Notice
        icon="construction"
        title="Decision UI lands in Phase 7"
        body="Approve / Reject buttons (with reason codes) wire up in P7. P6 is read-only — this is the surface, not the action."
      />
    </>
  );
}

// ── path summary ──────────────────────────────────────────────────────────

function PathSummary({ path }: { path: SharedPathDetail }) {
  const author = path.sharedBy;
  const authorLink = author?.username ? `/profile/${author.username}` : null;
  return (
    <section
      aria-label="Shared path summary"
      style={{
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span
          style={{
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--on-surface-variant)',
          }}
        >
          Shared path
        </span>
        {path.description ? (
          <p
            style={{
              fontSize: 14,
              color: 'var(--on-surface-variant)',
              margin: '4px 0 0',
              lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {path.description}
          </p>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', margin: '4px 0 0', fontStyle: 'italic' }}>
            (no description)
          </p>
        )}
      </div>

      <dl
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          margin: 0,
        }}
      >
        <Stat label="Language" value={path.language.toUpperCase()} />
        <Stat label="Phases" value={path.phaseCount.toString()} />
        <Stat label="Slots" value={path.slotCount.toString()} />
        <Stat label="Clones" value={path.downloadCount.toLocaleString()} />
        <Stat label="Views" value={path.viewCount.toLocaleString()} />
        <Stat
          label="Rating"
          value={
            path.ratingCount > 0 && path.ratingAverage !== null
              ? `${path.ratingAverage.toFixed(2)} (${path.ratingCount})`
              : '—'
          }
        />
      </dl>

      {path.subjects.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {path.subjects.map((s) => (
            <span
              key={s}
              style={{
                fontSize: 11,
                padding: '3px 8px',
                background: 'var(--surface-container-high)',
                color: 'var(--on-surface-variant)',
                borderRadius: 'var(--radius-full)',
                border: '1px solid var(--outline-variant)',
              }}
            >
              {s}
            </span>
          ))}
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          paddingTop: 12,
          borderTop: '1px solid var(--outline-variant)',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 20, color: 'var(--on-surface-variant)' }}
          aria-hidden
        >
          person
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', letterSpacing: '0.04em' }}>
            Published by
          </span>
          {authorLink ? (
            <Link
              href={authorLink}
              style={{
                fontSize: 14,
                color: 'var(--primary)',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              @{author?.username}
            </Link>
          ) : (
            <span style={{ fontSize: 14, color: 'var(--on-surface)' }}>
              {author?.email || 'unknown'}
            </span>
          )}
        </div>
        {path.seeded ? (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              padding: '3px 9px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--secondary-container)',
              color: 'var(--secondary)',
            }}
          >
            Seeded
          </span>
        ) : null}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <dt style={{ fontSize: 11, color: 'var(--on-surface-variant)', letterSpacing: '0.04em' }}>{label}</dt>
      <dd
        className="font-display"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 16,
          fontWeight: 600,
          margin: 0,
          color: 'var(--on-surface)',
        }}
      >
        {value}
      </dd>
    </div>
  );
}

// ── audit row ────────────────────────────────────────────────────────────

function AuditRowCard({ row }: { row: AuditRow }) {
  const layerInfo = LAYER_LABELS[row.layer] ?? {
    label: `Layer ${row.layer}`,
    icon: 'help',
    tag: `L${row.layer}`,
  };
  const verdictInfo = VERDICT_LABELS[row.verdict] ?? { label: row.verdict, kind: 'neutral' as const };

  return (
    <article
      style={{
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            background: 'var(--surface-container-high)',
            color: 'var(--on-surface)',
            border: '1px solid var(--outline-variant)',
            borderRadius: 'var(--radius-full)',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.04em',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>
            {layerInfo.icon}
          </span>
          {layerInfo.tag} · {layerInfo.label}
        </span>
        <VerdictPill kind={verdictInfo.kind} label={verdictInfo.label} />
        <span style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginLeft: 'auto' }}>
          {fmtDate(row.createdAt)}
        </span>
      </header>

      {row.reasonCode ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span
            style={{ fontSize: 11, color: 'var(--on-surface-variant)', letterSpacing: '0.04em' }}
          >
            Reason
          </span>
          <p
            style={{
              fontSize: 14,
              color: 'var(--on-surface)',
              margin: 0,
            }}
          >
            <code
              style={{
                fontFamily: 'var(--font-jetbrains), ui-monospace, monospace',
                fontSize: 12,
                padding: '2px 6px',
                background: 'var(--surface-container-low)',
                color: 'var(--on-surface-variant)',
                borderRadius: 'var(--radius-sm)',
                marginRight: 8,
              }}
            >
              {row.reasonCode}
            </code>
            {describeModerationReason(row.reasonCode)}
          </p>
        </div>
      ) : null}

      {row.reasoning ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', letterSpacing: '0.04em' }}>
            Reasoning
          </span>
          <p
            style={{
              fontSize: 13,
              color: 'var(--on-surface)',
              margin: 0,
              lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: 'var(--surface-container-low)',
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--outline-variant)',
            }}
          >
            {row.reasoning}
          </p>
        </div>
      ) : null}

      <footer
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          fontSize: 12,
          color: 'var(--on-surface-variant)',
          paddingTop: 4,
        }}
      >
        {row.model ? (
          <Meta label="Model" value={row.model} mono />
        ) : null}
        {row.actor ? (
          <Meta
            label="Actor"
            value={row.actor.username ? `@${row.actor.username}` : row.actor.id.slice(0, 8)}
          />
        ) : null}
        {row.costUsd > 0 ? <Meta label="Cost" value={`$${row.costUsd.toFixed(4)}`} /> : null}
        {row.tokensIn > 0 ? <Meta label="Tokens in" value={row.tokensIn.toLocaleString()} /> : null}
        {row.tokensOut > 0 ? (
          <Meta label="Tokens out" value={row.tokensOut.toLocaleString()} />
        ) : null}
        {row.cacheReadTokens > 0 ? (
          <Meta label="Cache read" value={row.cacheReadTokens.toLocaleString()} />
        ) : null}
      </footer>
    </article>
  );
}

function Meta({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 10, letterSpacing: '0.05em', color: 'var(--on-surface-variant)' }}>
        {label.toUpperCase()}
      </span>
      <span
        style={{
          fontSize: 12,
          color: 'var(--on-surface)',
          fontFamily: mono ? 'var(--font-jetbrains), ui-monospace, monospace' : undefined,
        }}
      >
        {value}
      </span>
    </span>
  );
}

function VerdictPill({ kind, label }: { kind: 'pass' | 'reject' | 'flag' | 'neutral'; label: string }) {
  const palette = {
    pass: { bg: 'var(--secondary-container)', fg: 'var(--secondary)' },
    flag: { bg: 'var(--tertiary-container)', fg: 'var(--on-tertiary)' },
    reject: { bg: 'var(--error-container)', fg: 'var(--on-error)' },
    neutral: { bg: 'var(--surface-container-high)', fg: 'var(--on-surface-variant)' },
  } as const;
  const colors = palette[kind];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 10px',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        borderRadius: 'var(--radius-full)',
        background: colors.bg,
        color: colors.fg,
      }}
    >
      {label}
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  const palette: Record<string, { bg: string; fg: string }> = {
    open: { bg: 'var(--tertiary-container)', fg: 'var(--on-tertiary)' },
    assigned: { bg: 'var(--secondary-container)', fg: 'var(--secondary)' },
    resolved: { bg: 'var(--surface-container-high)', fg: 'var(--on-surface-variant)' },
    dismissed: { bg: 'var(--surface-container-high)', fg: 'var(--on-surface-variant)' },
  };
  const colors = palette[status] ?? palette.open;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 10px',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        borderRadius: 'var(--radius-full)',
        background: colors.bg,
        color: colors.fg,
      }}
    >
      Ticket {status}
    </span>
  );
}

function ModerationStateChip({ status }: { status: string }) {
  const isApproved = status === 'approved';
  const isReject = status === 'rejected';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 10px',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        borderRadius: 'var(--radius-full)',
        background: isApproved
          ? 'var(--secondary-container)'
          : isReject
            ? 'var(--error-container)'
            : 'var(--surface-container-high)',
        color: isApproved
          ? 'var(--secondary)'
          : isReject
            ? 'var(--on-error)'
            : 'var(--on-surface-variant)',
      }}
    >
      Path {status.replace(/_/g, ' ')}
    </span>
  );
}

function Notice({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div
      style={{
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        textAlign: 'center',
      }}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: 28, color: 'var(--on-surface-variant)' }}
        aria-hidden
      >
        {icon}
      </span>
      <span
        className="font-display"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--on-surface)',
        }}
      >
        {title}
      </span>
      <span style={{ fontSize: 13, color: 'var(--on-surface-variant)', maxWidth: 480, lineHeight: 1.5 }}>
        {body}
      </span>
    </div>
  );
}

// ── data tables ──────────────────────────────────────────────────────────

const LAYER_LABELS: Record<number, { label: string; icon: string; tag: string }> = {
  1: { label: 'Wordlist filter', icon: 'spellcheck', tag: 'L1' },
  2: { label: 'Cheap-model audit', icon: 'auto_awesome', tag: 'L2' },
  3: { label: 'Detailed AI audit', icon: 'psychology', tag: 'L3' },
  5: { label: 'Human review', icon: 'gavel', tag: 'L5' },
};

const VERDICT_LABELS: Record<string, { label: string; kind: 'pass' | 'reject' | 'flag' | 'neutral' }> = {
  pass: { label: 'Pass', kind: 'pass' },
  reject: { label: 'Reject', kind: 'reject' },
  flag: { label: 'Flag for review', kind: 'flag' },
  auto_reject: { label: 'Auto-reject', kind: 'reject' },
  escalate_to_human: { label: 'Escalate to human', kind: 'flag' },
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
