/* Hallmark · component: video-material-picker · genre: playful · theme: project (Neon Scholar tokens)
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass (light + dark via semantic tokens)
 * pre-emit critique: P5 H4 E4 S4 R4 V4
 */
'use client';

import * as React from 'react';
import VideoInputMask, {
  captionsUnavailableError,
  type VideoUrlConfirm,
} from '@/components/video/VideoInputMask';
import { readYouTubeDuration } from '@/lib/youtube-duration';
import { minutesForDuration } from '@/lib/video-import/submit';

// ── Public types ──────────────────────────────────────────────────────────────

/** Which pipeline ingested a video. Free users get transcripts (counts), PRO
 *  users get native video notes (minutes). */
export type VideoLane = 'transcript' | 'native';

export type VideoStatus = 'processing' | 'ready' | 'error';

/** One YouTube video added as study-pack material. Lives in the wizard's
 *  WizardState so it survives step navigation; the picker is controlled. */
export interface AddedVideo {
  key: string;
  url: string;
  videoId: string;
  title: string;
  durationSec: number;
  lane: VideoLane;
  status: VideoStatus;
  /** Document id (transcript lane) or Page id (native lane) once ready — this
   *  is the material id fed to `materialIds` for topic detection + generation. */
  materialId?: string;
  /** Native lane only — the ImportJob being tracked. */
  jobId?: string;
  error?: string;
}

interface UsageEntry {
  used: number;
  limit: number;
}

// Hard cap mirrored from VIDEO_INGEST_MAX_DURATION_SEC (60 min) — same client
// guard the notebook import tab uses.
const MAX_DURATION_SEC = 3600;

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return h > 0
    ? `${h}:${mm}:${String(s).padStart(2, '0')}`
    : `${mm}:${String(s).padStart(2, '0')}`;
}

function makeKey(videoId: string): string {
  // Stable-ish local key without Date.now()/Math.random() (banned in some
  // contexts) — videoId plus a short counter handled by the caller's array.
  return `yt_${videoId}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface VideoMaterialPickerProps {
  isPro: boolean;
  videos: AddedVideo[];
  onChange: (videos: AddedVideo[]) => void;
}

export default function VideoMaterialPicker({ isPro, videos, onChange }: VideoMaterialPickerProps) {
  const [error, setError] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [usage, setUsage] = React.useState<UsageEntry | null>(null);

  // Inbox notebook + a destination section for the native lane. Resolved lazily
  // (and cached) the first time a PRO user submits a video.
  const inboxRef = React.useRef<{ notebookId: string; sectionId: string } | null>(null);

  // Keep live refs of the videos array and the (often inline) onChange so the
  // polling loop reads the latest without re-subscribing every render.
  const videosRef = React.useRef(videos);
  videosRef.current = videos;
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  const meterFeature = isPro ? 'video_ingest' : 'youtube_transcript';

  const loadUsage = React.useCallback(() => {
    let cancelled = false;
    fetch('/api/user/usage')
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.success) return;
        const features = j.data?.features as
          | Array<{ featureType: string; used: number; limit: number }>
          | undefined;
        const entry = features?.find((f) => f.featureType === meterFeature);
        if (entry) setUsage({ used: entry.used, limit: entry.limit });
      })
      .catch(() => {
        /* soft-fail — the picker still works without the balance line */
      });
    return () => {
      cancelled = true;
    };
  }, [meterFeature]);

  React.useEffect(() => loadUsage(), [loadUsage]);

  // ── Live link preview — read length the moment a link resolves ─────────────
  // The mask fires `onUrlPreview` as soon as a pasted/typed link resolves to a
  // card, so the minutes show up-front (not only after the user confirms).
  const [preview, setPreview] = React.useState<{
    videoId: string;
    durationSec: number | null;
    loading: boolean;
  } | null>(null);
  // Cache durations by videoId so confirm reuses the up-front read (no second
  // hidden-player load).
  const durationCacheRef = React.useRef<Map<string, number>>(new Map());

  const handleUrlPreview = React.useCallback(
    (p: { videoId: string; url: string } | null) => {
      if (!p) {
        setPreview(null);
        return;
      }
      const cached = durationCacheRef.current.get(p.videoId);
      if (cached != null) {
        setPreview({ videoId: p.videoId, durationSec: cached, loading: false });
        return;
      }
      setPreview({ videoId: p.videoId, durationSec: null, loading: true });
      readYouTubeDuration(p.videoId)
        .then((d) => {
          const secs = Math.floor(d);
          durationCacheRef.current.set(p.videoId, secs);
          setPreview((cur) =>
            cur && cur.videoId === p.videoId ? { ...cur, durationSec: secs, loading: false } : cur,
          );
        })
        .catch(() => {
          setPreview((cur) =>
            cur && cur.videoId === p.videoId ? { ...cur, durationSec: null, loading: false } : cur,
          );
        });
    },
    [],
  );

  // ── Native lane: resolve Inbox notebook + a section to land the job's page ──
  const resolveInboxTarget = React.useCallback(async () => {
    if (inboxRef.current) return inboxRef.current;
    const inboxRes = await fetch('/api/learn/uploads/inbox', { method: 'POST' });
    const inboxJson = await inboxRes.json();
    const notebookId = inboxJson?.data?.id as string | undefined;
    if (!inboxJson?.success || !notebookId) {
      throw new Error('Could not prepare your library. Try again.');
    }
    // Reuse the first existing section, else create one to hold imported notes.
    let sectionId = '';
    const secRes = await fetch(`/api/notebooks/${encodeURIComponent(notebookId)}/sections`);
    const secJson = await secRes.json();
    if (secJson?.success && Array.isArray(secJson.data) && secJson.data.length > 0) {
      sectionId = secJson.data[0].id as string;
    } else {
      const createRes = await fetch(`/api/notebooks/${encodeURIComponent(notebookId)}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Video notes' }),
      });
      const createJson = await createRes.json();
      if (!createJson?.success || !createJson?.data?.id) {
        throw new Error('Could not prepare your library. Try again.');
      }
      sectionId = createJson.data.id as string;
    }
    inboxRef.current = { notebookId, sectionId };
    return inboxRef.current;
  }, []);

  const removeVideo = React.useCallback((key: string) => {
    onChangeRef.current(videosRef.current.filter((v) => v.key !== key));
  }, []);

  // ── Add a video ──────────────────────────────────────────────────────────
  const onConfirmUrl = React.useCallback(
    async (confirm: VideoUrlConfirm) => {
      setError(null);

      if (videosRef.current.some((v) => v.videoId === confirm.videoId)) {
        setError('That video is already in your list.');
        return;
      }

      setAdding(true);
      try {
        // Length is usually already read by the live preview — reuse it. Only
        // read here if the user confirmed before the preview resolved. The
        // server reconciles any under-report for the charge.
        let durationSec = durationCacheRef.current.get(confirm.videoId) ?? 0;
        if (!durationSec) {
          try {
            durationSec = await readYouTubeDuration(confirm.videoId);
            durationCacheRef.current.set(confirm.videoId, Math.floor(durationSec));
          } catch {
            // Embedding blocked — for the transcript lane we can still proceed
            // (duration is informational); for native we need it to charge.
            if (isPro) {
              throw captionsUnavailableError();
            }
          }
        }
        if (durationSec > MAX_DURATION_SEC) {
          setError(`That video is too long — ${Math.floor(MAX_DURATION_SEC / 60)} minutes max.`);
          setAdding(false);
          return;
        }

        const title = confirm.title?.trim() || 'YouTube video';

        if (isPro) {
          // Native lane — kick off the async Gemini job, track to completion.
          const target = await resolveInboxTarget();
          const res = await fetch(
            `/api/notebooks/${encodeURIComponent(target.notebookId)}/video-import`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sectionId: target.sectionId,
                fileName: title.slice(0, 200),
                videoUrl: confirm.url,
                durationSec: Math.floor(durationSec),
                pageTitle: title.slice(0, 200),
              }),
            },
          );
          const json = await res.json().catch(() => null);
          if (!res.ok || !json?.success || !json.data?.jobId) {
            setError(json?.error ?? 'Could not start that video. Try again.');
            setAdding(false);
            return;
          }
          onChangeRef.current([
            ...videosRef.current,
            {
              key: makeKey(confirm.videoId),
              url: confirm.url,
              videoId: confirm.videoId,
              title,
              durationSec: Math.floor(durationSec),
              lane: 'native',
              status: 'processing',
              jobId: json.data.jobId as string,
            },
          ]);
        } else {
          // Transcript lane — synchronous Document, ready immediately.
          const res = await fetch('/api/learn/documents/youtube', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: confirm.url }),
          });
          const json = await res.json().catch(() => null);
          if (res.status === 422) {
            // Captionless — surface the in-card upsell seam.
            throw captionsUnavailableError();
          }
          if (!res.ok || !json?.success || !json.data?.document?.id) {
            setError(json?.error ?? 'Could not read that video. Try again.');
            setAdding(false);
            return;
          }
          onChangeRef.current([
            ...videosRef.current,
            {
              key: makeKey(confirm.videoId),
              url: confirm.url,
              videoId: confirm.videoId,
              title,
              durationSec: Math.floor(durationSec),
              lane: 'transcript',
              status: 'ready',
              materialId: json.data.document.id as string,
            },
          ]);
        }
        loadUsage();
      } finally {
        setAdding(false);
      }
    },
    [isPro, resolveInboxTarget, loadUsage],
  );

  // ── Native lane: poll job status until every processing video resolves ─────
  const hasProcessing = videos.some((v) => v.lane === 'native' && v.status === 'processing');
  React.useEffect(() => {
    if (!hasProcessing) return;
    let cancelled = false;

    const poll = async () => {
      try {
        // After a remount the Inbox target may not be cached — re-resolve it so
        // tracking resumes rather than silently stalling.
        const target = inboxRef.current ?? (await resolveInboxTarget().catch(() => null));
        if (cancelled || !target) return;
        const res = await fetch(
          `/api/notebooks/${encodeURIComponent(target.notebookId)}/video-import`,
        );
        const json = await res.json().catch(() => null);
        if (cancelled || !json?.success || !Array.isArray(json.data)) return;
        const byId = new Map<string, { status: string; resultPageId: string | null; error: string | null }>();
        for (const row of json.data) byId.set(row.id, row);

        let changed = false;
        const next = videosRef.current.map((v) => {
          if (v.lane !== 'native' || v.status !== 'processing' || !v.jobId) return v;
          const row = byId.get(v.jobId);
          if (!row) return v;
          if (row.status === 'ready' && row.resultPageId) {
            changed = true;
            return { ...v, status: 'ready' as VideoStatus, materialId: row.resultPageId };
          }
          if (row.status === 'failed') {
            changed = true;
            return {
              ...v,
              status: 'error' as VideoStatus,
              error: row.error ?? 'That video could not be processed.',
            };
          }
          return v;
        });
        if (changed) {
          onChangeRef.current(next);
          loadUsage();
        }
      } catch {
        /* transient — next tick retries */
      }
    };

    const interval = setInterval(poll, 4000);
    void poll();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [hasProcessing, resolveInboxTarget, loadUsage]);

  // ── Derived meter values ───────────────────────────────────────────────────
  const limit = usage?.limit ?? null;
  const used = usage?.used ?? 0;
  const unlimited = limit === -1;
  const remaining = limit !== null && !unlimited ? Math.max(0, limit - used) : null;

  // Budget cost in the meter's unit (PRO = minutes, free = video count).
  // `remaining` already reflects videos added this session (both lanes charge on
  // add); the live preview video is NOT charged yet, so it's projected on top.
  const sessionMinutes = videos.reduce((sum, v) => sum + minutesForDuration(v.durationSec), 0);
  const sessionUsed = isPro ? sessionMinutes : videos.length;
  const previewUsed = !preview
    ? 0
    : isPro
      ? preview.durationSec
        ? minutesForDuration(preview.durationSec)
        : 0
      : 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <LimitReader
        isPro={isPro}
        limit={limit}
        used={used}
        remaining={remaining}
        unlimited={unlimited}
        sessionUsed={sessionUsed}
        previewUsed={previewUsed}
      />

      <VideoInputMask
        onConfirmUrl={onConfirmUrl}
        disabled={adding}
        dense
        placeholder="Paste a YouTube link"
        onUrlPreview={handleUrlPreview}
        urlEstimate={preview ? <UrlEstimate preview={preview} isPro={isPro} /> : null}
      />

      {error && (
        <p
          role="alert"
          style={{
            margin: 0,
            padding: '8px 12px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--error-container, rgba(253,111,133,0.12))',
            color: 'var(--error)',
            fontSize: 'var(--fs-xs)',
            lineHeight: 1.5,
          }}
        >
          {error}
        </p>
      )}

      {videos.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {videos.map((v) => (
            <VideoRow key={v.key} video={v} onRemove={() => removeVideo(v.key)} />
          ))}
        </ul>
      )}

      {isPro && hasProcessing && (
        <p
          style={{
            margin: 0,
            fontSize: 'var(--fs-xs)',
            color: 'var(--on-surface-variant)',
            lineHeight: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 15 }}>
            schedule
          </span>
          Mage is watching your video{videos.filter((v) => v.status === 'processing').length > 1 ? 's' : ''} —
          this can take a few minutes. You can keep adding more.
        </p>
      )}

      <VideoPickerStyles />
    </div>
  );
}

// ── Limit reader — the budget bar ─────────────────────────────────────────────

function LimitReader({
  isPro,
  limit,
  used,
  remaining,
  unlimited,
  sessionUsed,
  previewUsed,
}: {
  isPro: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
  unlimited: boolean;
  /** Cost (meter unit) of videos added this session — already in `used`. */
  sessionUsed: number;
  /** Cost (meter unit) of the video being previewed — not yet charged. */
  previewUsed: number;
}) {
  // "min" never pluralises; "video(s)" does — agree with the number shown.
  const unitFor = (n: number | null) => (isPro ? 'min' : n === 1 ? 'video' : 'videos');
  const noun = isPro ? 'video minutes' : 'video transcripts';

  // Everything this session subtracts from the budget: already-added videos
  // (in `used`/`remaining`) plus the previewed one (not yet charged).
  const delta = sessionUsed + previewUsed;
  // `remaining` already nets out added videos; project the preview on top.
  const projected = remaining === null ? null : Math.max(0, remaining - previewUsed);
  const heroValue = delta > 0 ? projected : remaining;
  const empty = heroValue !== null && heroValue <= 0;

  // Hero + bar carry the colour. Accent normally, error when it would zero out —
  // both theme-aware tokens so light mode stays legible (no light-on-light).
  const heroColor = empty ? 'var(--error)' : 'var(--accent-strong, var(--primary))';
  const deltaColor = empty ? 'var(--error)' : 'var(--accent-strong, var(--primary))';
  const deltaBg = empty ? 'rgba(253,111,133,0.14)' : 'rgba(140,82,255,0.14)';

  const labelText = delta > 0 ? 'left after upload' : isPro ? 'left this month' : 'left';

  // The bar previews charged + previewed consumption together.
  const barUsed = used + previewUsed;
  const pct =
    limit !== null && limit > 0 && !unlimited
      ? Math.min(100, Math.round((barUsed / limit) * 100))
      : 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '14px 16px',
        borderRadius: 'var(--radius-lg)',
        background: 'rgba(140,82,255,0.06)',
        border: '1px solid rgba(174,137,255,0.22)',
      }}
    >
      {/* Header — feature label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          className="material-symbols-outlined"
          aria-hidden
          style={{ fontSize: 18, color: 'var(--accent-strong, var(--primary))' }}
        >
          smart_display
        </span>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--fs-xs)',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--on-surface-variant)',
          }}
        >
          YouTube budget
        </span>
      </div>

      {/* Hero number — projected balance, big + coloured, with the subtraction */}
      {unlimited || limit === null ? (
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--fs-2xl)',
            fontWeight: 800,
            color: 'var(--accent-strong, var(--primary))',
            lineHeight: 1,
          }}
        >
          Unlimited
        </span>
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--fs-4xl, 2.5rem)',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              lineHeight: 1,
              color: heroColor,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {heroValue ?? 0}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--fs-base)',
              fontWeight: 700,
              color: heroColor,
            }}
          >
            {unitFor(heroValue)}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--fs-sm)',
              fontWeight: 500,
              color: 'var(--on-surface-variant)',
            }}
          >
            {labelText}
          </span>
          {delta > 0 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                background: deltaBg,
                color: deltaColor,
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--fs-xs)',
                fontWeight: 800,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.01em',
              }}
            >
              −{delta} {unitFor(delta)}
            </span>
          )}
        </div>
      )}

      {/* Bar */}
      {!unlimited && limit !== null && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={Math.min(barUsed, limit)}
          aria-label={`${noun} used`}
          style={{
            height: 8,
            borderRadius: 'var(--radius-full)',
            background: 'var(--ink-12, var(--surface-container-highest))',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              borderRadius: 'var(--radius-full)',
              background: heroColor,
              transition: 'width var(--dur-med, 0.35s) var(--ease-spring, cubic-bezier(0.22,1,0.36,1))',
            }}
          />
        </div>
      )}

      {/* Free-tier hint, only before anything is added. */}
      {!isPro && delta === 0 && (
        <p
          style={{
            margin: 0,
            fontSize: 'var(--fs-xs)',
            color: 'var(--on-surface-variant)',
            lineHeight: 1.5,
          }}
        >
          Captions become source material for your pack.
        </p>
      )}
    </div>
  );
}

// ── Live length estimate shown in the input's preview card (pre-confirm) ──────

function UrlEstimate({
  preview,
  isPro,
}: {
  preview: { videoId: string; durationSec: number | null; loading: boolean };
  isPro: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 'var(--radius-md)',
        background: 'rgba(140,82,255,0.06)',
        border: '1px solid rgba(174,137,255,0.22)',
      }}
    >
      <span
        className="material-symbols-outlined"
        aria-hidden
        style={{ fontSize: 16, color: 'var(--accent-strong, var(--primary))', flexShrink: 0 }}
      >
        schedule
      </span>
      {preview.loading ? (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 'var(--fs-xs)',
            color: 'var(--on-surface-variant)',
          }}
        >
          <span className="vmp-spin-sm" aria-hidden />
          Reading length…
        </span>
      ) : preview.durationSec != null && preview.durationSec > 0 ? (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'baseline',
            gap: 6,
            flexWrap: 'wrap',
            fontSize: 'var(--fs-sm)',
            color: 'var(--on-surface-variant)',
          }}
        >
          <strong
            style={{
              color: 'var(--on-surface)',
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatDuration(preview.durationSec)}
          </strong>
          {isPro && (
            <>
              <span aria-hidden style={{ color: 'var(--outline-variant)' }}>
                ·
              </span>
              <span>
                uses{' '}
                <strong style={{ color: 'var(--accent-strong, var(--primary))', fontWeight: 800 }}>
                  {minutesForDuration(preview.durationSec)} min
                </strong>
              </span>
            </>
          )}
        </span>
      ) : (
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--on-surface-variant)' }}>
          Length unavailable
        </span>
      )}
    </div>
  );
}

// ── One row in the added-videos list ──────────────────────────────────────────

function VideoRow({ video, onRemove }: { video: AddedVideo; onRemove: () => void }) {
  const statusColor =
    video.status === 'ready'
      ? 'var(--success, #4ade80)'
      : video.status === 'error'
        ? 'var(--error)'
        : 'var(--accent-strong, var(--primary))';
  const statusIcon =
    video.status === 'ready' ? 'check_circle' : video.status === 'error' ? 'error' : 'progress_activity';

  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface-container-high)',
        border: '1px solid var(--ink-12, var(--outline-variant))',
      }}
    >
      <span
        className="material-symbols-outlined"
        aria-hidden
        style={{
          fontSize: 18,
          color: statusColor,
          animation: video.status === 'processing' ? 'vmpSpin 1s linear infinite' : undefined,
        }}
      >
        {statusIcon}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--fs-sm)',
            fontWeight: 600,
            color: 'var(--on-surface)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={video.title}
        >
          {video.title}
        </p>
        <p
          style={{
            margin: '2px 0 0',
            fontSize: 'var(--fs-xs)',
            color: video.status === 'error' ? 'var(--error)' : 'var(--on-surface-variant)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {video.status === 'error'
            ? video.error || 'Could not process this video.'
            : video.status === 'processing'
              ? `Generating notes${video.durationSec ? ` · ${formatDuration(video.durationSec)}` : ''}`
              : video.durationSec
                ? formatDuration(video.durationSec)
                : video.lane === 'transcript'
                  ? 'Transcript added'
                  : 'Notes added'}
        </p>
      </div>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${video.title}`}
        className="vmp-remove"
      >
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>
          close
        </span>
      </button>
    </li>
  );
}

// ── Scoped styles (hover/focus/active states the inline styles can't carry) ───

function VideoPickerStyles() {
  return (
    <style>{`
      @keyframes vmpSpin { to { transform: rotate(360deg); } }
      .vmp-spin-sm {
        flex-shrink: 0;
        display: inline-block;
        width: 13px;
        height: 13px;
        border-radius: 50%;
        border: 2px solid var(--ink-12, var(--surface-container-highest));
        border-top-color: var(--accent-strong, var(--primary));
        animation: vmpSpin 0.8s linear infinite;
      }
      .vmp-remove {
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        border-radius: var(--radius-full);
        border: none;
        background: transparent;
        color: var(--on-surface-variant);
        cursor: pointer;
        transition: background var(--dur-fast, 0.16s) var(--ease-spring, cubic-bezier(0.22,1,0.36,1)),
          color var(--dur-fast, 0.16s) var(--ease-spring, cubic-bezier(0.22,1,0.36,1)),
          transform var(--dur-fast, 0.16s) var(--ease-spring, cubic-bezier(0.22,1,0.36,1));
      }
      .vmp-remove:hover { background: var(--ink-06, var(--surface-container-highest)); color: var(--on-surface); }
      .vmp-remove:focus-visible { outline: 2px solid var(--accent-strong, var(--primary)); outline-offset: 2px; }
      .vmp-remove:active { transform: scale(0.92); }
      @media (prefers-reduced-motion: reduce) {
        .vmp-remove { transition-duration: 0.05s; }
        .vmp-spin-sm { animation: none !important; }
        [style*="vmpSpin"] { animation: none !important; }
      }
    `}</style>
  );
}
