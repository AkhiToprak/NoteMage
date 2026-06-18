/* Hallmark · component: video-material-picker · genre: playful · theme: project (Neon Scholar tokens)
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass (light + dark via semantic tokens)
 * pre-emit critique: P5 H4 E4 S4 R4 V4
 */
'use client';

import * as React from 'react';
import VideoInputMask, { type VideoUrlConfirm } from '@/components/video/VideoInputMask';
import { readYouTubeDuration } from '@/lib/youtube-duration';

// ── Public types ──────────────────────────────────────────────────────────────

/** One YouTube video the user has *queued* as study-pack material. Nothing is
 *  transcribed here — the wizard's Build/Continue step does that. Lives in
 *  WizardState so it survives step navigation; the picker is controlled. */
export interface AddedVideo {
  key: string;
  videoId: string;
  url: string;
  title: string;
  durationSec: number;
  /** Set by the ingest step once transcribed, so re-running skips it. */
  docId?: string;
}

interface UsageEntry {
  used: number;
  limit: number;
}

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

// ── Component ─────────────────────────────────────────────────────────────────

interface VideoMaterialPickerProps {
  videos: AddedVideo[];
  onChange: (videos: AddedVideo[]) => void;
}

export default function VideoMaterialPicker({ videos, onChange }: VideoMaterialPickerProps) {
  const [error, setError] = React.useState<string | null>(null);
  const [usage, setUsage] = React.useState<UsageEntry | null>(null);
  // Balance before this session's videos — the baseline the projection subtracts
  // from. Captured once on the first usage load.
  const [baseline, setBaseline] = React.useState<number | null>(null);

  // Standing transcript balance — drives the "videos left" reader.
  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/user/usage')
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.success) return;
        const features = j.data?.features as
          | Array<{ featureType: string; used: number; limit: number }>
          | undefined;
        const entry = features?.find((f) => f.featureType === 'youtube_transcript');
        if (entry) {
          setUsage({ used: entry.used, limit: entry.limit });
          if (entry.limit !== -1) {
            setBaseline((prev) => (prev === null ? Math.max(0, entry.limit - entry.used) : prev));
          }
        }
      })
      .catch(() => {
        /* soft-fail — the picker still works without the balance line */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Add a video to the list — read its length for the row + budget, no ingest.
  const onConfirmUrl = React.useCallback(
    async (confirm: VideoUrlConfirm) => {
      setError(null);
      if (videos.some((v) => v.videoId === confirm.videoId)) {
        setError('That video is already in your list.');
        return;
      }
      let durationSec = 0;
      try {
        durationSec = Math.floor(await readYouTubeDuration(confirm.videoId));
      } catch {
        durationSec = 0; // length unknown — still addable (informational only)
      }
      onChange([
        ...videos,
        {
          key: `yt_${confirm.videoId}`,
          videoId: confirm.videoId,
          url: confirm.url,
          title: confirm.title?.trim() || 'YouTube video',
          durationSec,
        },
      ]);
    },
    [onChange, videos],
  );

  const removeVideo = React.useCallback(
    (key: string) => onChange(videos.filter((v) => v.key !== key)),
    [onChange, videos],
  );

  const limit = usage?.limit ?? null;
  const unlimited = limit === -1;
  const loaded = limit !== null;
  const liveRemaining =
    limit !== null && !unlimited ? Math.max(0, limit - (usage?.used ?? 0)) : null;
  // Only not-yet-transcribed videos project against the budget — once a video
  // has a docId it's already counted in `used` (so baseline already reflects it).
  const pending = videos.filter((v) => !v.docId);
  const delta = pending.length; // each video = one transcript
  const heroValue = baseline !== null ? Math.max(0, baseline - delta) : (liveRemaining ?? 0);
  const totalMinutes = pending.reduce((s, v) => s + Math.round(v.durationSec / 60), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <LimitReader
        loaded={loaded}
        unlimited={unlimited}
        limit={limit}
        heroValue={heroValue}
        delta={delta}
        totalMinutes={totalMinutes}
      />

      <VideoInputMask
        onConfirmUrl={onConfirmUrl}
        dense
        placeholder="Paste a YouTube link"
      />

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
          {videos.map((v) => (
            <li
              key={v.key}
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
                style={{ fontSize: 18, flexShrink: 0, color: 'var(--accent-strong, var(--primary))' }}
              >
                smart_display
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
                  title={v.title}
                >
                  {v.title}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 'var(--fs-xs)', color: 'var(--on-surface-variant)' }}>
                  {v.durationSec ? formatDuration(v.durationSec) : 'YouTube video'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeVideo(v.key)}
                aria-label={`Remove ${v.title}`}
                className="vmp-remove"
              >
                <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>
                  close
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <VideoPickerStyles />
    </div>
  );
}

// ── Limit reader — projected "videos left after upload" ───────────────────────

function LimitReader({
  loaded,
  unlimited,
  limit,
  heroValue,
  delta,
  totalMinutes,
}: {
  loaded: boolean;
  unlimited: boolean;
  limit: number | null;
  heroValue: number;
  delta: number;
  totalMinutes: number;
}) {
  const unit = (n: number) => (n === 1 ? 'video' : 'videos');
  const empty = loaded && !unlimited && heroValue <= 0;
  const heroColor = empty ? 'var(--error)' : 'var(--accent-strong, var(--primary))';
  const labelText = delta > 0 ? 'left after upload' : 'left';
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
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-base)', fontWeight: 700, color: heroColor }}>
            {unit(heroValue)}
          </span>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-sm)', fontWeight: 500, color: 'var(--on-surface-variant)' }}>
            {labelText}
          </span>
          {delta > 0 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                background: empty ? 'rgba(253,111,133,0.14)' : 'rgba(140,82,255,0.14)',
                color: heroColor,
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--fs-xs)',
                fontWeight: 800,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              −{delta} {unit(delta)}
            </span>
          )}
        </div>
      )}

      {loaded && !unlimited && limit !== null && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={barUsed}
          aria-label="video transcripts used"
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

      <p style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
        {delta > 0
          ? `${delta} ${unit(delta)} queued${totalMinutes > 0 ? ` · ${totalMinutes} min of video` : ''}`
          : 'Captions become source material for your pack.'}
      </p>
    </div>
  );
}

function VideoPickerStyles() {
  return (
    <style>{`
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
      @media (prefers-reduced-motion: reduce) { .vmp-remove { transition-duration: 0.05s; } }
    `}</style>
  );
}
