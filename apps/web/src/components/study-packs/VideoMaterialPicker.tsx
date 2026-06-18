/* Hallmark · component: video-material-picker · genre: playful · theme: project (Neon Scholar tokens)
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass (light + dark via semantic tokens)
 * pre-emit critique: P5 H4 E4 S4 R4 V4
 */
'use client';

import * as React from 'react';
import { readYouTubeDuration } from '@/lib/youtube-duration';
import { minutesForDuration } from '@/lib/video-import/submit';

// ── Public types ──────────────────────────────────────────────────────────────

/** Which pipeline ingested a video. Free users get transcripts (counts), PRO
 *  users get native video notes (minutes). */
export type VideoLane = 'transcript' | 'native';

/** queued → waiting its turn; processing → being read/ingested; then ready/error. */
export type VideoStatus = 'queued' | 'processing' | 'ready' | 'error';

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

// Hard cap mirrored from VIDEO_INGEST_MAX_DURATION_SEC (60 min).
const MAX_DURATION_SEC = 3600;
// How many links one "Add" accepts — keeps the sequential queue sane and within
// the per-minute ingest rate limits.
const MAX_BATCH = 20;

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

// Pull every distinct YouTube video id out of a blob of pasted text (one per
// line, space/comma separated — all tolerated).
const YT_RE =
  /(?:youtube\.com\/(?:watch\?(?:[^\s]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/g;

function parseYouTubeLinks(text: string): { videoId: string; url: string }[] {
  const seen = new Set<string>();
  const out: { videoId: string; url: string }[] = [];
  for (const m of text.matchAll(YT_RE)) {
    const id = m[1];
    if (!seen.has(id)) {
      seen.add(id);
      out.push({ videoId: id, url: `https://www.youtube.com/watch?v=${id}` });
    }
  }
  return out;
}

async function fetchOEmbedTitle(url: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.title === 'string' ? data.title : null;
  } catch {
    return null;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface VideoMaterialPickerProps {
  isPro: boolean;
  videos: AddedVideo[];
  onChange: (videos: AddedVideo[]) => void;
}

export default function VideoMaterialPicker({ isPro, videos, onChange }: VideoMaterialPickerProps) {
  const [draft, setDraft] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [usage, setUsage] = React.useState<UsageEntry | null>(null);

  // Inbox notebook + a destination section for the native lane. Resolved lazily
  // (and cached) the first time a PRO user submits a video.
  const inboxRef = React.useRef<{ notebookId: string; sectionId: string } | null>(null);

  // The video list is mutated from async loops (the sequential processor, the
  // native poller). Keep it on a ref that patch() updates synchronously so
  // back-to-back updates between renders don't clobber each other.
  const videosRef = React.useRef(videos);
  videosRef.current = videos;
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  const setVideos = React.useCallback((next: AddedVideo[]) => {
    videosRef.current = next;
    onChangeRef.current(next);
  }, []);
  const patch = React.useCallback(
    (key: string, p: Partial<AddedVideo>) =>
      setVideos(videosRef.current.map((v) => (v.key === key ? { ...v, ...p } : v))),
    [setVideos],
  );

  const durationCacheRef = React.useRef<Map<string, number>>(new Map());
  const processingRef = React.useRef(false);
  // Both ingest routes rate-limit at 10/min. On a rate-limit hit we re-queue the
  // video and pause the whole queue until this timestamp before retrying.
  const cooldownUntilRef = React.useRef(0);
  const retryTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRetry = React.useCallback((ms: number) => {
    if (retryTimerRef.current) return; // one pending wake-up is enough
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      void processNextRef.current?.();
    }, ms);
  }, []);
  // Hold the latest processNext so scheduleRetry (stable) can reach it.
  const processNextRef = React.useRef<(() => Promise<void>) | null>(null);
  React.useEffect(() => () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  }, []);
  // Frozen balance from before this session's videos — the baseline the "after
  // upload" projection subtracts from. Captured on the first usage load.
  const baselineRef = React.useRef<number | null>(null);

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
        if (entry) {
          setUsage({ used: entry.used, limit: entry.limit });
          if (baselineRef.current === null && entry.limit !== -1) {
            baselineRef.current = Math.max(0, entry.limit - entry.used);
          }
        }
      })
      .catch(() => {
        /* soft-fail — the picker still works without the balance line */
      });
    return () => {
      cancelled = true;
    };
  }, [meterFeature]);

  React.useEffect(() => loadUsage(), [loadUsage]);

  // ── Native lane: resolve Inbox notebook + a section to land the job's page ──
  const resolveInboxTarget = React.useCallback(async () => {
    if (inboxRef.current) return inboxRef.current;
    const inboxRes = await fetch('/api/learn/uploads/inbox', { method: 'POST' });
    const inboxJson = await inboxRes.json();
    const notebookId = inboxJson?.data?.id as string | undefined;
    if (!inboxJson?.success || !notebookId) {
      throw new Error('Could not prepare your library. Try again.');
    }
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

  // ── Add a batch of links to the queue ──────────────────────────────────────
  const addDraft = React.useCallback(() => {
    setError(null);
    const parsed = parseYouTubeLinks(draft);
    if (parsed.length === 0) {
      setError('Paste one or more YouTube links.');
      return;
    }
    const existing = new Set(videosRef.current.map((v) => v.videoId));
    const fresh = parsed.filter((p) => !existing.has(p.videoId));
    if (fresh.length === 0) {
      setError('Those videos are already in your list.');
      return;
    }
    const room = Math.max(0, MAX_BATCH - videosRef.current.length);
    const take = fresh.slice(0, room);
    if (take.length === 0) {
      setError(`That's the max of ${MAX_BATCH} videos.`);
      return;
    }

    const added: AddedVideo[] = take.map((p) => ({
      key: `yt_${p.videoId}`,
      url: p.url,
      videoId: p.videoId,
      title: 'YouTube video',
      durationSec: 0,
      lane: isPro ? 'native' : 'transcript',
      status: 'queued',
    }));
    setVideos([...videosRef.current, ...added]);
    setDraft('');
    if (take.length < fresh.length) {
      setError(`Added ${take.length}; the rest exceed the ${MAX_BATCH}-video max.`);
    }

    // Resolve nicer titles in the background (independent of ingest order).
    for (const v of added) {
      void fetchOEmbedTitle(v.url).then((t) => {
        if (t) patch(v.key, { title: t });
      });
    }
  }, [draft, isPro, patch, setVideos]);

  const removeVideo = React.useCallback(
    (key: string) => {
      setVideos(videosRef.current.filter((v) => v.key !== key));
    },
    [setVideos],
  );

  // ── Sequential processor — one queued video at a time, in order ─────────────
  const processNext = React.useCallback(async () => {
    if (processingRef.current) return;
    const next = videosRef.current.find((v) => v.status === 'queued');
    if (!next) return;
    // Respect a rate-limit cooldown before touching the next item.
    const wait = cooldownUntilRef.current - Date.now();
    if (wait > 0) {
      scheduleRetry(wait + 50);
      return;
    }
    processingRef.current = true;
    try {
      patch(next.key, { status: 'processing' });

      // Length: from cache, else read it (informational for free, required for
      // the native minutes charge).
      let durationSec = durationCacheRef.current.get(next.videoId) ?? 0;
      if (!durationSec) {
        try {
          durationSec = Math.floor(await readYouTubeDuration(next.videoId));
          durationCacheRef.current.set(next.videoId, durationSec);
        } catch {
          durationSec = 0;
        }
      }
      if (durationSec > MAX_DURATION_SEC) {
        patch(next.key, {
          status: 'error',
          durationSec,
          error: `Too long — ${Math.floor(MAX_DURATION_SEC / 60)} min max.`,
        });
        return;
      }
      patch(next.key, { durationSec });

      if (isPro) {
        if (!durationSec) {
          patch(next.key, { status: 'error', error: 'Couldn’t read this video.' });
          return;
        }
        const target = await resolveInboxTarget();
        const res = await fetch(
          `/api/notebooks/${encodeURIComponent(target.notebookId)}/video-import`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sectionId: target.sectionId,
              fileName: next.title.slice(0, 200),
              videoUrl: next.url,
              durationSec,
              pageTitle: next.title.slice(0, 200),
            }),
          },
        );
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success || !json.data?.jobId) {
          if (res.status === 429 && /too many/i.test(json?.error ?? '')) {
            cooldownUntilRef.current = Date.now() + 8000;
            patch(next.key, { status: 'queued' });
            scheduleRetry(8000);
            return;
          }
          patch(next.key, { status: 'error', error: json?.error ?? 'Could not start that video.' });
          return;
        }
        // Stays 'processing'; the poll below carries it to ready/error.
        patch(next.key, { status: 'processing', jobId: json.data.jobId as string });
      } else {
        const res = await fetch('/api/learn/documents/youtube', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: next.url }),
        });
        const json = await res.json().catch(() => null);
        if (res.status === 422) {
          patch(next.key, { status: 'error', error: 'No captions on this video.' });
          return;
        }
        if (!res.ok || !json?.success || !json.data?.document?.id) {
          if (res.status === 429 && /too many/i.test(json?.error ?? '')) {
            cooldownUntilRef.current = Date.now() + 8000;
            patch(next.key, { status: 'queued' });
            scheduleRetry(8000);
            return;
          }
          patch(next.key, { status: 'error', error: json?.error ?? 'Could not read that video.' });
          return;
        }
        patch(next.key, { status: 'ready', materialId: json.data.document.id as string });
      }
      loadUsage();
    } catch {
      patch(next.key, { status: 'error', error: 'Something went wrong. Remove and retry.' });
    } finally {
      processingRef.current = false;
    }
  }, [isPro, patch, resolveInboxTarget, loadUsage, scheduleRetry]);

  // Keep the latest processNext reachable from the (stable) retry scheduler.
  React.useEffect(() => {
    processNextRef.current = processNext;
  }, [processNext]);

  // Kick the queue whenever something is waiting and nothing is in flight.
  React.useEffect(() => {
    if (!processingRef.current && videos.some((v) => v.status === 'queued')) {
      void processNext();
    }
  }, [videos, processNext]);

  // ── Native lane: poll job status until every in-flight video resolves ───────
  const hasNativeInFlight = videos.some(
    (v) => v.lane === 'native' && v.status === 'processing' && v.jobId,
  );
  React.useEffect(() => {
    if (!hasNativeInFlight) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const target = inboxRef.current ?? (await resolveInboxTarget().catch(() => null));
        if (cancelled || !target) return;
        const res = await fetch(
          `/api/notebooks/${encodeURIComponent(target.notebookId)}/video-import`,
        );
        const json = await res.json().catch(() => null);
        if (cancelled || !json?.success || !Array.isArray(json.data)) return;
        const byId = new Map<
          string,
          { status: string; resultPageId: string | null; error: string | null }
        >();
        for (const row of json.data) byId.set(row.id, row);

        let changed = false;
        const nextList = videosRef.current.map((v) => {
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
          setVideos(nextList);
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
  }, [hasNativeInFlight, resolveInboxTarget, loadUsage, setVideos]);

  // ── Derived meter values ───────────────────────────────────────────────────
  const limit = usage?.limit ?? null;
  const unlimited = limit === -1;
  const loaded = limit !== null;

  // What this session's videos cost the budget (meter unit). Free = 1 per video
  // (count meter); PRO = minutes. Errored videos are refunded, so they don't
  // count.
  const costOf = (v: AddedVideo) =>
    v.status === 'error' ? 0 : isPro ? minutesForDuration(v.durationSec) : 1;
  const delta = videos.reduce((sum, v) => sum + costOf(v), 0);
  const baseline = baselineRef.current;
  const liveRemaining =
    limit !== null && !unlimited ? Math.max(0, limit - (usage?.used ?? 0)) : null;
  const heroValue =
    baseline !== null ? Math.max(0, baseline - delta) : (liveRemaining ?? 0);

  const queuedCount = videos.filter((v) => v.status === 'queued').length;
  const processingCount = videos.filter((v) => v.status === 'processing').length;
  const draftCount = parseYouTubeLinks(draft).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <LimitReader
        isPro={isPro}
        loaded={loaded}
        unlimited={unlimited}
        limit={limit}
        heroValue={heroValue}
        delta={delta}
      />

      {/* Batch input — paste one or many links */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            // ⌘/Ctrl+Enter adds without reaching for the mouse.
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              addDraft();
            }
          }}
          rows={3}
          placeholder={'Paste YouTube links — one per line'}
          aria-label="YouTube links"
          className="vmp-textarea"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--ink-20, var(--outline-variant))',
            background: 'var(--surface-container-high)',
            color: 'var(--on-surface)',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--fs-sm)',
            lineHeight: 1.6,
            resize: 'vertical',
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={addDraft}
          disabled={draftCount === 0}
          className="vmp-add"
        >
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>
            playlist_add
          </span>
          {draftCount > 1
            ? `Add ${draftCount} videos`
            : draftCount === 1
              ? 'Add video'
              : 'Add videos'}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          style={{
            margin: 0,
            padding: '8px 12px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(253,111,133,0.12)',
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
          {videos.map((v, i) => (
            <VideoRow
              key={v.key}
              video={v}
              index={i}
              onRemove={() => removeVideo(v.key)}
            />
          ))}
        </ul>
      )}

      {queuedCount + processingCount > 0 && (
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
          {isPro
            ? `Working through your list — ${processingCount + queuedCount} to go. This keeps running in the background.`
            : `Transcribing your list — ${processingCount + queuedCount} to go.`}
        </p>
      )}

      <VideoPickerStyles />
    </div>
  );
}

// ── Limit reader — projected budget after this session's videos ───────────────

function LimitReader({
  isPro,
  loaded,
  unlimited,
  limit,
  heroValue,
  delta,
}: {
  isPro: boolean;
  loaded: boolean;
  unlimited: boolean;
  limit: number | null;
  heroValue: number;
  delta: number;
}) {
  const unitFor = (n: number) => (isPro ? 'min' : n === 1 ? 'video' : 'videos');
  const noun = isPro ? 'video minutes' : 'video transcripts';

  const empty = loaded && !unlimited && heroValue <= 0;
  const heroColor = empty ? 'var(--error)' : 'var(--accent-strong, var(--primary))';
  const deltaBg = empty ? 'rgba(253,111,133,0.14)' : 'rgba(140,82,255,0.14)';
  const labelText = delta > 0 ? 'left after upload' : isPro ? 'left this month' : 'left';

  // Bar mirrors the projection: filled = limit − projected.
  const barUsed = limit !== null ? Math.min(limit, Math.max(0, limit - heroValue)) : 0;
  const pct = limit && limit > 0 && !unlimited ? Math.min(100, Math.round((barUsed / limit) * 100)) : 0;

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
      {/* Header */}
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

      {/* Hero — projected balance, big + coloured, with the subtraction */}
      {!loaded ? (
        <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--on-surface-variant)' }}>
          Checking your balance…
        </span>
      ) : unlimited ? (
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
            {heroValue}
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
                color: heroColor,
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
      {loaded && !unlimited && limit !== null && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={barUsed}
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

// ── One row in the added-videos list ──────────────────────────────────────────

function VideoRow({
  video,
  index,
  onRemove,
}: {
  video: AddedVideo;
  index: number;
  onRemove: () => void;
}) {
  const statusColor =
    video.status === 'ready'
      ? 'var(--success, #4ade80)'
      : video.status === 'error'
        ? 'var(--error)'
        : video.status === 'queued'
          ? 'var(--on-surface-variant)'
          : 'var(--accent-strong, var(--primary))';
  const statusIcon =
    video.status === 'ready'
      ? 'check_circle'
      : video.status === 'error'
        ? 'error'
        : video.status === 'queued'
          ? 'schedule'
          : 'progress_activity';

  const subline =
    video.status === 'error'
      ? video.error || 'Could not process this video.'
      : video.status === 'queued'
        ? 'Waiting…'
        : video.status === 'processing'
          ? video.lane === 'native'
            ? `Generating notes${video.durationSec ? ` · ${formatDuration(video.durationSec)}` : ''}`
            : `Reading transcript${video.durationSec ? ` · ${formatDuration(video.durationSec)}` : ''}`
          : video.durationSec
            ? formatDuration(video.durationSec)
            : video.lane === 'transcript'
              ? 'Transcript added'
              : 'Notes added';

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
        aria-hidden
        style={{
          flexShrink: 0,
          width: 22,
          textAlign: 'center',
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--fs-xs)',
          fontWeight: 700,
          color: 'var(--on-surface-variant)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {index + 1}
      </span>
      <span
        className="material-symbols-outlined"
        aria-hidden
        style={{
          fontSize: 18,
          flexShrink: 0,
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
          {subline}
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

// ── Scoped styles ─────────────────────────────────────────────────────────────

function VideoPickerStyles() {
  return (
    <style>{`
      @keyframes vmpSpin { to { transform: rotate(360deg); } }
      .vmp-textarea:focus { border-color: var(--accent-strong, var(--primary)) !important; }
      .vmp-add {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        align-self: flex-start;
        padding: 9px 16px;
        border-radius: var(--radius-full);
        border: 1px solid transparent;
        background: var(--accent-strong, var(--primary));
        color: var(--on-primary, #fff);
        font-family: var(--font-sans);
        font-size: var(--fs-sm);
        font-weight: 700;
        cursor: pointer;
        transition: transform var(--dur-fast, 0.16s) var(--ease-spring, cubic-bezier(0.22,1,0.36,1)),
          opacity var(--dur-fast, 0.16s) var(--ease-spring, cubic-bezier(0.22,1,0.36,1));
      }
      .vmp-add:hover:not(:disabled) { transform: translateY(-1px); }
      .vmp-add:active:not(:disabled) { transform: translateY(0); opacity: 0.9; }
      .vmp-add:focus-visible { outline: 3px solid var(--accent-strong, var(--primary)); outline-offset: 2px; }
      .vmp-add:disabled { opacity: 0.5; cursor: not-allowed; }
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
        .vmp-add, .vmp-remove { transition-duration: 0.05s; }
        [style*="vmpSpin"] { animation: none !important; }
      }
    `}</style>
  );
}
