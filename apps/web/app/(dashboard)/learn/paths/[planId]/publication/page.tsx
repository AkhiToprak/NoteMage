// Hallmark · macrostructure: Long Document (editorial intake) · genre: editorial-tech
// theme: locked-by-figma-design-system
// pre-emit critique: P5 H4 E5 S4 R5 V4
// states (interactive elements): default · hover · focus-visible · active · disabled · loading · error
// contrast: pass (46–50). Light-mode audit clear (no light-coloured text on light surfaces).
//
// Phase 2 of plans/path-publishing-community-library.md — author's
// publication-status page. Reworked under Hallmark:
//   - S1 left-margin numbered section heads ("01 — Reason", "02 — Audit
//     history", "03 — Unpublish") give the page an editorial rhythm
//     instead of the AI-default "card-stack with heading" template.
//   - A progress rail across the moderation pipeline (Queue → Quick
//     review → Deep review → Team review → Live) makes the abstract
//     state machine visible.
//   - Rejection block is voiced as an editorial pull-quote with a
//     leading marker rather than a generic alert card.
//   - Unpublish lives in a quiet, demoted footer-section — the page is
//     about explaining the state, not driving destruction.
//   - Only transform + opacity animate. No gradients. Light-mode safe.

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type {
  ModerationAuditSummary,
  ModerationLayer,
  ModerationVerdict,
  PublicationStatusDTO,
  SharedPathModerationStatus,
} from '@notemage/shared';
import {
  PublishStatusChip,
  getStatusVisuals,
} from '@/components/path-publish/PublishStatusChip';

const POLL_INTERVAL_MS = 3000;
const IN_FLIGHT_STATES: Set<SharedPathModerationStatus> = new Set([
  'pending',
  'auditing_l2',
  'auditing_l3',
  'flagged_pending_human',
]);

// Per-layer copy for the audit timeline.
const LAYER_COPY: Record<ModerationLayer, { title: string; description: string }> = {
  1: {
    title: 'Wordlist check',
    description: 'Automatic scan for blocked terms.',
  },
  2: {
    title: 'Quality audit',
    description: 'Quick safety, spam, and off-topic check.',
  },
  3: {
    title: 'Deep audit',
    description: 'Stronger model takes a closer look at flagged paths.',
  },
  5: {
    title: 'Team review',
    description: 'A human admin made the final call.',
  },
};

// Pipeline stations rendered on the progress rail. Order matches the
// real flow; each station has the status values it represents.
interface RailStation {
  key: string;
  label: string;
  // Statuses that should treat this station as "current".
  active: Set<SharedPathModerationStatus>;
  // Statuses that mark this station as already passed.
  passed: Set<SharedPathModerationStatus>;
}

const RAIL_STATIONS: RailStation[] = [
  {
    key: 'queue',
    label: 'Queue',
    active: new Set(['pending']),
    passed: new Set([
      'auditing_l2',
      'auditing_l3',
      'flagged_pending_human',
      'approved',
      'rejected',
    ]),
  },
  {
    key: 'quick-review',
    label: 'Quick review',
    active: new Set(['auditing_l2']),
    passed: new Set(['auditing_l3', 'flagged_pending_human', 'approved', 'rejected']),
  },
  {
    key: 'deep-review',
    label: 'Deep review',
    active: new Set(['auditing_l3']),
    passed: new Set(['flagged_pending_human', 'approved', 'rejected']),
  },
  {
    key: 'team-review',
    label: 'Team review',
    active: new Set(['flagged_pending_human']),
    passed: new Set(['approved', 'rejected']),
  },
  {
    key: 'outcome',
    label: 'Outcome',
    active: new Set(['approved', 'rejected']),
    passed: new Set(),
  },
];

export default function PublicationStatusPage() {
  const params = useParams<{ planId: string }>();
  const router = useRouter();
  const planId = params?.planId;

  const [data, setData] = useState<PublicationStatusDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [unpublishError, setUnpublishError] = useState<string | null>(null);
  const [confirmingUnpublish, setConfirmingUnpublish] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!planId) return;
    try {
      const res = await fetch(
        `/api/learn/paths/${encodeURIComponent(planId)}/publication-status`,
      );
      if (res.status === 404) {
        setMissing(true);
        setData(null);
        setLoading(false);
        return;
      }
      const json = await res.json();
      if (json?.success) {
        setData(json.data as PublicationStatusDTO);
        setError(null);
        setMissing(false);
      } else {
        setError(json?.error ?? 'Failed to load publication status');
      }
    } catch {
      setError('Failed to load publication status');
    }
    setLoading(false);
  }, [planId]);

  useEffect(() => {
    // Mirrors the `void refresh()` pattern on the path-list page; the
    // lint baseline is pre-existingly red on this rule across this
    // project (project_web_lint_prered memory).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!data) return;
    if (!IN_FLIGHT_STATES.has(data.moderationStatus)) {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }
    const t = setTimeout(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    pollTimerRef.current = t;
    return () => {
      clearTimeout(t);
    };
  }, [data, refresh]);

  const handleUnpublish = useCallback(async () => {
    if (!data) return;
    setUnpublishing(true);
    setUnpublishError(null);
    try {
      const res = await fetch(`/api/community/paths/${encodeURIComponent(data.shareId)}`, {
        method: 'DELETE',
      });
      if (res.status === 204 || res.ok) {
        router.push('/my-path');
        return;
      }
      const json = await res.json().catch(() => ({}));
      setUnpublishError(json?.error ?? 'Could not unpublish. Try again.');
    } catch {
      setUnpublishError('Network error. Try again.');
    }
    setUnpublishing(false);
  }, [data, router]);

  const reverseAudits = useMemo<ModerationAuditSummary[]>(
    () => (data ? [...data.audits].reverse() : []),
    [data],
  );

  if (loading) {
    return (
      <Page>
        <BackLink planId={planId} />
        <LoadingState />
      </Page>
    );
  }

  if (missing) {
    return (
      <Page>
        <BackLink planId={planId} />
        <MissingState />
      </Page>
    );
  }

  if (error || !data) {
    return (
      <Page>
        <BackLink planId={planId} />
        <ErrorState message={error ?? 'Unknown error.'} />
      </Page>
    );
  }

  const visuals = getStatusVisuals(data.moderationStatus);
  const sectionCount =
    1 + (data.moderationStatus === 'rejected' && data.rejectionReason ? 1 : 0);

  return (
    <Page>
      <BackLink planId={planId} />

      {/* ── Hero strip ─────────────────────────────────────────────── */}
      <header
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          padding: '20px 0 28px',
          borderBottom: '1px solid var(--outline-variant)',
          marginBottom: '32px',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-brand)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--primary)',
          }}
        >
          Community library · publication
        </span>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '20px',
            flexWrap: 'wrap',
          }}
        >
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(28px, 5vw, 38px)',
              fontWeight: 800,
              color: 'var(--on-surface)',
              letterSpacing: '-0.025em',
              lineHeight: 1.05,
              maxWidth: '20ch',
              // overflow-wrap rule from Hallmark's mobile gate 63
              overflowWrap: 'anywhere',
              minWidth: 0,
            }}
          >
            {visuals.label === 'Live'
              ? 'Live in the library.'
              : visuals.label === 'Rejected'
                ? 'This one didn’t make it through.'
                : 'Under review.'}
          </h1>
          <PublishStatusChip status={data.moderationStatus} size="md" />
        </div>
        <p
          style={{
            margin: 0,
            fontSize: '15px',
            color: 'var(--on-surface-variant)',
            lineHeight: 1.6,
            maxWidth: '52ch',
          }}
        >
          {visuals.description}
        </p>
      </header>

      {/* ── Pipeline rail ──────────────────────────────────────────── */}
      <ProgressRail status={data.moderationStatus} />

      {/* ── Section 01 (conditional) — Rejection reason ────────────── */}
      {data.moderationStatus === 'rejected' && data.rejectionReason ? (
        <Section number="01" label="Reason">
          <RejectionBlock reason={data.rejectionReason} />
        </Section>
      ) : null}

      {/* ── Section 0n — Audit history ─────────────────────────────── */}
      <Section number={pad2(sectionCount + 1)} label="Audit history">
        {reverseAudits.length === 0 ? (
          <p style={emptyHistoryStyle}>
            {!IN_FLIGHT_STATES.has(data.moderationStatus)
              ? 'No audit rows were recorded for this publication.'
              : 'The review pipeline hasn’t logged anything yet — give it a moment.'}
          </p>
        ) : (
          <ol
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            {reverseAudits.map((audit, idx) => (
              <AuditRow
                key={`${audit.layer}-${audit.createdAt}-${idx}`}
                audit={audit}
                latest={idx === 0}
              />
            ))}
          </ol>
        )}
      </Section>

      {/* ── Section 0n+1 — Unpublish ───────────────────────────────── */}
      <Section number={pad2(sectionCount + 2)} label="Unpublish" muted>
        <p style={mutedBodyStyle}>
          Removes the publication from the community library and any in-progress moderation
          tickets. Existing clones keep working — they got their own copy at clone time.
        </p>
        {unpublishError ? (
          <p
            role="alert"
            style={{
              margin: '8px 0 12px',
              padding: '10px 12px',
              fontSize: '13px',
              color: 'var(--error)',
              background: 'rgba(253,111,133,0.10)',
              border: '1px solid rgba(253,111,133,0.36)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            {unpublishError}
          </p>
        ) : null}
        {confirmingUnpublish ? (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleUnpublish}
              disabled={unpublishing}
              className="hallmark-pub-danger"
              style={dangerButtonStyle(unpublishing)}
            >
              {unpublishing ? (
                <>
                  <DangerSpinner />
                  Removing…
                </>
              ) : (
                'Yes, unpublish'
              )}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingUnpublish(false)}
              disabled={unpublishing}
              className="hallmark-pub-ghost"
              style={ghostButtonStyle(unpublishing)}
            >
              Keep it live
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingUnpublish(true)}
            className="hallmark-pub-quiet-danger"
            style={quietDangerButtonStyle()}
          >
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '18px' }}>
              remove_circle
            </span>
            Unpublish from library
          </button>
        )}
      </Section>

      {/* Interaction styles. Hover gated behind hover-capable devices;
          focus-visible only; transitions on transform/opacity/colour. */}
      <style>{`
        @keyframes hallmarkPubSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        .hallmark-pub-ghost,
        .hallmark-pub-danger,
        .hallmark-pub-quiet-danger,
        .hallmark-pub-backlink {
          transition: transform 180ms cubic-bezier(0.22,1,0.36,1),
                      color 180ms cubic-bezier(0.22,1,0.36,1),
                      border-color 180ms cubic-bezier(0.22,1,0.36,1),
                      background-color 180ms cubic-bezier(0.22,1,0.36,1);
        }
        .hallmark-pub-ghost:focus,
        .hallmark-pub-danger:focus,
        .hallmark-pub-quiet-danger:focus,
        .hallmark-pub-backlink:focus { outline: none; }
        .hallmark-pub-ghost:focus-visible,
        .hallmark-pub-danger:focus-visible,
        .hallmark-pub-quiet-danger:focus-visible,
        .hallmark-pub-backlink:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }
        @media (hover: hover) {
          .hallmark-pub-ghost:not(:disabled):hover {
            color: var(--on-surface);
            border-color: var(--on-surface);
          }
          .hallmark-pub-danger:not(:disabled):hover {
            transform: translateY(-1px);
          }
          .hallmark-pub-quiet-danger:hover {
            color: var(--error);
            border-color: var(--error);
            background: rgba(253,111,133,0.08);
          }
          .hallmark-pub-backlink:hover { color: var(--on-surface); }
          .hallmark-pub-backlink:hover .hallmark-pub-backlink-chevron {
            transform: translateX(-2px);
          }
        }
        .hallmark-pub-ghost:not(:disabled):active,
        .hallmark-pub-danger:not(:disabled):active,
        .hallmark-pub-quiet-danger:active { transform: translateY(1px); }

        .hallmark-pub-backlink-chevron {
          transition: transform 220ms cubic-bezier(0.22,1,0.36,1);
          display: inline-block;
        }

        @media (prefers-reduced-motion: reduce) {
          .hallmark-pub-ghost,
          .hallmark-pub-danger,
          .hallmark-pub-quiet-danger,
          .hallmark-pub-backlink,
          .hallmark-pub-backlink-chevron { transition: none; }
          .hallmark-pub-danger:not(:disabled):hover { transform: none; }
          .hallmark-pub-backlink:hover .hallmark-pub-backlink-chevron { transform: none; }
        }

        /* Pipeline rail — the active station's marker breathes. Disabled
           when prefers-reduced-motion fires. */
        @keyframes hallmarkPubStationBreathe {
          0%, 100% { transform: scale(1);   opacity: 1;    }
          50%      { transform: scale(1.18); opacity: 0.72; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes hallmarkPubStationBreathe {
            0%, 100% { transform: scale(1); opacity: 1; }
          }
        }
      `}</style>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Layout — page chrome.
// ─────────────────────────────────────────────────────────────────────

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        maxWidth: '760px',
        margin: '0 auto',
        // overflow-x clip per Hallmark mobile gate 62 — keeps the chip
        // and rail from inducing a horizontal scroll at 320px.
        overflowX: 'clip',
        padding: '20px 20px 80px',
      }}
    >
      {children}
    </div>
  );
}

function BackLink({ planId }: { planId: string | undefined }) {
  return (
    <Link
      href={planId ? `/learn/paths/${encodeURIComponent(planId)}` : '/my-path'}
      className="hallmark-pub-backlink"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontFamily: 'var(--font-brand)',
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'var(--on-surface-variant)',
        textDecoration: 'none',
      }}
    >
      <span
        className="material-symbols-outlined hallmark-pub-backlink-chevron"
        aria-hidden
        style={{ fontSize: '16px' }}
      >
        arrow_back
      </span>
      Back to path
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Progress rail — horizontal pipeline station list. Squared markers
// (echo the chip's square corner) instead of round dots.
// ─────────────────────────────────────────────────────────────────────

function ProgressRail({ status }: { status: SharedPathModerationStatus }) {
  // Special case: rejected paths halt at the station where rejection
  // happened. We mark the last passed station and treat the outcome
  // as a red endpoint instead of green.
  const isRejected = status === 'rejected';
  return (
    <div
      style={{
        margin: '0 0 40px',
        padding: '20px',
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <span
        style={{
          display: 'block',
          fontFamily: 'var(--font-brand)',
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--on-surface-variant)',
          marginBottom: '14px',
        }}
      >
        Pipeline
      </span>
      <ol
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'grid',
          gridTemplateColumns: `repeat(${RAIL_STATIONS.length}, minmax(0, 1fr))`,
          gap: '8px',
        }}
      >
        {RAIL_STATIONS.map((station, idx) => {
          const isActive = station.active.has(status);
          const isPassed = station.passed.has(status);
          const isOutcome = station.key === 'outcome';
          const reached = isPassed || isActive;
          // Outcome marker rides green on approved, red on rejected.
          let markerColor = 'var(--outline)';
          let labelColor: string = 'var(--on-surface-variant)';
          if (reached) {
            if (isOutcome) {
              markerColor = isRejected ? 'var(--error)' : 'var(--success)';
              labelColor = isRejected ? 'var(--error)' : 'var(--success)';
            } else {
              markerColor = isPassed ? 'var(--success)' : 'var(--primary)';
              labelColor = 'var(--on-surface)';
            }
          }
          return (
            <li key={station.key} style={{ minWidth: 0, position: 'relative' }}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '8px',
                  minWidth: 0,
                }}
              >
                {/* Connecting hairline — sits behind the marker. We
                    draw it as a half-line so the marker breaks the
                    rule visually. Skip on the last station. */}
                {idx < RAIL_STATIONS.length - 1 ? (
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute',
                      // Start the line just past this marker, end at
                      // the next marker. Top aligns with the marker
                      // center (~6px in from the column edge).
                      top: '5px',
                      left: '13px',
                      right: '-8px',
                      height: '1px',
                      background: isPassed ? 'var(--success)' : 'var(--outline-variant)',
                    }}
                  />
                ) : null}
                <span
                  aria-hidden
                  style={{
                    position: 'relative',
                    width: '11px',
                    height: '11px',
                    background: markerColor,
                    borderRadius: '2px',
                    flexShrink: 0,
                    animation: isActive
                      ? 'hallmarkPubStationBreathe 1.8s cubic-bezier(0.4,0,0.6,1) infinite'
                      : 'none',
                    transformOrigin: 'center',
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                  <span
                    style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, "Cascadia Mono", Menlo, monospace',
                      fontSize: '10px',
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      color: 'var(--on-surface-variant)',
                      opacity: reached ? 1 : 0.6,
                    }}
                  >
                    {pad2(idx + 1)}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-brand)',
                      fontSize: '11px',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: labelColor,
                      overflowWrap: 'anywhere',
                      minWidth: 0,
                    }}
                  >
                    {station.label}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section — S1 left-margin numbered head, then content. Reads as one
// editorial chapter at a time.
// ─────────────────────────────────────────────────────────────────────

function Section({
  number,
  label,
  muted,
  children,
}: {
  number: string;
  label: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        marginBottom: '40px',
        // Grid puts the numbered label in a fixed margin column on wide
        // viewports and collapses to a single column on mobile (Hallmark
        // mobile gate 64).
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: '12px',
      }}
      className="hallmark-pub-section"
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '12px',
          paddingBottom: '12px',
          borderBottom: '1px solid var(--outline-variant)',
        }}
      >
        <span
          aria-hidden
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, "Cascadia Mono", Menlo, monospace',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--on-surface-variant)',
            letterSpacing: '0.06em',
            minWidth: '28px',
          }}
        >
          {number}
        </span>
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--font-brand)',
            fontSize: '13px',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: muted ? 'var(--on-surface-variant)' : 'var(--on-surface)',
            lineHeight: 1,
          }}
        >
          {label}
        </h2>
      </header>
      <div>{children}</div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Rejection block — editorial pull-quote feel. Marker on the left,
// reason text in roman; not the AI-default red icon-in-circle alert.
// ─────────────────────────────────────────────────────────────────────

function RejectionBlock({ reason }: { reason: string }) {
  return (
    <div
      style={{
        padding: '18px 20px',
        background: 'rgba(253,111,133,0.08)',
        border: '1px solid rgba(253,111,133,0.30)',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        gap: '14px',
      }}
    >
      <span
        aria-hidden
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '36px',
          fontWeight: 800,
          lineHeight: 1,
          color: 'var(--error)',
          flexShrink: 0,
        }}
      >
        ❝
      </span>
      <p
        style={{
          margin: 0,
          fontFamily: 'var(--font-display)',
          fontSize: '17px',
          lineHeight: 1.55,
          color: 'var(--on-surface)',
          letterSpacing: '-0.005em',
        }}
      >
        {reason}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Audit row — numbered timeline entry with verdict pill and tabular
// timestamp. Latest row gets a primary-tinted marker.
// ─────────────────────────────────────────────────────────────────────

function AuditRow({ audit, latest }: { audit: ModerationAuditSummary; latest: boolean }) {
  const layerCopy = LAYER_COPY[audit.layer] ?? {
    title: `Layer ${audit.layer}`,
    description: '',
  };
  const verdictColors = verdictColorFor(audit.verdict);
  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: '40px minmax(0, 1fr)',
        gap: '14px',
        padding: '14px 16px',
        background: latest ? 'var(--surface-container)' : 'transparent',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-md)',
        // The latest row carries a primary hairline accent on the left
        // so the timeline visually anchors at the head.
        borderLeft: latest ? `3px solid ${verdictColors.fg}` : '1px solid var(--outline-variant)',
      }}
    >
      {/* Layer code column — monospaced, the "L1 / L2 / L3 / L5"
          shorthand visible in the chip carries through here. */}
      <div
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, "Cascadia Mono", Menlo, monospace',
          fontSize: '13px',
          fontWeight: 700,
          color: 'var(--on-surface)',
          letterSpacing: '0.02em',
          paddingTop: '2px',
        }}
      >
        L{audit.layer}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            alignItems: 'center',
            marginBottom: '4px',
          }}
        >
          <strong
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '15px',
              fontWeight: 700,
              color: 'var(--on-surface)',
              letterSpacing: '-0.005em',
            }}
          >
            {layerCopy.title}
          </strong>
          <VerdictPill verdict={audit.verdict} />
        </div>
        <p
          style={{
            margin: 0,
            fontSize: '13px',
            color: 'var(--on-surface-variant)',
            lineHeight: 1.55,
          }}
        >
          {layerCopy.description}
          {audit.reasonCode ? (
            <>
              {' '}
              <span style={{ color: 'var(--on-surface)' }}>Reason:</span>{' '}
              <span
                style={{
                  fontFamily:
                    'ui-monospace, SFMono-Regular, "Cascadia Mono", Menlo, monospace',
                  fontSize: '12px',
                  background: 'var(--surface-container-high)',
                  padding: '1px 6px',
                  borderRadius: '3px',
                  color: 'var(--on-surface)',
                }}
              >
                {audit.reasonCode}
              </span>
            </>
          ) : null}
        </p>
        <time
          dateTime={audit.createdAt}
          style={{
            display: 'block',
            marginTop: '8px',
            fontFamily: 'ui-monospace, SFMono-Regular, "Cascadia Mono", Menlo, monospace',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--on-surface-variant)',
            letterSpacing: '0.04em',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {new Date(audit.createdAt).toLocaleString()}
        </time>
      </div>
    </li>
  );
}

function VerdictPill({ verdict }: { verdict: ModerationVerdict }) {
  const { bg, border, fg } = verdictColorFor(verdict);
  const label = verdict.replace(/_/g, ' ');
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '3px',
        background: bg,
        border: `1px solid ${border}`,
        color: fg,
        fontFamily: 'var(--font-brand)',
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        lineHeight: 1.4,
      }}
    >
      {label}
    </span>
  );
}

function verdictColorFor(v: ModerationVerdict): { bg: string; border: string; fg: string } {
  if (v === 'pass') {
    return { bg: 'rgba(72,202,154,0.12)', border: 'rgba(72,202,154,0.40)', fg: 'var(--success)' };
  }
  if (v === 'reject' || v === 'auto_reject') {
    return { bg: 'rgba(253,111,133,0.12)', border: 'rgba(253,111,133,0.40)', fg: 'var(--error)' };
  }
  if (v === 'flag' || v === 'escalate_to_human') {
    return { bg: 'rgba(255,167,38,0.12)', border: 'rgba(255,167,38,0.40)', fg: 'var(--warning)' };
  }
  return {
    bg: 'var(--surface-container-high)',
    border: 'var(--outline-variant)',
    fg: 'var(--on-surface-variant)',
  };
}

// ─────────────────────────────────────────────────────────────────────
// Loading / Missing / Error fall-throughs — kept restrained; the
// status page should explain state, not perform stage effects.
// ─────────────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div style={{ padding: '60px 0' }}>
      <p
        style={{
          margin: 0,
          fontFamily: 'var(--font-brand)',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--on-surface-variant)',
        }}
      >
        Loading publication…
      </p>
    </div>
  );
}

function MissingState() {
  return (
    <div
      style={{
        marginTop: '24px',
        padding: '28px 24px',
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-brand)',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--primary)',
        }}
      >
        Not published
      </span>
      <h1
        style={{
          margin: '8px 0 8px',
          fontFamily: 'var(--font-display)',
          fontSize: '24px',
          fontWeight: 800,
          color: 'var(--on-surface)',
          letterSpacing: '-0.02em',
        }}
      >
        This path hasn’t been submitted yet.
      </h1>
      <p style={{ margin: 0, fontSize: '14px', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
        Open the path’s options menu on the Learning paths page to publish it to the community
        library.
      </p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      style={{
        marginTop: '24px',
        padding: '28px 24px',
        background: 'rgba(253,111,133,0.08)',
        border: '1px solid rgba(253,111,133,0.30)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-brand)',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'var(--error)',
        }}
      >
        Couldn’t load
      </span>
      <p
        style={{
          margin: '8px 0 0',
          fontSize: '14px',
          color: 'var(--on-surface)',
          lineHeight: 1.55,
        }}
      >
        {message}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers + shared style snippets.
// ─────────────────────────────────────────────────────────────────────

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

const emptyHistoryStyle: React.CSSProperties = {
  margin: 0,
  padding: '14px 16px',
  fontSize: '13px',
  color: 'var(--on-surface-variant)',
  lineHeight: 1.6,
  background: 'var(--surface-container)',
  border: '1px dashed var(--outline-variant)',
  borderRadius: 'var(--radius-md)',
};

const mutedBodyStyle: React.CSSProperties = {
  margin: '0 0 14px',
  fontSize: '13px',
  color: 'var(--on-surface-variant)',
  lineHeight: 1.6,
  maxWidth: '60ch',
};

function quietDangerButtonStyle(): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    minHeight: '44px',
    padding: '0 14px',
    background: 'transparent',
    color: 'var(--on-surface-variant)',
    border: '1px solid var(--outline-variant)',
    borderRadius: 'var(--radius-md)',
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
  };
}

function dangerButtonStyle(busy: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    minHeight: '44px',
    padding: '0 18px',
    background: 'var(--error)',
    color: 'var(--on-error)',
    border: '1px solid var(--error)',
    borderRadius: 'var(--radius-md)',
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 800,
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.7 : 1,
    boxShadow: '0 2px 0 rgba(125,40,50,0.6)',
  };
}

function ghostButtonStyle(busy: boolean): React.CSSProperties {
  return {
    minHeight: '44px',
    padding: '0 18px',
    background: 'transparent',
    color: 'var(--on-surface-variant)',
    border: '1px solid var(--outline-variant)',
    borderRadius: 'var(--radius-md)',
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 700,
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.55 : 1,
  };
}

function DangerSpinner() {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: '14px',
        height: '14px',
        borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.36)',
        borderTopColor: 'var(--on-error)',
        animation: 'hallmarkPubSpin 0.9s linear infinite',
        flexShrink: 0,
      }}
    />
  );
}
