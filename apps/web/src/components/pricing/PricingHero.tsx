'use client';

import { useEffect, useState } from 'react';

export default function PricingHero() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section
      className="pricing-hero"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        padding: '140px 40px 48px',
        textAlign: 'center',
      }}
    >
      {/* ── Aurora gradient mesh ── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        <div
          className="aurora-orb-1"
          style={{
            position: 'absolute',
            width: 900,
            height: 900,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(174,137,255,0.1) 0%, transparent 70%)',
            top: '-20%',
            left: '50%',
            transform: 'translateX(-50%)',
            filter: 'blur(60px)',
          }}
        />
        <div
          className="aurora-orb-2"
          style={{
            position: 'absolute',
            width: 500,
            height: 500,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(185,195,255,0.06) 0%, transparent 70%)',
            top: '50%',
            right: '5%',
            filter: 'blur(40px)',
          }}
        />
        <div
          className="aurora-orb-3"
          style={{
            position: 'absolute',
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,222,89,0.04) 0%, transparent 70%)',
            bottom: '5%',
            left: '10%',
            filter: 'blur(50px)',
          }}
        />
      </div>

      {/* Just "Pricing" — large and clean */}
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(48px, 7vw, 80px)',
          fontWeight: 800,
          letterSpacing: '-0.03em',
          lineHeight: 1,
          color: 'var(--on-surface)',
          position: 'relative',
          zIndex: 1,
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(16px)',
          transition:
            'opacity 0.6s cubic-bezier(0.22,1,0.36,1), transform 0.6s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        Pricing
      </h1>
    </section>
  );
}
