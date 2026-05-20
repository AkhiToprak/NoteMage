'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { describeModerationReason } from '@/lib/notification-utils';
import {
  L5_NOTE_MAX_CHARS,
  L5_REJECT_CATEGORIES,
  L5_REJECT_CATEGORY_LABELS,
  type L5RejectCategory,
} from '@/lib/moderation/layer5';

/**
 * Admin ticket detail (P6 + P7).
 *
 * AC-Admin-3: surfaces SharedPath summary + the FULL ModerationAudit chain
 * (every layer, every reasoning) + author profile link.
 *
 * P7 wires the decision panel: approve / reject buttons that POST to
 * /api/admin/tickets/[id]/{approve,reject}, with the 8-state interactive
 * contract (default · hover · focus-visible · active · disabled · loading
 * · error · success). When the ticket is already resolved the panel
 * collapses to a compact footer; the audit timeline above always carries
 * the L5 row.
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
  // Bumped by the decision panel after a successful approve/reject so
  // the timeline refetches and the L5 audit row appears without a
  // page reload. Kept as a counter (not a boolean toggle) so two
  // back-to-back actions both invalidate cleanly.
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

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
  }, [id, reloadKey]);

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
        <DetailBody data={data} isPhone={isPhone} ticketId={id} onChanged={reload} />
      ) : null}
    </div>
  );
}

function DetailBody({
  data,
  isPhone,
  ticketId,
  onChanged,
}: {
  data: DetailResponse;
  isPhone: boolean;
  ticketId: string;
  onChanged: () => void;
}) {
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

      <DecisionPanel
        ticket={ticket}
        sharedPath={sharedPath}
        ticketId={ticketId}
        onChanged={onChanged}
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

// ── decision panel (P7) ──────────────────────────────────────────────────
//
// Hallmark · component: admin-decision-panel · genre: editorial
// states: default · hover · focus · active · disabled · loading · error · success
// contrast: token-driven (every fg/bg derives from globals.css; both
//           dark and light themes flip automatically — gates 46–50 pass)
//
// Two render branches:
//   1. Already-resolved ticket → compact footer ("Resolved by @admin").
//      The L5 audit row is already in the timeline above; the panel
//      doesn't repeat that history.
//   2. Out-of-queue path (path moved to approved/rejected via another
//      channel) → an inert state notice. No controls offered because
//      no action is meaningful.
//   3. In-queue path (`flagged_pending_human`) → two-mode panel:
//      approve-first (primary CTA) with a secondary "Reject…" trigger
//      that expands the reason-code select + note. This avoids the
//      "two symmetric buttons" anti-pattern (gate 56) — approval is
//      the affirmative single-click; rejection requires a deliberate
//      reveal so the admin can't fat-finger an irreversible reject.
//
// Note + reasonCode are validated client-side at the same caps as the
// API to keep the round-trip honest, but the server is the source of
// truth — a stale client can't slip a 2K-char note or a non-allow-list
// reason code through.

interface TicketLike {
  id: string;
  status: string;
  resolvedBy: Actor;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

interface SharedPathLike {
  moderationStatus: string;
}

function DecisionPanel({
  ticket,
  sharedPath,
  ticketId,
  onChanged,
}: {
  ticket: TicketLike;
  sharedPath: SharedPathLike;
  ticketId: string;
  onChanged: () => void;
}) {
  // Branch 1 — ticket is already resolved/dismissed. Show provenance.
  if (ticket.status === 'resolved' || ticket.status === 'dismissed') {
    return <ResolvedFooter ticket={ticket} pathStatus={sharedPath.moderationStatus} />;
  }

  // Branch 2 — ticket is open but the path moved out of the human
  // queue (another admin acted, author unpublished). Surface as inert.
  if (sharedPath.moderationStatus !== 'flagged_pending_human') {
    return (
      <Notice
        icon="lock"
        title={`Path is in state "${sharedPath.moderationStatus.replace(/_/g, ' ')}"`}
        body="The ticket is still open but the path is no longer in the human queue. Dismiss the ticket or wait for the upstream layer to reconcile."
      />
    );
  }

  // Branch 3 — actionable.
  return (
    <DecisionPanelControls ticketId={ticketId} onChanged={onChanged} />
  );
}

function ResolvedFooter({
  ticket,
  pathStatus,
}: {
  ticket: TicketLike;
  pathStatus: string;
}) {
  const who = ticket.resolvedBy?.username
    ? `@${ticket.resolvedBy.username}`
    : ticket.resolvedBy?.id
      ? `admin ${ticket.resolvedBy.id.slice(0, 8)}`
      : 'an admin';
  const when = ticket.resolvedAt ? fmtDate(ticket.resolvedAt) : null;
  const outcome =
    pathStatus === 'approved'
      ? 'approved'
      : pathStatus === 'rejected'
        ? 'rejected'
        : 'closed';

  return (
    <section
      aria-label="Ticket resolved"
      style={{
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <span
        style={{
          fontSize: 11,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--on-surface-variant)',
        }}
      >
        Ticket resolved
      </span>
      <p
        style={{
          fontSize: 14,
          color: 'var(--on-surface)',
          margin: 0,
          lineHeight: 1.55,
        }}
      >
        {who} {outcome} this path{when ? ` on ${when}` : ''}.
      </p>
      {ticket.resolutionNote ? (
        <p
          style={{
            fontSize: 13,
            color: 'var(--on-surface-variant)',
            margin: 0,
            lineHeight: 1.55,
            padding: '10px 12px',
            background: 'var(--surface-container-low)',
            border: '1px solid var(--outline-variant)',
            borderRadius: 'var(--radius-sm)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {ticket.resolutionNote}
        </p>
      ) : null}
    </section>
  );
}

function DecisionPanelControls({
  ticketId,
  onChanged,
}: {
  ticketId: string;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<'approve' | 'reject'>('approve');
  const [note, setNote] = useState('');
  const [reasonCategory, setReasonCategory] = useState<L5RejectCategory | ''>('');
  const [submitting, setSubmitting] = useState<null | 'approve' | 'reject'>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const isApproving = submitting === 'approve';
  const isRejecting = submitting === 'reject';
  const noteOverCap = note.length > L5_NOTE_MAX_CHARS;
  const rejectReady = !!reasonCategory && !noteOverCap;
  const anyDisabled = submitting !== null;

  async function submit(action: 'approve' | 'reject') {
    if (anyDisabled) return;
    if (action === 'reject' && !rejectReady) {
      setError(
        !reasonCategory
          ? 'Pick a reason before rejecting.'
          : `Note is over the ${L5_NOTE_MAX_CHARS}-character limit.`,
      );
      return;
    }
    if (noteOverCap) {
      setError(`Note is over the ${L5_NOTE_MAX_CHARS}-character limit.`);
      return;
    }
    setError(null);
    setSubmitting(action);
    try {
      const body: Record<string, unknown> = {};
      if (note.trim().length > 0) body.note = note.trim();
      if (action === 'reject') body.reasonCode = `l5.${reasonCategory}`;
      const res = await fetch(`/api/admin/tickets/${ticketId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await safeReadJson(res);
        const message =
          (json && typeof json === 'object' && 'error' in json
            ? String((json as { error: unknown }).error)
            : null) ?? `request failed (${res.status})`;
        setError(message);
        setSubmitting(null);
        return;
      }
      // Successful — clear the form and ask the parent to refetch. The
      // parent re-render will swap this control panel for the
      // ResolvedFooter, so we don't need a local success surface.
      setNote('');
      setReasonCategory('');
      setSubmitting(null);
      onChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'request failed');
      setSubmitting(null);
    }
  }

  return (
    <section
      aria-label="Moderation decision"
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
      <DecisionPanelStyles />

      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span
          style={{
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--on-surface-variant)',
          }}
        >
          Human decision
        </span>
        <h2
          className="font-display"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            margin: 0,
            color: 'var(--on-surface)',
          }}
        >
          {mode === 'approve' ? 'Approve or reject this path' : 'Reject this path'}
        </h2>
        <p
          style={{
            fontSize: 13,
            color: 'var(--on-surface-variant)',
            margin: '2px 0 0',
            lineHeight: 1.55,
          }}
        >
          {mode === 'approve'
            ? 'Approving publishes the path to the community library. Rejecting keeps it private and notifies the author with the reason.'
            : 'Pick a reason and (optionally) leave a short note. Both surface to the author on their publication-status page.'}
        </p>
      </header>

      {error ? (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '10px 12px',
            background: 'var(--error-container)',
            color: 'var(--on-error)',
            border: '1px solid var(--outline-variant)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
            error
          </span>
          <span style={{ fontSize: 13, lineHeight: 1.5 }}>{error}</span>
        </div>
      ) : null}

      {mode === 'reject' ? (
        <label
          style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          <span
            style={{
              fontSize: 12,
              color: 'var(--on-surface-variant)',
              letterSpacing: '0.04em',
            }}
          >
            Reason
          </span>
          <select
            className="admin-decision-select"
            value={reasonCategory}
            onChange={(e) => {
              setReasonCategory(e.target.value as L5RejectCategory | '');
              setError(null);
            }}
            disabled={anyDisabled}
          >
            <option value="">Pick a reason…</option>
            {L5_REJECT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {L5_REJECT_CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span
          style={{
            fontSize: 12,
            color: 'var(--on-surface-variant)',
            letterSpacing: '0.04em',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>Note {mode === 'approve' ? '(optional)' : '(optional, recommended)'}</span>
          <span
            style={{
              fontSize: 11,
              color: noteOverCap ? 'var(--on-error)' : 'var(--on-surface-variant)',
            }}
            aria-live="polite"
          >
            {note.length}/{L5_NOTE_MAX_CHARS}
          </span>
        </span>
        <textarea
          className="admin-decision-textarea"
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            if (error) setError(null);
          }}
          placeholder={
            mode === 'approve'
              ? 'Optional internal note — appears on the audit trail.'
              : 'Optional qualifier — appears in the author-facing reason after the canned category phrase.'
          }
          maxLength={L5_NOTE_MAX_CHARS + 200} /* server is the cap; +200 buffer to allow the live "over-cap" warning */
          rows={3}
          disabled={anyDisabled}
          aria-invalid={noteOverCap || undefined}
        />
      </label>

      <footer
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          paddingTop: 4,
          justifyContent: mode === 'approve' ? 'space-between' : 'flex-end',
          alignItems: 'center',
        }}
      >
        {mode === 'approve' ? (
          <>
            <button
              type="button"
              className="admin-decision-btn admin-decision-btn--ghost"
              onClick={() => {
                setMode('reject');
                setError(null);
              }}
              disabled={anyDisabled}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
                block
              </span>
              Reject…
            </button>
            <button
              type="button"
              className="admin-decision-btn admin-decision-btn--primary"
              onClick={() => submit('approve')}
              disabled={anyDisabled || noteOverCap}
              aria-busy={isApproving || undefined}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
                {isApproving ? 'progress_activity' : 'check'}
              </span>
              {isApproving ? 'Approving…' : 'Approve & publish'}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="admin-decision-btn admin-decision-btn--ghost"
              onClick={() => {
                setMode('approve');
                setError(null);
              }}
              disabled={anyDisabled}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
                arrow_back
              </span>
              Cancel
            </button>
            <button
              type="button"
              className="admin-decision-btn admin-decision-btn--danger"
              onClick={() => submit('reject')}
              disabled={anyDisabled || !rejectReady}
              aria-busy={isRejecting || undefined}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
                {isRejecting ? 'progress_activity' : 'gavel'}
              </span>
              {isRejecting ? 'Rejecting…' : 'Reject'}
            </button>
          </>
        )}
      </footer>
    </section>
  );
}

/**
 * Scoped CSS for the decision-panel controls. Pseudo-states (:hover,
 * :focus-visible, :active, :disabled) aren't expressible from inline
 * style objects, so the project's inline-style convention bends to a
 * single in-component <style> block here. Mirrors the token surface
 * the rest of the admin shell uses (var(--primary), var(--error),
 * var(--surface-container-high)) — light theme auto-flips.
 */
function DecisionPanelStyles() {
  return (
    <style>{`
      .admin-decision-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 9px 16px;
        font: inherit;
        font-size: 14px;
        font-weight: 600;
        letter-spacing: -0.005em;
        border-radius: var(--radius-md);
        border: 1px solid transparent;
        cursor: pointer;
        background: var(--surface-container-high);
        color: var(--on-surface);
        transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1),
                    opacity 0.18s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .admin-decision-btn:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }
      .admin-decision-btn:active:not(:disabled) {
        transform: translateY(1px);
      }
      .admin-decision-btn:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .admin-decision-btn[aria-busy="true"] .material-symbols-outlined {
        animation: admin-decision-spin 0.9s linear infinite;
      }

      .admin-decision-btn--primary {
        background: var(--primary);
        color: var(--on-primary);
        border-color: var(--primary);
      }
      .admin-decision-btn--primary:hover:not(:disabled) {
        background: var(--primary-dim);
        border-color: var(--primary-dim);
      }

      .admin-decision-btn--danger {
        background: var(--error);
        color: var(--on-error);
        border-color: var(--error);
      }
      .admin-decision-btn--danger:hover:not(:disabled) {
        filter: brightness(0.92);
      }

      .admin-decision-btn--ghost {
        background: transparent;
        color: var(--on-surface-variant);
        border-color: var(--outline-variant);
      }
      .admin-decision-btn--ghost:hover:not(:disabled) {
        background: var(--surface-container-high);
        color: var(--on-surface);
      }

      .admin-decision-select,
      .admin-decision-textarea {
        font: inherit;
        font-size: 14px;
        color: var(--on-surface);
        background: var(--surface-container-low);
        border: 1px solid var(--outline-variant);
        border-radius: var(--radius-md);
        padding: 10px 12px;
        line-height: 1.5;
        resize: vertical;
        width: 100%;
        box-sizing: border-box;
      }
      .admin-decision-select:focus-visible,
      .admin-decision-textarea:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
        border-color: var(--primary);
      }
      .admin-decision-textarea[aria-invalid="true"] {
        border-color: var(--error);
      }
      .admin-decision-select:disabled,
      .admin-decision-textarea:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }

      @keyframes admin-decision-spin {
        to { transform: rotate(360deg); }
      }
      @media (prefers-reduced-motion: reduce) {
        .admin-decision-btn[aria-busy="true"] .material-symbols-outlined {
          animation: none;
          opacity: 0.7;
        }
      }
    `}</style>
  );
}

async function safeReadJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
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
