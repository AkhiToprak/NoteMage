'use client';

// Source-highlighting feature — video pane. Embeds the YouTube source seeked to
// the cited timestamp, then shows the transcript with the cited line highlighted
// (or the quote block). Uploaded (non-YouTube) videos have no durable playable
// file — those degrade to "cited moment + transcript", no broken player.

import type { ResolvedSource } from '@/lib/source-anchor';
import { youtubeEmbedUrl, formatTimestamp } from '@/lib/source-anchor';
import HighlightedText from './HighlightedText';
import SourceQuote from './SourceQuote';

const CAPTION: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--on-surface-variant)',
  marginBottom: '10px',
};

export default function SourceVideoPane({ source }: { source: ResolvedSource }) {
  const embed = youtubeEmbedUrl(source.videoUrl, source.timestampSec);
  const ts = source.timestampSec != null ? formatTimestamp(source.timestampSec) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {embed ? (
        <div
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '16 / 9',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            border: '1px solid var(--quiz-card-border)',
            background: '#000',
          }}
        >
          <iframe
            title={source.title}
            src={embed}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
          />
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 14px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--quiz-card-border)',
            background: 'var(--quiz-card)',
            color: 'var(--on-surface-variant)',
            fontSize: '13px',
            lineHeight: 1.5,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20, flexShrink: 0 }} aria-hidden>
            videocam_off
          </span>
          <span>
            This source is an uploaded video — inline playback isn&apos;t available
            {ts ? <>, but the passage below is cited at <strong>{ts}</strong></> : null}.
          </span>
        </div>
      )}

      {embed && ts ? (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            alignSelf: 'flex-start',
            padding: '5px 11px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--nm-primary-light)',
            color: 'var(--nm-primary-on-light)',
            fontSize: '12px',
            fontWeight: 700,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>
            play_circle
          </span>
          Cited at {ts}
        </span>
      ) : null}

      {source.textContent ? (
        <div>
          <span style={CAPTION}>Transcript</span>
          <HighlightedText text={source.textContent} quote={source.quote} />
        </div>
      ) : (
        <SourceQuote quote={source.quote} />
      )}
    </div>
  );
}
