'use client';

interface MarketingHeroBackdropProps {
  /** Render the four twinkling sparkles. Default true. */
  sparkles?: boolean;
  /** Purple wash background (rgba string). */
  wash?: string;
  /** Grain overlay opacity. */
  grainOpacity?: number;
}

const SPARKLES = [
  { top: '26%', left: '14%', size: 16, delay: '0s' },
  { top: '68%', left: '10%', size: 12, delay: '1.4s' },
  { top: '30%', left: '84%', size: 18, delay: '0.8s' },
  { top: '74%', left: '86%', size: 14, delay: '2.2s' },
];

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/**
 * Shared marketing-hero backdrop: a purple wash, a grain overlay, and optional
 * twinkling sparkles. Replaces the copy-pasted backdrop on the about / contact /
 * legal heroes so the reduced-motion handling lives in exactly one place.
 * Render inside a `position: relative` hero section.
 */
export default function MarketingHeroBackdrop({
  sparkles = true,
  wash = 'rgba(140, 82, 255, 0.16)',
  grainOpacity = 0.05,
}: MarketingHeroBackdropProps) {
  return (
    <>
      <div
        aria-hidden
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: wash }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          opacity: grainOpacity,
          mixBlendMode: 'overlay',
          backgroundImage: GRAIN,
        }}
      />
      {sparkles &&
        SPARKLES.map((s, i) => (
          <div
            key={i}
            aria-hidden
            className="nm-hero-sparkle"
            style={{
              position: 'absolute',
              top: s.top,
              left: s.left,
              width: s.size,
              height: s.size,
              animationDelay: s.delay,
              pointerEvents: 'none',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M12 0 L13.5 10.5 L24 12 L13.5 13.5 L12 24 L10.5 13.5 L0 12 L10.5 10.5 Z"
                style={{ fill: 'var(--brand-gold)' }}
              />
            </svg>
          </div>
        ))}

      <style jsx>{`
        .nm-hero-sparkle {
          animation: nm-hero-twinkle 3.6s ease-in-out infinite;
        }
        @keyframes nm-hero-twinkle {
          0%,
          100% {
            opacity: 0.25;
            transform: scale(0.9);
          }
          50% {
            opacity: 1;
            transform: scale(1.15);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .nm-hero-sparkle {
            animation: none;
            opacity: 0.5;
          }
        }
      `}</style>
    </>
  );
}
