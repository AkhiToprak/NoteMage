import type { CSSProperties } from 'react';
import { isSubjectId, type SubjectId } from '@/lib/path-subjects';

/* Illustrated subject icon. Each path's primary subject maps to a custom
   raster tile in /public/subjects — the colored tile + 3D art is baked into
   the image. Keyed off the canonical SubjectId (the single source of truth
   that replaces the per-screen keyword matchers, which never matched ids like
   `science_natural` or `coding` and silently fell back to a generic glyph). */

/** First subject wins; anything unrecognized or empty resolves to `general`. */
function resolveSubjectId(subjects?: string[] | null): SubjectId {
  const first = subjects?.[0]?.toLowerCase().trim();
  return first && isSubjectId(first) ? first : 'general';
}

export function SubjectIcon({
  subjects,
  size = 46,
  radius = 13,
  className,
  style,
}: {
  /** The path's subjects (canonical SubjectId strings); the first one is used. */
  subjects?: string[] | null;
  /** Rendered square size in px. */
  size?: number;
  /** Corner radius — match the surface the icon sits in. */
  radius?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const id = resolveSubjectId(subjects);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/subjects/${id}.png`}
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={className}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        flexShrink: 0,
        borderRadius: radius,
        display: 'block',
        ...style,
      }}
    />
  );
}
