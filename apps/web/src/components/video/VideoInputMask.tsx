/* Hallmark · component: video-input-mask · genre: modern-minimal · theme: project (Neon Scholar tokens)
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass (light + dark via semantic tokens)
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import VideoImportMascot from './VideoImportMascot';

// Inlined client-side video-id extraction (mirrors `extractVideoId` in
// `@/lib/youtube`). Kept local so this client component does not pull the
// `youtube-transcript` server dependency into the browser bundle.
const VIDEO_ID_PATTERNS = [
  /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
  /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
];

function extractVideoId(url: string): string | null {
  for (const pattern of VIDEO_ID_PATTERNS) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Shared video input mask (plan § "Video input mask — shared UI spec").
//
// One unified zone that, in V1 (P1), accepts a pasted YouTube URL and swaps
// into a live preview card the instant `extractVideoId` matches. Reused by the
// chat attach flow and the path material picker now; `VideoImportTab` (P4)
// adopts it for the file-upload lane.
//
// The FILE LANE is designed-but-disabled here: the prop surface (`allowFile`,
// `onFilePicked`, `fileEstimate`) is JSDoc-documented so the P4 agent can light
// it up without reworking the component. Only the URL lane is functional in P1.
// ─────────────────────────────────────────────────────────────────────────

const SPRING = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Outcome handed back to the parent when the user confirms a URL. */
export interface VideoUrlConfirm {
  /** The pasted, validated YouTube URL. */
  url: string;
  /** The 11-char video id `extractVideoId` resolved. */
  videoId: string;
  /** oEmbed title if it loaded in time, else null. */
  title: string | null;
}

export interface VideoInputMaskProps {
  /**
   * Confirm handler for the URL lane. The parent performs the actual ingest
   * (calls the youtube route, PATCHes context, etc.). Resolve the returned
   * promise to let the mask reset; reject (throw) to surface a generic error.
   * To show the captionless upsell INSIDE the card instead, throw an error
   * whose `.name === 'CaptionsUnavailable'` (see `captionsUnavailableError`).
   */
  onConfirmUrl: (confirm: VideoUrlConfirm) => Promise<void>;

  /**
   * Optional captionless-handoff action (Lane 2 / native video notes, P3+P4).
   * When provided, the in-card 422 state renders an upsell button wired to it.
   * Omit to render the upsell copy without an action (P1 default until Lane 2
   * ships).
   */
  onGenerateNotes?: (confirm: VideoUrlConfirm) => void;

  /** Disable all interaction (e.g. while the parent is busy elsewhere). */
  disabled?: boolean;

  /** Compact paddings for tight surfaces (chat attach panel). Default false. */
  dense?: boolean;

  /** Placeholder for the URL field. Terse default. */
  placeholder?: string;

  // ── File lane (P4 — designed, not wired in P1) ─────────────────────────
  /**
   * P4: enable the drag/drop + file-pick lane alongside the URL lane. When
   * false (P1 default) the component is URL-only and renders no drop zone.
   */
  allowFile?: boolean;
  /**
   * P4: called when a video file is dropped/picked and passes client-side
   * MIME + size validation. The parent owns the upload + job creation.
   */
  onFilePicked?: (file: File) => void;
  /**
   * P4: render slot under a picked file — estimated minutes + remaining
   * `video_ingest` balance. The component does not compute these; the parent
   * (which knows the user's meter) supplies the node.
   */
  fileEstimate?: React.ReactNode;
  /**
   * P4: max upload bytes for client-side reject (server cap is authoritative).
   * Only consulted when `allowFile` is true.
   */
  maxFileBytes?: number;
}

/**
 * Throw this from `onConfirmUrl` to render the captionless upsell inside the
 * preview card (the Lane-1 → Lane-2 handoff seam). The route returns a 422 for
 * captionless videos; the parent maps that to this error.
 */
export function captionsUnavailableError(): Error {
  const err = new Error('Captions unavailable');
  err.name = 'CaptionsUnavailable';
  return err;
}

type CardPhase = 'idle' | 'loading' | 'ready' | 'confirming' | 'no-captions' | 'error';

export default function VideoInputMask({
  onConfirmUrl,
  onGenerateNotes,
  disabled = false,
  dense = false,
  placeholder = 'Paste a YouTube link',
  allowFile = false,
  onFilePicked,
  fileEstimate,
  maxFileBytes,
}: VideoInputMaskProps) {
  const [raw, setRaw] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState<string | null>(null);
  const [thumbLoaded, setThumbLoaded] = useState(false);
  const [phase, setPhase] = useState<CardPhase>('idle');
  const [inlineError, setInlineError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Resolve a candidate URL string into a preview card (or an inline error).
  const tryResolve = useCallback((candidate: string) => {
    const trimmed = candidate.trim();
    if (!trimmed) {
      setInlineError(null);
      return;
    }
    const id = extractVideoId(trimmed);
    if (!id) {
      setInlineError('Only YouTube links for now.');
      return;
    }
    setInlineError(null);
    setUrl(trimmed);
    setVideoId(id);
    setTitle(null);
    setThumbLoaded(false);
    setPhase('loading');
  }, []);

  // oEmbed title fetch — fired when a fresh videoId resolves. YouTube oEmbed is
  // CORS-open, so this is a safe client call; the field stays usable while it
  // loads and falls back to the bare card if it fails.
  useEffect(() => {
    if (!videoId || !url) return;
    let cancelled = false;
    const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    fetch(oembed)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setTitle(typeof data?.title === 'string' ? data.title : null);
        setPhase('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setPhase('ready');
      });
    return () => {
      cancelled = true;
    };
  }, [videoId, url]);

  const reset = useCallback(() => {
    setRaw('');
    setUrl('');
    setVideoId(null);
    setTitle(null);
    setThumbLoaded(false);
    setPhase('idle');
    setInlineError(null);
    inputRef.current?.focus();
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = e.clipboardData.getData('text');
      if (pasted) {
        // Resolve immediately on paste (not on blur) per the spec.
        e.preventDefault();
        setRaw(pasted);
        tryResolve(pasted);
      }
    },
    [tryResolve],
  );

  const confirmPayload = useCallback(
    (): VideoUrlConfirm | null =>
      videoId ? { url, videoId, title } : null,
    [url, videoId, title],
  );

  const handleConfirm = useCallback(async () => {
    const payload = confirmPayload();
    if (!payload || disabled || phase === 'confirming') return;
    setPhase('confirming');
    setInlineError(null);
    try {
      await onConfirmUrl(payload);
      reset();
    } catch (err) {
      if (err instanceof Error && err.name === 'CaptionsUnavailable') {
        setPhase('no-captions');
        return;
      }
      setPhase('error');
      setInlineError("Couldn't read this video.");
    }
  }, [confirmPayload, disabled, phase, onConfirmUrl, reset]);

  const handleGenerateNotes = useCallback(() => {
    const payload = confirmPayload();
    if (payload) onGenerateNotes?.(payload);
  }, [confirmPayload, onGenerateNotes]);

  // ── File lane (P4) — validate + forward; no preview wiring in P1 ─────────
  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file || !allowFile) return;
      if (!file.type.startsWith('video/')) {
        setInlineError('Not a video file.');
        return;
      }
      if (maxFileBytes && file.size > maxFileBytes) {
        setInlineError('Too large — 50MB max.');
        return;
      }
      setInlineError(null);
      onFilePicked?.(file);
    },
    [allowFile, maxFileBytes, onFilePicked],
  );

  const showCard = phase !== 'idle' && videoId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
      {!showCard ? (
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: `${dense ? '8px' : '10px'} 12px`,
            borderRadius: 'var(--radius-md)',
            border: `1px solid ${inlineError ? 'var(--error)' : 'var(--outline-variant)'}`,
            background: 'var(--surface-container-high)',
            opacity: disabled ? 0.6 : 1,
            transition: `border-color 0.2s ${SPRING}`,
          }}
        >
          <span
            className="material-symbols-outlined"
            aria-hidden
            style={{ fontSize: '20px', color: 'var(--on-surface-variant)', flexShrink: 0 }}
          >
            smart_display
          </span>
          <input
            ref={inputRef}
            type="url"
            inputMode="url"
            value={raw}
            disabled={disabled}
            placeholder={placeholder}
            aria-label="YouTube link"
            onPaste={handlePaste}
            onChange={(e) => {
              setRaw(e.target.value);
              if (inlineError) setInlineError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                tryResolve(raw);
              }
            }}
            onBlur={() => {
              // Resolve a typed (not pasted) URL when the user moves on.
              if (raw.trim() && !videoId) tryResolve(raw);
            }}
            style={{
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: '14px',
              fontFamily: 'inherit',
              color: 'var(--on-surface)',
            }}
          />
          {allowFile ? (
            <FilePickButton disabled={disabled} maxFileBytes={maxFileBytes} onFile={handleFile} />
          ) : null}
        </label>
      ) : (
        <VideoSourceCard
          videoId={videoId!}
          title={title}
          thumbLoaded={thumbLoaded}
          onThumbLoad={() => setThumbLoaded(true)}
          phase={phase}
          dense={dense}
          disabled={disabled}
          onConfirm={handleConfirm}
          onRemove={reset}
          hasNotesAction={Boolean(onGenerateNotes)}
          onGenerateNotes={handleGenerateNotes}
        />
      )}

      {fileEstimate ? <div>{fileEstimate}</div> : null}

      {inlineError && phase !== 'no-captions' ? (
        <p
          role="alert"
          style={{ margin: 0, fontSize: '12px', color: 'var(--error)', paddingLeft: '4px' }}
        >
          {inlineError}
        </p>
      ) : null}

      <style>{`
        @keyframes vimSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes vimPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
        .vim-skeleton { animation: vimPulse 1.5s ${SPRING} infinite; }
        .vim-btn { transition: transform 0.2s ${SPRING}, opacity 0.2s ${SPRING}; }
        .vim-btn:hover:not(:disabled) { transform: translateY(-1px); }
        .vim-btn:active:not(:disabled) { transform: translateY(0); opacity: 0.9; }
        .vim-btn:focus-visible { outline: 3px solid var(--primary); outline-offset: 2px; }
        .vim-icon-btn { transition: transform 0.2s ${SPRING}, opacity 0.2s ${SPRING}; }
        .vim-icon-btn:hover:not(:disabled) { opacity: 0.7; }
        .vim-icon-btn:active:not(:disabled) { transform: scale(0.92); }
        .vim-icon-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) {
          .vim-btn, .vim-icon-btn { transition: none; }
          .vim-btn:hover, .vim-btn:active, .vim-icon-btn:hover, .vim-icon-btn:active { transform: none; }
          .vim-skeleton { animation: none; opacity: 0.75; }
        }
      `}</style>
    </div>
  );
}

/** P4 file-pick affordance — a small button that opens a hidden file input. */
function FilePickButton({
  disabled,
  maxFileBytes,
  onFile,
}: {
  disabled: boolean;
  maxFileBytes?: number;
  onFile: (file: File | undefined) => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <button
        type="button"
        className="vim-icon-btn"
        disabled={disabled}
        aria-label="Upload a video file"
        onClick={() => ref.current?.click()}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--on-surface-variant)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          padding: '4px',
          display: 'flex',
          flexShrink: 0,
        }}
      >
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '20px' }}>
          upload_file
        </span>
      </button>
      <input
        ref={ref}
        type="file"
        accept="video/*"
        aria-label="Video file"
        style={{ display: 'none' }}
        data-max-bytes={maxFileBytes}
        onChange={(e) => onFile(e.target.files?.[0])}
      />
    </>
  );
}

interface VideoSourceCardProps {
  videoId: string;
  title: string | null;
  thumbLoaded: boolean;
  onThumbLoad: () => void;
  phase: CardPhase;
  dense: boolean;
  disabled: boolean;
  onConfirm: () => void;
  onRemove: () => void;
  hasNotesAction: boolean;
  onGenerateNotes: () => void;
}

/**
 * The preview card the URL field swaps into. Rounded 16:9 thumbnail, oEmbed
 * title, play glyph, remove affordance, and the captionless upsell rendered
 * inline (never a toast). Exported so other surfaces can render a card preview
 * directly if needed.
 */
export function VideoSourceCard({
  videoId,
  title,
  thumbLoaded,
  onThumbLoad,
  phase,
  dense,
  disabled,
  onConfirm,
  onRemove,
  hasNotesAction,
  onGenerateNotes,
}: VideoSourceCardProps) {
  const loadingTitle = phase === 'loading';
  const noCaptions = phase === 'no-captions';
  const confirming = phase === 'confirming';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--outline-variant)',
        background: 'var(--surface-container)',
        overflow: 'hidden',
        boxShadow: '0 8px 24px rgba(0,0,0,0.18), 0 1px 0 rgba(174,137,255,0.06)',
        opacity: disabled ? 0.7 : 1,
      }}
    >
      {/* Thumbnail */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          background: 'var(--surface-container-high)',
          overflow: 'hidden',
        }}
      >
        {!thumbLoaded ? (
          <div
            aria-hidden
            className="vim-skeleton"
            style={{ position: 'absolute', inset: 0, background: 'var(--surface-container-high)' }}
          />
        ) : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
          alt={title ?? 'Video thumbnail'}
          onLoad={onThumbLoad}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            objectFit: 'cover',
            opacity: thumbLoaded ? 1 : 0,
            transition: `opacity 0.3s ${SPRING}`,
          }}
        />
        {/* Play glyph over a solid scrim (no gradient) */}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '44px',
            height: '44px',
            borderRadius: 'var(--radius-full)',
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            className="material-symbols-outlined filled"
            style={{ fontSize: '26px', color: '#ffffff' }}
          >
            play_arrow
          </span>
        </span>
        {/* Remove */}
        <button
          type="button"
          className="vim-icon-btn"
          aria-label="Remove video"
          disabled={disabled || confirming}
          onClick={onRemove}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            width: '28px',
            height: '28px',
            borderRadius: 'var(--radius-full)',
            background: 'rgba(0,0,0,0.6)',
            border: 'none',
            color: '#ffffff',
            cursor: disabled || confirming ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '18px' }}>
            close
          </span>
        </button>
      </div>

      {/* Meta + actions */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: dense ? '8px' : '10px',
          padding: dense ? '10px 12px' : '12px 14px',
        }}
      >
        {loadingTitle ? (
          <div
            aria-hidden
            className="vim-skeleton"
            style={{
              height: '14px',
              width: '70%',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-container-high)',
            }}
          />
        ) : (
          <span
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--on-surface)',
              lineHeight: 1.4,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {title ?? 'YouTube video'}
          </span>
        )}

        {noCaptions ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              padding: '8px 10px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface-container-high)',
              border: '1px solid var(--outline-variant)',
            }}
          >
            <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
              Captions unavailable — generate notes with PRO.
            </span>
            {hasNotesAction ? (
              <button
                type="button"
                className="vim-btn"
                onClick={onGenerateNotes}
                style={primaryBtnStyle}
              >
                <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '16px' }}>
                  workspace_premium
                </span>
                Generate notes
              </button>
            ) : null}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              justifyContent: confirming ? 'space-between' : 'flex-end',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {confirming ? <VideoImportMascot compact /> : null}
            <button
              type="button"
              className="vim-btn"
              disabled={disabled || loadingTitle || confirming}
              onClick={onConfirm}
              style={{
                ...primaryBtnStyle,
                cursor: disabled || loadingTitle || confirming ? 'wait' : 'pointer',
                opacity: disabled || loadingTitle ? 0.7 : 1,
              }}
            >
              {confirming ? (
                <span
                  className="material-symbols-outlined"
                  aria-hidden
                  style={{ fontSize: '16px', animation: 'vimSpin 0.8s linear infinite' }}
                >
                  progress_activity
                </span>
              ) : (
                <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '16px' }}>
                  add
                </span>
              )}
              {confirming ? 'Adding…' : 'Add transcript'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 14px',
  borderRadius: 'var(--radius-full)',
  border: 'none',
  background: 'var(--primary)',
  color: 'var(--on-primary)',
  fontSize: '13px',
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
};
