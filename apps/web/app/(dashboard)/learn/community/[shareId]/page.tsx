'use client';

// Phase 8 of plans/path-publishing-community-library.md — community
// path detail / preview surface. Sister to /learn/community (list).
//
// What this page renders (per AC-Browse-6):
//   - Hero: title, author, subjects/language pills, social signals
//     (clones / views / rating).
//   - Structure preview: phase + checkpoint titles only — no theory /
//     flashcards / quiz content. Full content lands behind clone (P9)
//     or translate-then-view (P10).
//   - Clone CTA: live in P9 — calls POST /api/community/paths/[shareId]/
//     clone, routes the user to /learn/paths/[planId] on success. The
//     CTA flips to "Open your copy" when `userClonePlanId` is set so a
//     re-visit lands the user back on their existing clone.
//
// What this page does NOT do (deferred to later phases):
//   - Rate the path. POST /api/community/paths/[shareId]/rating is
//     post-P8 (the GET detail endpoint exposes the requester's existing
//     rating so the UI can display it, but a rating editor is post-P8).
//   - Translate the path. GET /api/community/paths/[shareId]?lang=… is
//     P10; the UI offers a language switcher placeholder that says so.

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SUBJECT_REGISTRY, isSubjectId, type SubjectId } from '@/lib/path-subjects';

interface PhasePreview {
  id: string;
  title: string;
  sortOrder: number;
  slots: SlotPreview[];
}

interface SlotPreview {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  sortOrder: number;
}

interface DetailResponse {
  source: {
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
    createdAt: string;
    author: { id: string; username: string | null; avatarUrl: string | null };
    phases: PhasePreview[];
  };
  userRating: number | null;
  userClonePlanId: string | null;
}

const SLOT_KIND_LABEL: Record<string, { label: string; icon: string }> = {
  learning: { label: 'Learning', icon: 'school' },
  review: { label: 'Review', icon: 'replay' },
  assessment: { label: 'Assessment', icon: 'quiz' },
};

export default function CommunityPathDetailPage() {
  const params = useParams<{ shareId: string }>();
  const router = useRouter();
  const shareId = params?.shareId;

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!shareId) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const res = await fetch(`/api/community/paths/${encodeURIComponent(shareId)}`);
      if (res.status === 404) {
        setNotFound(true);
        setData(null);
        return;
      }
      const json = await res.json();
      if (json?.success) {
        setData(json.data as DetailResponse);
      } else {
        setError(json?.error ?? 'Could not load this path.');
        setData(null);
      }
    } catch {
      setError('Network error. Try again.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [shareId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div style={{ maxWidth: '880px', margin: '0 auto', padding: '24px 16px 64px' }}>
      <nav style={{ marginBottom: '20px' }}>
        <button
          type="button"
          onClick={() => router.push('/learn/community')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            background: 'transparent',
            border: 'none',
            color: 'var(--on-surface-variant)',
            fontFamily: 'inherit',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '18px' }}>
            arrow_back
          </span>
          Back to library
        </button>
      </nav>

      {loading && !data ? (
        <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px' }}>Loading path…</p>
      ) : notFound ? (
        <NotFoundPanel />
      ) : error ? (
        <ErrorPanel error={error} onRetry={() => void load()} />
      ) : data ? (
        <DetailContent data={data} />
      ) : null}

      <style>{`
        .community-detail-cta:focus-visible {
          outline: 3px solid var(--primary);
          outline-offset: 2px;
        }
        .community-detail-cta--primary:not(:disabled):hover {
          background: var(--primary-dim, var(--primary));
        }
        .community-detail-cta:not(:disabled):active {
          transform: translateY(1px);
        }
        .community-detail-cta__spinner {
          animation: community-detail-spin 1s linear infinite;
          transform-origin: center;
        }
        @keyframes community-detail-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .community-detail-slot {
          transition: background-color 0.18s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .community-detail-slot:hover {
          background-color: var(--surface-container-high);
        }
        @media (prefers-reduced-motion: reduce) {
          .community-detail-slot { transition: none; }
          .community-detail-cta__spinner { animation: none; }
        }
      `}</style>
    </div>
  );
}

function DetailContent({ data }: { data: DetailResponse }) {
  const { source, userClonePlanId } = data;
  const subjectId = useMemo<SubjectId | null>(() => {
    const found = source.subjects.find((s) => isSubjectId(s));
    return found ? (found as SubjectId) : null;
  }, [source.subjects]);
  const subjectDef = subjectId ? SUBJECT_REGISTRY[subjectId] : null;
  const ratingDisplay =
    source.ratingAverage !== null && source.ratingCount > 0
      ? source.ratingAverage.toFixed(1)
      : null;

  return (
    <article style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <header
        style={{
          background: 'var(--surface-container)',
          border: '1px solid var(--outline-variant)',
          borderRadius: 'var(--radius-xl)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {subjectDef ? (
            <Pill icon={subjectDef.icon} label={subjectDef.shortLabel} />
          ) : null}
          <Pill icon="translate" label={source.language.toUpperCase()} />
          {source.seeded ? <Pill icon="verified" label="Curated by NoteMage" accent /> : null}
        </div>

        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: '32px',
            fontWeight: 800,
            color: 'var(--on-surface)',
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
            overflowWrap: 'anywhere',
          }}
        >
          {source.title}
        </h1>

        <p
          style={{
            margin: 0,
            fontSize: '13px',
            color: 'var(--on-surface-variant)',
          }}
        >
          Shared by{' '}
          {source.author.username ? (
            <Link
              href={`/profile/${encodeURIComponent(source.author.username)}`}
              style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 700 }}
            >
              @{source.author.username}
            </Link>
          ) : (
            <span style={{ color: 'var(--on-surface)', fontWeight: 700 }}>unknown author</span>
          )}
        </p>

        {source.description ? (
          <p
            style={{
              margin: 0,
              fontSize: '15px',
              color: 'var(--on-surface)',
              lineHeight: 1.6,
              overflowWrap: 'anywhere',
            }}
          >
            {source.description}
          </p>
        ) : null}

        <dl
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(140px, 100%), 1fr))',
            gap: '12px',
            margin: 0,
            paddingTop: '8px',
            borderTop: '1px solid var(--outline-variant)',
          }}
        >
          <StatTile icon="layers" label="Phases" value={String(source.phaseCount)} />
          <StatTile icon="route" label="Checkpoints" value={String(source.slotCount)} />
          <StatTile
            icon="download"
            label="Studying this"
            value={String(source.downloadCount)}
          />
          {ratingDisplay ? (
            <StatTile
              icon="star"
              label={`Rating · ${source.ratingCount} ${source.ratingCount === 1 ? 'rater' : 'raters'}`}
              value={ratingDisplay}
            />
          ) : (
            <StatTile icon="visibility" label="Views" value={String(source.viewCount)} />
          )}
        </dl>

        <CloneCTA shareId={source.shareId} userClonePlanId={userClonePlanId} />
      </header>

      <section
        style={{
          background: 'var(--surface-container)',
          border: '1px solid var(--outline-variant)',
          borderRadius: 'var(--radius-xl)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: '20px',
              fontWeight: 800,
              color: 'var(--on-surface)',
              letterSpacing: '-0.01em',
            }}
          >
            Path structure
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: '12px',
              color: 'var(--on-surface-variant)',
              maxWidth: '320px',
              lineHeight: 1.5,
            }}
          >
            Phase + checkpoint titles only. Theory, flashcards and quizzes
            unlock when you clone this path.
          </p>
        </div>

        <ol
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {source.phases.map((phase, idx) => (
            <PhasePreviewCard key={phase.id} phase={phase} index={idx} />
          ))}
        </ol>
      </section>
    </article>
  );
}

function CloneCTA({
  shareId,
  userClonePlanId,
}: {
  shareId: string;
  userClonePlanId: string | null;
}) {
  // P9 ships the working endpoint — clicking the button POSTs to
  // /api/community/paths/[shareId]/clone, then redirects to
  // /learn/paths/[planId]. Re-visiting after cloning surfaces the
  // "Open your copy" link instead so the user lands directly in their
  // private path. The endpoint is idempotent per (userId, shareId), so
  // a double-click or a back-then-clone-again is still safe — but we
  // local-disable during the in-flight request to keep the UX honest.
  const router = useRouter();
  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);

  const onClone = useCallback(async () => {
    if (cloning) return;
    setCloning(true);
    setCloneError(null);
    try {
      const res = await fetch(
        `/api/community/paths/${encodeURIComponent(shareId)}/clone`,
        { method: 'POST' },
      );
      if (res.status === 404) {
        setCloneError(
          'This path is no longer available. It may have been unpublished.',
        );
        return;
      }
      if (res.status === 409) {
        setCloneError('Cloning is busy — try again in a moment.');
        return;
      }
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; data?: { planId?: string }; error?: string }
        | null;
      if (!res.ok || !json?.success || !json.data?.planId) {
        setCloneError(json?.error ?? 'Could not clone this path. Try again.');
        return;
      }
      // Whether this was the first clone or an idempotent retry, the
      // destination is the same — the cloner's private plan view.
      router.push(`/learn/paths/${encodeURIComponent(json.data.planId)}`);
    } catch {
      setCloneError('Network error. Try again.');
    } finally {
      setCloning(false);
    }
  }, [cloning, router, shareId]);

  if (userClonePlanId) {
    return (
      <Link
        href={`/learn/paths/${encodeURIComponent(userClonePlanId)}`}
        className="community-detail-cta community-detail-cta--primary"
        style={{
          alignSelf: 'flex-start',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 20px',
          background: 'var(--primary)',
          color: 'var(--on-primary)',
          borderRadius: 'var(--radius-md)',
          textDecoration: 'none',
          fontFamily: 'inherit',
          fontSize: '15px',
          fontWeight: 700,
          boxShadow: '0 2px 0 var(--primary-container, var(--outline))',
        }}
      >
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '20px' }}>
          play_arrow
        </span>
        Open your copy
      </Link>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        alignSelf: 'flex-start',
      }}
    >
      <button
        type="button"
        onClick={() => void onClone()}
        disabled={cloning}
        aria-busy={cloning}
        aria-disabled={cloning}
        className="community-detail-cta community-detail-cta--primary"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 20px',
          background: cloning ? 'var(--surface-container-high)' : 'var(--primary)',
          color: cloning ? 'var(--on-surface-variant)' : 'var(--on-primary)',
          border: cloning ? '1px solid var(--outline-variant)' : 'none',
          borderRadius: 'var(--radius-md)',
          fontFamily: 'inherit',
          fontSize: '15px',
          fontWeight: 700,
          cursor: cloning ? 'progress' : 'pointer',
          boxShadow: cloning
            ? 'none'
            : '0 2px 0 var(--primary-container, var(--outline))',
        }}
      >
        <span
          className={`material-symbols-outlined${cloning ? ' community-detail-cta__spinner' : ''}`}
          aria-hidden
          style={{ fontSize: '20px' }}
        >
          {cloning ? 'progress_activity' : 'download'}
        </span>
        {cloning ? 'Cloning…' : 'Clone to your library'}
      </button>
      <p
        style={{
          margin: 0,
          fontSize: '12px',
          color: 'var(--on-surface-variant)',
          maxWidth: '360px',
          lineHeight: 1.5,
        }}
      >
        Creates a private copy in your library. Progress, streaks, and
        completion all start fresh.
      </p>
      {cloneError ? (
        <p
          role="alert"
          style={{
            margin: '4px 0 0',
            fontSize: '12px',
            color: 'var(--error)',
            maxWidth: '360px',
            lineHeight: 1.5,
            fontWeight: 600,
          }}
        >
          {cloneError}
        </p>
      ) : null}
    </div>
  );
}

function PhasePreviewCard({ phase, index }: { phase: PhasePreview; index: number }) {
  return (
    <li
      style={{
        background: 'var(--surface-container-low)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--primary)',
            color: 'var(--on-primary)',
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: '13px',
            flexShrink: 0,
          }}
        >
          {index + 1}
        </span>
        <h3
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: '16px',
            fontWeight: 700,
            color: 'var(--on-surface)',
            letterSpacing: '-0.01em',
            overflowWrap: 'anywhere',
            minWidth: 0,
          }}
        >
          {phase.title}
        </h3>
      </div>
      <ol
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        {phase.slots.map((slot) => (
          <SlotPreviewRow key={slot.id} slot={slot} />
        ))}
        {phase.slots.length === 0 ? (
          <li style={{ fontSize: '13px', color: 'var(--on-surface-variant)' }}>
            No checkpoints in this phase yet.
          </li>
        ) : null}
      </ol>
    </li>
  );
}

function SlotPreviewRow({ slot }: { slot: SlotPreview }) {
  const meta = SLOT_KIND_LABEL[slot.kind] ?? { label: slot.kind, icon: 'check_circle' };
  return (
    <li
      className="community-detail-slot"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 12px',
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-md)',
        minWidth: 0,
      }}
    >
      <span
        className="material-symbols-outlined"
        aria-hidden
        style={{ fontSize: '20px', color: 'var(--on-surface-variant)', flexShrink: 0 }}
      >
        {meta.icon}
      </span>
      <span
        style={{
          flex: 1,
          fontSize: '14px',
          fontWeight: 600,
          color: 'var(--on-surface)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}
      >
        {slot.title}
      </span>
      <span
        style={{
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--on-surface-variant)',
          flexShrink: 0,
        }}
      >
        {meta.label}
      </span>
    </li>
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
        padding: '4px 10px',
        borderRadius: '999px',
        background: accent ? 'rgba(174,137,255,0.12)' : 'var(--surface-container-high)',
        border: `1px solid ${accent ? 'rgba(174,137,255,0.32)' : 'var(--outline-variant)'}`,
        color: accent ? 'var(--primary)' : 'var(--on-surface-variant)',
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    >
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '13px' }}>
        {icon}
      </span>
      {label}
    </span>
  );
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        padding: '6px 0',
        minWidth: 0,
      }}
    >
      <dt
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--on-surface-variant)',
          margin: 0,
        }}
      >
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '14px' }}>
          {icon}
        </span>
        {label}
      </dt>
      <dd
        style={{
          margin: 0,
          fontFamily: 'var(--font-display)',
          fontSize: '22px',
          fontWeight: 800,
          color: 'var(--on-surface)',
          letterSpacing: '-0.01em',
          fontVariantNumeric: 'tabular-nums',
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </dd>
    </div>
  );
}

function NotFoundPanel() {
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
        search_off
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
        Path not found
      </h2>
      <p style={{ margin: '0 0 16px', fontSize: '14px', color: 'var(--on-surface-variant)' }}>
        This path may have been unpublished or it never finished moderation.
      </p>
      <Link
        href="/learn/community"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '10px 16px',
          background: 'var(--surface-container-high)',
          color: 'var(--on-surface)',
          border: '1px solid var(--outline-variant)',
          borderRadius: 'var(--radius-md)',
          fontSize: '14px',
          fontWeight: 700,
          textDecoration: 'none',
        }}
      >
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '18px' }}>
          arrow_back
        </span>
        Back to library
      </Link>
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
        padding: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', minWidth: 0 }}>
        <span
          className="material-symbols-outlined"
          aria-hidden
          style={{ color: 'var(--error)', fontSize: '22px' }}
        >
          error
        </span>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--on-surface)' }}>{error}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        style={{
          padding: '8px 16px',
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
