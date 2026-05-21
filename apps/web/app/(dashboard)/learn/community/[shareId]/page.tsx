'use client';

// Phase 8 of plans/path-publishing-community-library.md — community
// path detail / preview surface. Sister to /learn/community (list).
// Phase 10 of the same plan — language picker chip rail + translated
// overlay when `?lang=` is requested.
//
// What this page renders (per AC-Browse-6):
//   - Hero: title, author, subjects/language pills, social signals
//     (clones / views / rating). Title + description + structure-
//     preview titles are swapped to the translated overlay whenever a
//     non-source language is selected.
//   - Structure preview: phase + checkpoint titles only — no theory /
//     flashcards / quiz content. Full content lands behind clone (P9).
//   - Language picker chip rail: P10 inline switcher; popular set
//     (de/en/fr/es/it/tr) plus the source language if not in the set.
//     Clicking a non-source chip fires GET ?lang=X and polls if the
//     translation lands in `translating` status (single-flight cache
//     populates while we wait). 402 / 429 / failed surface inline.
//   - Clone CTA: P9 — calls POST /api/community/paths/[shareId]/clone,
//     routes the user to /learn/paths/[planId] on success.

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { SUBJECT_REGISTRY, isSubjectId, type SubjectId } from '@/lib/path-subjects';
import {
  REPORT_REASONS,
  REPORT_REASON_LABELS,
  REPORT_DETAIL_MAX_CHARS,
} from '@/lib/moderation/layer4';

// Popular-language set from P0 spec §6 — the languages we keep daily-
// budget headroom for and that get pre-baked on popular paths. The rail
// shows these six plus the source language if it isn't already in the
// set (e.g. a `pt-br` source path adds a 7th chip).
const POPULAR_LANGUAGES = ['de', 'en', 'fr', 'es', 'it', 'tr'] as const;

// Polling cadence for an in-flight translation. The runner is bounded
// at ~30s on the server side so the worst case is ≈15 polls before the
// row flips to `ready` or `failed`.
const TRANSLATION_POLL_INTERVAL_MS = 2_000;

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

interface TranslationPayload {
  title: string;
  description: string | null;
  phases: Array<{
    id: string;
    title: string;
    description: string | null;
    slots: Array<{ id: string; title: string; description: string | null }>;
  }>;
}

type TranslationEnvelope =
  | { status: 'ready'; language: string; payload: TranslationPayload; cachedAt: string }
  | { status: 'translating'; language: string }
  | { status: 'failed'; language: string; error: string };

interface DetailResponse {
  shareId: string;
  /** The language the response was served in. Equals source.language for
   *  source-language requests; equals the requested `?lang=` for ready
   *  cache hits; equals the source on `translating` / `failed`
   *  responses (the UI still renders source while the overlay loads). */
  language: string;
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
  /** Translation envelope — null when the request was for source
   *  language. Carries the translated overlay on `ready`, a polling
   *  hint on `translating`, or the failure reason on `failed`. */
  translation: TranslationEnvelope | null;
  userRating: number | null;
  userClonePlanId: string | null;
}

/**
 * Per-request error from the translation endpoint that the picker
 * surfaces inline (separate from a "couldn't load the path at all"
 * error). 402 / 429 / `failed` envelope all land here.
 */
interface TranslationUiError {
  /** Human copy to show in the inline alert. */
  message: string;
  /** When true, the chip rail offers an "Upgrade" CTA instead of a
   *  retry button — used for the FREE-lifetime-exhausted 402 branch. */
  upgrade?: boolean;
  /** When true, the chip rail offers a "Try again" button — used for
   *  rate-limit 429 and `failed` envelope retries. */
  retry?: boolean;
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

  // The chip the user clicked — set the instant a request fires so the
  // rail can highlight it as pending. Cleared on terminal response.
  const [pendingLanguage, setPendingLanguage] = useState<string | null>(null);
  // Inline translation-specific error (separate from `error` which is a
  // "couldn't load the whole path" failure mode). 402 / 429 / `failed`
  // envelope all land here so the rest of the page stays mounted.
  const [translationError, setTranslationError] = useState<TranslationUiError | null>(null);

  // Polling guard — each call to `load` bumps this; stale polls (e.g.
  // the user switched language during a translating-status retry) check
  // their captured epoch against the ref and bail without setState.
  const requestEpochRef = useRef(0);
  // Track an in-flight poll timer so we can clear it on the next click.
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const load = useCallback(
    async (lang: string | null | undefined, opts?: { silent?: boolean }) => {
      if (!shareId) return;
      cancelPoll();
      const epoch = ++requestEpochRef.current;
      if (!opts?.silent) {
        setLoading(true);
        setError(null);
        setNotFound(false);
      }
      try {
        const qs = lang ? `?lang=${encodeURIComponent(lang)}` : '';
        const res = await fetch(
          `/api/community/paths/${encodeURIComponent(shareId)}${qs}`,
        );
        if (epoch !== requestEpochRef.current) return; // stale

        // Translation-specific status codes land outside the normal
        // `success: true` envelope. The body still carries `error` (and,
        // for 402, `upgrade: true`).
        if (res.status === 402) {
          const json = await res.json().catch(() => null);
          setTranslationError({
            message:
              json?.error ??
              `You've used your free translations. Upgrade to Pro to translate more paths.`,
            upgrade: true,
          });
          setPendingLanguage(null);
          if (!opts?.silent) setLoading(false);
          return;
        }
        if (res.status === 429) {
          const json = await res.json().catch(() => null);
          setTranslationError({
            message: json?.error ?? `Try again in a minute.`,
            retry: true,
          });
          setPendingLanguage(null);
          if (!opts?.silent) setLoading(false);
          return;
        }
        if (res.status === 400) {
          const json = await res.json().catch(() => null);
          setTranslationError({
            message: json?.error ?? `Invalid language.`,
            retry: false,
          });
          setPendingLanguage(null);
          if (!opts?.silent) setLoading(false);
          return;
        }
        if (res.status === 404) {
          setNotFound(true);
          setData(null);
          setPendingLanguage(null);
          return;
        }
        const json = await res.json().catch(() => null);
        if (epoch !== requestEpochRef.current) return; // stale
        if (!json?.success) {
          setError(json?.error ?? 'Could not load this path.');
          setData(null);
          setPendingLanguage(null);
          return;
        }
        const payload = json.data as DetailResponse;
        setData(payload);

        // Branch on the translation envelope. `ready` → swap view to
        // translation, clear pending + error. `translating` → keep the
        // pending highlight and schedule a re-poll. `failed` → surface
        // the failure inline, clear pending. Null envelope (source-lang
        // request) → just clear pending.
        if (payload.translation?.status === 'ready') {
          setPendingLanguage(null);
          setTranslationError(null);
        } else if (payload.translation?.status === 'translating') {
          // Keep pendingLanguage as-is (the chip stays in loading
          // state) — re-poll in a couple of seconds.
          pollTimerRef.current = setTimeout(() => {
            void load(lang ?? null, { silent: true });
          }, TRANSLATION_POLL_INTERVAL_MS);
        } else if (payload.translation?.status === 'failed') {
          setPendingLanguage(null);
          setTranslationError({
            message: `Couldn't translate this path: ${payload.translation.error}`,
            retry: true,
          });
        } else {
          // Source-language request — no translation envelope expected.
          setPendingLanguage(null);
          setTranslationError(null);
        }
      } catch {
        if (epoch !== requestEpochRef.current) return; // stale
        setError('Network error. Try again.');
        setData(null);
        setPendingLanguage(null);
      } finally {
        if (epoch === requestEpochRef.current && !opts?.silent) {
          setLoading(false);
        }
      }
    },
    [shareId, cancelPoll],
  );

  // Initial load — source language. Subsequent language clicks re-use
  // the same loader with a `lang` parameter.
  useEffect(() => {
    void load(null);
  }, [load]);

  // Tear down any pending poll timer on unmount so we don't setState on
  // an unmounted tree if the user clicks away mid-translation.
  useEffect(() => {
    return () => {
      cancelPoll();
    };
  }, [cancelPoll]);

  const onSelectLanguage = useCallback(
    (lang: string) => {
      if (!data) return;
      // Clicking the currently-displayed language is a no-op — avoids
      // burning a rate-limit token on a redundant fetch.
      if (lang === data.language) return;
      const isSource = lang === data.source.language;
      setPendingLanguage(lang);
      setTranslationError(null);
      // Source-lang click → fetch without `?lang=` so the server
      // short-circuits and we don't end up routed through the
      // translation gates accidentally.
      void load(isSource ? null : lang);
    },
    [data, load],
  );

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
        <ErrorPanel error={error} onRetry={() => void load(null)} />
      ) : data ? (
        <DetailContent
          data={data}
          pendingLanguage={pendingLanguage}
          translationError={translationError}
          onSelectLanguage={onSelectLanguage}
        />
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
        /* P11 admin pre-translate — secondary outline variant. Default,
           hover, and disabled live here; :focus-visible + :active + the
           spinner are inherited from .community-detail-cta above, so the
           full 8-state contract is shared with the primary CTA. */
        .community-detail-cta--admin {
          background: var(--surface-container-high);
          color: var(--on-surface);
          border: 1px solid var(--outline-variant);
        }
        .community-detail-cta--admin:not(:disabled):hover {
          background: var(--surface-container-highest);
        }
        .community-detail-cta--admin:disabled {
          opacity: 0.5;
          cursor: not-allowed;
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

        /* Hallmark · component: language-picker · genre: editorial · theme: inherit (NoteMage tokens)
         * states: default · hover · focus · active · disabled · loading · error · success
         * contrast: pass (46–50)
         * pre-emit critique: P5 H4 E5 S4 R5 V4
         */
        .community-lang-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          background: var(--surface-container-high);
          border: 1px solid var(--outline-variant);
          color: var(--on-surface);
          border-radius: var(--radius-full);
          font-family: inherit;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .community-lang-chip:not(:disabled):hover {
          background: var(--surface-container-highest);
        }
        .community-lang-chip:focus-visible {
          outline: 3px solid var(--primary);
          outline-offset: 2px;
        }
        .community-lang-chip:not(:disabled):active {
          transform: translateY(1px);
        }
        .community-lang-chip[aria-pressed="true"] {
          background: var(--primary);
          color: var(--on-primary);
          border-color: var(--primary);
        }
        .community-lang-chip[aria-pressed="true"]:not(:disabled):hover {
          background: var(--primary-dim, var(--primary));
        }
        .community-lang-chip[aria-busy="true"] {
          /* loading state — chip stays clickable visually but cursor
             flips to progress. The icon swap to progress_activity is
             what carries the actual "loading" signal. */
          cursor: progress;
        }
        .community-lang-chip:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .community-lang-chip__spinner {
          animation: community-detail-spin 1s linear infinite;
          transform-origin: center;
        }

        /* P13 report affordance — full 8-state contract. Colour/border
           shifts are instant (transform/opacity-only animation rule);
           the only animated property is the loading spinner's rotate. */
        .community-report-trigger:not(:disabled):hover {
          background: var(--surface-container-high);
          color: var(--on-surface);
        }
        .community-report-trigger:focus-visible,
        .community-report-cancel:focus-visible,
        .community-report-submit:focus-visible {
          outline: 3px solid var(--primary);
          outline-offset: 2px;
        }
        .community-report-trigger:not(:disabled):active,
        .community-report-cancel:not(:disabled):active,
        .community-report-submit:not(:disabled):active {
          transform: translateY(1px);
        }
        .community-report-option:hover {
          border-color: var(--outline);
        }
        .community-report-option:focus-within {
          outline: 2px solid var(--primary);
          outline-offset: 1px;
        }
        .community-report-cancel:not(:disabled):hover {
          background: var(--surface-container-high);
          color: var(--on-surface);
        }
        .community-report-submit:not(:disabled):hover {
          background: var(--primary-dim, var(--primary));
        }
        .community-report-detail:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 1px;
          border-color: var(--primary);
        }
        .community-report-submit__spinner {
          animation: community-detail-spin 1s linear infinite;
          transform-origin: center;
        }

        @media (prefers-reduced-motion: reduce) {
          .community-detail-slot { transition: none; }
          .community-detail-cta__spinner { animation: none; }
          .community-lang-chip__spinner { animation: none; }
          .community-report-submit__spinner { animation: none; }
        }
      `}</style>
    </div>
  );
}

function DetailContent({
  data,
  pendingLanguage,
  translationError,
  onSelectLanguage,
}: {
  data: DetailResponse;
  pendingLanguage: string | null;
  translationError: TranslationUiError | null;
  onSelectLanguage: (lang: string) => void;
}) {
  const { source, userClonePlanId, translation } = data;
  const subjectId = useMemo<SubjectId | null>(() => {
    const found = source.subjects.find((s) => isSubjectId(s));
    return found ? (found as SubjectId) : null;
  }, [source.subjects]);
  const subjectDef = subjectId ? SUBJECT_REGISTRY[subjectId] : null;
  const ratingDisplay =
    source.ratingAverage !== null && source.ratingCount > 0
      ? source.ratingAverage.toFixed(1)
      : null;

  // Translation overlay — when `translation.status === 'ready'` we
  // swap the user-visible strings (title, description, phase titles,
  // slot titles + descriptions). Everything structural (IDs, sort
  // order, slot kinds) stays on the source. Phase / slot lookups go
  // through Maps keyed on source IDs because the runner re-keys the
  // overlay by source-id (drift safety — see prompt.ts §
  // projectTranslationOnto).
  const overlayPhases = useMemo(() => {
    if (translation?.status !== 'ready') return null;
    const map = new Map<string, TranslationPayload['phases'][number]>();
    for (const p of translation.payload.phases) map.set(p.id, p);
    return map;
  }, [translation]);

  const displayTitle =
    translation?.status === 'ready' ? translation.payload.title : source.title;
  const displayDescription =
    translation?.status === 'ready'
      ? translation.payload.description
      : source.description;

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
          <Pill icon="translate" label={data.language.toUpperCase()} />
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
          {displayTitle}
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

        {displayDescription ? (
          <p
            style={{
              margin: 0,
              fontSize: '15px',
              color: 'var(--on-surface)',
              lineHeight: 1.6,
              overflowWrap: 'anywhere',
            }}
          >
            {displayDescription}
          </p>
        ) : null}

        <LanguagePicker
          sourceLanguage={source.language}
          currentLanguage={data.language}
          pendingLanguage={pendingLanguage}
          translation={translation}
          translationError={translationError}
          onSelect={onSelectLanguage}
        />

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

        <AdminPretranslate shareId={source.shareId} />

        <ReportControl shareId={source.shareId} authorId={source.author.id} />
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
            <PhasePreviewCard
              key={phase.id}
              phase={phase}
              index={idx}
              overlay={overlayPhases?.get(phase.id) ?? null}
            />
          ))}
        </ol>
      </section>
    </article>
  );
}

function LanguagePicker({
  sourceLanguage,
  currentLanguage,
  pendingLanguage,
  translation,
  translationError,
  onSelect,
}: {
  sourceLanguage: string;
  currentLanguage: string;
  pendingLanguage: string | null;
  translation: TranslationEnvelope | null;
  translationError: TranslationUiError | null;
  onSelect: (lang: string) => void;
}) {
  // Popular set + source language, deduped. The source chip is always
  // present so the user can flip back to it even when the source isn't
  // in the popular set (e.g. a Polish path on a UI that doesn't pre-
  // bake Polish — `pl` is added to the rail).
  const languages = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const lang of [...POPULAR_LANGUAGES, sourceLanguage]) {
      if (!seen.has(lang)) {
        seen.add(lang);
        out.push(lang);
      }
    }
    return out;
  }, [sourceLanguage]);

  // A click is in flight whenever EITHER (a) we have a pending chip
  // selection OR (b) the server told us the row is still translating
  // (pending may already be cleared by then, but the row is still
  // populating so we should keep the rail disabled to avoid stacking
  // requests).
  const requestInFlight =
    pendingLanguage !== null || translation?.status === 'translating';

  return (
    <div
      role="group"
      aria-label="Translate path"
      style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span
          className="material-symbols-outlined"
          aria-hidden
          style={{ fontSize: '16px', color: 'var(--on-surface-variant)' }}
        >
          translate
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: 'var(--on-surface-variant)',
          }}
        >
          Read in
        </span>
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
          }}
        >
          {languages.map((lang) => {
            const isCurrent = lang === currentLanguage;
            const isPending = lang === pendingLanguage;
            const isLoading =
              isPending ||
              (translation?.status === 'translating' && translation.language === lang);
            // Disable every other chip while a request is in flight so
            // the user can't queue up a second translation. The chip
            // they clicked stays clickable visually but is `aria-busy`.
            const disabled = requestInFlight && !isLoading;
            const isSource = lang === sourceLanguage;
            return (
              <li key={lang}>
                <button
                  type="button"
                  className="community-lang-chip"
                  aria-pressed={isCurrent}
                  aria-busy={isLoading}
                  aria-label={`Read in ${lang.toUpperCase()}${isSource ? ' (source)' : ''}`}
                  disabled={disabled}
                  onClick={() => onSelect(lang)}
                >
                  {isLoading ? (
                    <span
                      className="material-symbols-outlined community-lang-chip__spinner"
                      aria-hidden
                      style={{ fontSize: '14px' }}
                    >
                      progress_activity
                    </span>
                  ) : isSource ? (
                    <span
                      className="material-symbols-outlined"
                      aria-hidden
                      style={{ fontSize: '14px' }}
                    >
                      home
                    </span>
                  ) : null}
                  {lang.toUpperCase()}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {translation?.status === 'translating' ? (
        <p
          style={{
            margin: 0,
            fontSize: '12px',
            color: 'var(--on-surface-variant)',
            lineHeight: 1.5,
          }}
        >
          Translating into {translation.language.toUpperCase()}… this usually takes
          a few seconds.
        </p>
      ) : null}

      {translationError ? (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            padding: '8px 10px',
            background: 'var(--surface-container-low)',
            border: '1px solid var(--error)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <span
            className="material-symbols-outlined"
            aria-hidden
            style={{ fontSize: '16px', color: 'var(--error)', flexShrink: 0, marginTop: '1px' }}
          >
            error
          </span>
          <p
            style={{
              margin: 0,
              fontSize: '12px',
              color: 'var(--on-surface)',
              lineHeight: 1.5,
              fontWeight: 600,
              flex: 1,
            }}
          >
            {translationError.message}
            {translationError.upgrade ? (
              <>
                {' '}
                <Link
                  href="/pricing"
                  style={{ color: 'var(--primary)', textDecoration: 'underline', fontWeight: 700 }}
                >
                  See Pro plans →
                </Link>
              </>
            ) : null}
          </p>
        </div>
      ) : null}
    </div>
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

// P11 — admin-only manual pre-translation trigger (P0 §4.10). Renders
// nothing for non-admins. For an admin it surfaces a curation utility:
// POST /api/admin/paths/[shareId]/pretranslate warms the popular-language
// cache immediately — used to promote a high-quality path before it
// crosses the popularity threshold, or to backfill a pre-rule row.
//
// Hallmark · component: admin-action-button · genre: inherit (NoteMage tokens)
//   states: default · hover · focus-visible · active · disabled · loading · error · success
//     default  → secondary outline (surface-container-high · on-surface · outline-variant border)
//     hover    → surface-container-highest (.community-detail-cta--admin hover rule)
//     focus    → 3px var(--primary) outline + 2px offset (inherited, shows instantly)
//     active   → translateY(1px) (inherited)
//     disabled → opacity .5 + not-allowed (shared with loading)
//     loading  → aria-busy + progress_activity spinner + cursor:progress + "Pre-translating…"
//     error    → inline role="alert" panel in var(--error)
//     success  → static confirmation row (task_alt + "Pre-translation queued") in var(--primary)
//   no gradients · animates transform/opacity only · spinner honours prefers-reduced-motion
//   light-mode: every colour is a token (--on-surface / --on-surface-variant / --primary / --error)
//   component-scope: macrostructure skipped · pre-emit critique: P5 H4 E5 S4 R4 V4
function AdminPretranslate({ shareId }: { shareId: string }) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';

  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const onTrigger = useCallback(async () => {
    if (state === 'loading') return;
    setState('loading');
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/admin/paths/${encodeURIComponent(shareId)}/pretranslate`,
        { method: 'POST' },
      );
      if (res.status === 404) {
        setErrorMsg('This path is no longer available, or you are not an admin.');
        setState('idle');
        return;
      }
      if (res.status === 409) {
        setErrorMsg('This path is not approved yet — pre-translation is approved-only.');
        setState('idle');
        return;
      }
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; error?: string }
        | null;
      if (!res.ok || !json?.success) {
        setErrorMsg(json?.error ?? 'Could not queue pre-translation. Try again.');
        setState('idle');
        return;
      }
      setState('done');
    } catch {
      setErrorMsg('Network error. Try again.');
      setState('idle');
    }
  }, [shareId, state]);

  // Non-admins never see this surface.
  if (!isAdmin) return null;

  const loading = state === 'loading';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        alignSelf: 'flex-start',
        marginTop: '4px',
        padding: '12px',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface-container-low, var(--surface-container))',
        maxWidth: '360px',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--on-surface-variant)',
        }}
      >
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '14px' }}>
          admin_panel_settings
        </span>
        Admin · curation
      </span>

      {state === 'done' ? (
        <span
          role="status"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            fontWeight: 700,
            color: 'var(--primary)',
          }}
        >
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '20px' }}>
            task_alt
          </span>
          Pre-translation queued
        </span>
      ) : (
        <button
          type="button"
          onClick={() => void onTrigger()}
          disabled={loading}
          aria-busy={loading}
          aria-disabled={loading}
          className="community-detail-cta community-detail-cta--admin"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            borderRadius: 'var(--radius-md)',
            fontFamily: 'inherit',
            fontSize: '14px',
            fontWeight: 700,
            cursor: loading ? 'progress' : 'pointer',
          }}
        >
          <span
            className={`material-symbols-outlined${loading ? ' community-detail-cta__spinner' : ''}`}
            aria-hidden
            style={{ fontSize: '18px' }}
          >
            {loading ? 'progress_activity' : 'bolt'}
          </span>
          {loading ? 'Pre-translating…' : 'Pre-translate all languages'}
        </button>
      )}

      <p
        style={{
          margin: 0,
          fontSize: '12px',
          color: 'var(--on-surface-variant)',
          lineHeight: 1.5,
        }}
      >
        {state === 'done'
          ? 'Popular languages are warming in the background.'
          : 'Warms the popular-language cache now, before this path crosses the popularity threshold.'}
      </p>

      {errorMsg ? (
        <p
          role="alert"
          style={{
            margin: '4px 0 0',
            fontSize: '12px',
            color: 'var(--error)',
            lineHeight: 1.5,
            fontWeight: 600,
          }}
        >
          {errorMsg}
        </p>
      ) : null}
    </div>
  );
}

// P13 — community report affordance (Layer 4). A low-emphasis "Report
// this path" disclosure that expands a reason picker. Hidden on the
// author's own path (you can't report your own work). POSTs to
// /api/community/paths/[shareId]/report; the server aggregates open
// reports and, past the threshold, pulls the path back to the human
// queue for re-moderation.
//
// Hallmark · component: report-dialog · genre: editorial · theme: inherit (NoteMage tokens)
//   states: default · hover · focus-visible · active · disabled · loading · error · success
//     default  → ghost trigger (transparent · on-surface-variant · flag icon)
//     hover    → surface-container fill (.community-report-trigger hover rule)
//     focus    → 3px var(--primary) outline + 2px offset (shared rule)
//     active   → translateY(1px)
//     disabled → submit dimmed (opacity .5 · not-allowed) until a reason is picked
//     loading  → aria-busy + progress_activity spinner + "Reporting…"
//     error    → inline role="alert" panel in var(--error)
//     success  → panel collapses to a static "Reported" confirmation row
//   no gradients · animates transform/opacity only · spinner honours prefers-reduced-motion
//   light-mode: every colour is a token (--on-surface* / --primary / --on-primary / --error)
//   component-scope: macrostructure skipped · pre-emit critique: P5 H4 E5 S4 R5 V4
function ReportControl({ shareId, authorId }: { shareId: string; authorId: string }) {
  const { data: session } = useSession();
  const viewerId = session?.user?.id;

  const [phase, setPhase] = useState<'idle' | 'open' | 'submitting' | 'done'>('idle');
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const onSubmit = useCallback(async () => {
    if (!reason || phase === 'submitting') return;
    setPhase('submitting');
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/community/paths/${encodeURIComponent(shareId)}/report`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason,
            detail: detail.trim() ? detail.trim() : undefined,
          }),
        },
      );
      if (res.status === 404) {
        setErrorMsg('This path is no longer available.');
        setPhase('open');
        return;
      }
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; error?: string }
        | null;
      if (!res.ok || !json?.success) {
        setErrorMsg(json?.error ?? 'Could not submit your report. Try again.');
        setPhase('open');
        return;
      }
      setPhase('done');
    } catch {
      setErrorMsg('Network error. Try again.');
      setPhase('open');
    }
  }, [reason, detail, phase, shareId]);

  // Can't report your own path. The (dashboard) layout already guarantees
  // an authed session, so this just guards the own-path case; if the
  // viewer id isn't hydrated yet the affordance still shows and the
  // server's 400 self-report guard is the backstop.
  if (viewerId && viewerId === authorId) return null;

  if (phase === 'done') {
    return (
      <div
        className="community-report-done"
        role="status"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          alignSelf: 'flex-start',
          marginTop: '4px',
          fontSize: '13px',
          fontWeight: 700,
          color: 'var(--primary)',
        }}
      >
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '18px' }}>
          task_alt
        </span>
        Thanks — we&rsquo;ll re-review this path.
      </div>
    );
  }

  if (phase === 'idle') {
    return (
      <button
        type="button"
        className="community-report-trigger"
        onClick={() => setPhase('open')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          alignSelf: 'flex-start',
          marginTop: '4px',
          padding: '6px 10px',
          background: 'transparent',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          color: 'var(--on-surface-variant)',
          fontFamily: 'inherit',
          fontSize: '12px',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '16px' }}>
          flag
        </span>
        Report this path
      </button>
    );
  }

  const submitting = phase === 'submitting';

  return (
    <div
      role="group"
      aria-label="Report this path"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        alignSelf: 'stretch',
        marginTop: '4px',
        padding: '16px',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--surface-container-low, var(--surface-container))',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontFamily: 'var(--font-display)',
            fontSize: '15px',
            fontWeight: 800,
            color: 'var(--on-surface)',
            letterSpacing: '-0.01em',
          }}
        >
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '18px' }}>
            flag
          </span>
          Report this path
        </span>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
          Tell us what&rsquo;s wrong. Reported paths get re-reviewed by our team.
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Reason for reporting"
        style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
      >
        {REPORT_REASONS.map((r) => {
          const selected = reason === r;
          return (
            <label
              key={r}
              className={`community-report-option${selected ? ' is-selected' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 12px',
                border: `1px solid ${selected ? 'var(--primary)' : 'var(--outline-variant)'}`,
                borderRadius: 'var(--radius-md)',
                background: selected ? 'rgba(174,137,255,0.10)' : 'var(--surface-container)',
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              <input
                type="radio"
                name="report-reason"
                value={r}
                checked={selected}
                disabled={submitting}
                onChange={() => setReason(r)}
                style={{ accentColor: 'var(--primary)', cursor: 'inherit' }}
              />
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: selected ? 'var(--on-surface)' : 'var(--on-surface-variant)',
                }}
              >
                {REPORT_REASON_LABELS[r]}
              </span>
            </label>
          );
        })}
      </div>

      <textarea
        className="community-report-detail"
        aria-label="Additional detail (optional)"
        placeholder="Add any detail (optional)"
        maxLength={REPORT_DETAIL_MAX_CHARS}
        value={detail}
        disabled={submitting}
        onChange={(e) => setDetail(e.target.value)}
        rows={2}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          resize: 'vertical',
          padding: '8px 10px',
          background: 'var(--surface-container-high)',
          border: '1px solid var(--outline-variant)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--on-surface)',
          fontFamily: 'inherit',
          fontSize: '13px',
          lineHeight: 1.5,
        }}
      />

      {errorMsg ? (
        <p
          role="alert"
          style={{
            margin: 0,
            fontSize: '12px',
            color: 'var(--error)',
            lineHeight: 1.5,
            fontWeight: 600,
          }}
        >
          {errorMsg}
        </p>
      ) : null}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="community-report-cancel"
          onClick={() => {
            setPhase('idle');
            setReason(null);
            setDetail('');
            setErrorMsg(null);
          }}
          disabled={submitting}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '10px 16px',
            background: 'transparent',
            border: '1px solid var(--outline-variant)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--on-surface-variant)',
            fontFamily: 'inherit',
            fontSize: '13px',
            fontWeight: 700,
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          className="community-report-submit"
          onClick={() => void onSubmit()}
          disabled={!reason || submitting}
          aria-busy={submitting}
          aria-disabled={!reason || submitting}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            background: !reason || submitting ? 'var(--surface-container-high)' : 'var(--primary)',
            color: !reason || submitting ? 'var(--on-surface-variant)' : 'var(--on-primary)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            fontFamily: 'inherit',
            fontSize: '13px',
            fontWeight: 700,
            cursor: submitting ? 'progress' : !reason ? 'not-allowed' : 'pointer',
          }}
        >
          <span
            className={`material-symbols-outlined${submitting ? ' community-report-submit__spinner' : ''}`}
            aria-hidden
            style={{ fontSize: '18px' }}
          >
            {submitting ? 'progress_activity' : 'send'}
          </span>
          {submitting ? 'Reporting…' : 'Submit report'}
        </button>
      </div>
    </div>
  );
}

function PhasePreviewCard({
  phase,
  index,
  overlay,
}: {
  phase: PhasePreview;
  index: number;
  overlay: TranslationPayload['phases'][number] | null;
}) {
  // Build a slot-overlay map keyed on source slot ID so dropped IDs in
  // the model output fall through to the source title (no per-slot
  // diff logic in the render path).
  const overlaySlots = useMemo(() => {
    if (!overlay) return null;
    const m = new Map<string, { id: string; title: string; description: string | null }>();
    for (const s of overlay.slots) m.set(s.id, s);
    return m;
  }, [overlay]);

  const displayPhaseTitle = overlay ? overlay.title : phase.title;

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
          {displayPhaseTitle}
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
          <SlotPreviewRow
            key={slot.id}
            slot={slot}
            overlay={overlaySlots?.get(slot.id) ?? null}
          />
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

function SlotPreviewRow({
  slot,
  overlay,
}: {
  slot: SlotPreview;
  overlay: { id: string; title: string; description: string | null } | null;
}) {
  const meta = SLOT_KIND_LABEL[slot.kind] ?? { label: slot.kind, icon: 'check_circle' };
  const displayTitle = overlay ? overlay.title : slot.title;
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
        {displayTitle}
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
