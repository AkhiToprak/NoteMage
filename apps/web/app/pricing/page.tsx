'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import PricingCard from '@/components/pricing/PricingCard';
import PricingHero from '@/components/pricing/PricingHero';
import FeatureComparison from '@/components/pricing/FeatureComparison';
import FAQ from '@/components/pricing/FAQ';
import { TIERS, type TierKey } from '@/lib/tiers';
import { useCurrency } from '@/hooks/useCurrency';
import { useScrollReveal } from '@/hooks/useScrollReveal';

export default function PricingPage() {
  const [scrolled, setScrolled] = useState(false);
  const { formatPrice } = useCurrency();
  const { ref: cardsRef, isRevealed: cardsRevealed } = useScrollReveal();
  const { ref: ctaRef, isRevealed: ctaRevealed } = useScrollReveal();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const tiers: { key: TierKey; ctaText: string }[] = [
    { key: 'FREE', ctaText: 'Get Started Free' },
    { key: 'PLUS', ctaText: 'Get Plus' },
    { key: 'PRO', ctaText: 'Get Pro' },
  ];

  return (
    <main
      style={{
        background: 'var(--background)',
        color: 'var(--on-surface)',
        minHeight: '100vh',
        overflowX: 'hidden',
      }}
    >
      {/* ── GLOBAL STYLES ── */}
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .nlink {
          color: var(--on-surface-variant);
          opacity: 0.62;
          font-size: 15px;
          font-weight: 500;
          text-decoration: none;
          transition: opacity 0.25s cubic-bezier(0.22,1,0.36,1);
        }
        .nlink:hover { opacity: 1; }

        .btn-cta-nav {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--tertiary-container);
          color: #22223a;
          font-weight: 700;
          font-size: 14px;
          padding: 9px 20px;
          border-radius: var(--radius-md);
          border: none;
          text-decoration: none;
          cursor: pointer;
          box-shadow: 0 2px 12px rgba(255,222,89,0.2);
          transition: transform 0.22s cubic-bezier(0.22,1,0.36,1), box-shadow 0.22s cubic-bezier(0.22,1,0.36,1);
        }
        .btn-cta-nav:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 24px rgba(255,222,89,0.3);
        }
        .btn-cta-nav:active { transform: translateY(0); }
        .btn-cta-nav:focus-visible {
          outline: 2px solid var(--tertiary-container);
          outline-offset: 3px;
        }

        .grain {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 999;
          opacity: 0.022;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='400' height='400' filter='url(%23n)'/%3E%3C/svg%3E");
        }

        /* Aurora blob keyframes — transform only for GPU compositing */
        @keyframes aurora-drift-1 {
          0%, 100% { transform: translateX(-50%) translate(0, 0); }
          33% { transform: translateX(-50%) translate(30px, -20px); }
          66% { transform: translateX(-50%) translate(-20px, 15px); }
        }
        @keyframes aurora-drift-2 {
          0%, 100% { transform: translate(0, 0); }
          33% { transform: translate(-25px, 20px); }
          66% { transform: translate(15px, -15px); }
        }
        @keyframes aurora-drift-3 {
          0%, 100% { transform: translate(0, 0); }
          33% { transform: translate(20px, 10px); }
          66% { transform: translate(-15px, -20px); }
        }
        .aurora-orb-1 { animation: aurora-drift-1 20s ease-in-out infinite; }
        .aurora-orb-2 { animation: aurora-drift-2 25s ease-in-out infinite; }
        .aurora-orb-3 { animation: aurora-drift-3 22s ease-in-out infinite; }

        /* Popular badge float */
        @keyframes badge-float {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(-3px); }
        }
        .popular-badge { animation: badge-float 3s ease-in-out infinite; }

        /* Comparison: desktop table visible, mobile hidden */
        .comparison-desktop { display: block; }
        .comparison-mobile { display: none; }

        /* Hover on comparison rows */
        .comparison-row:hover {
          background: rgba(174,137,255,0.04) !important;
        }

        /* CTA glow pulse */
        @keyframes cta-glow {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }

        /* ── Responsive: Tablet (768–1023px) ── */
        @media (min-width: 768px) and (max-width: 1023px) {
          .nav-links { display: none !important; }
          .pricing-nav { padding: 0 24px !important; }
          .pricing-hero { padding: 140px 24px 60px !important; }
          .pricing-cards-grid {
            flex-wrap: wrap !important;
            justify-content: center !important;
          }
          .pricing-cards-grid > * {
            flex: 0 0 calc(50% - 12px) !important;
            max-width: calc(50% - 12px) !important;
          }
          .pricing-cards-section { padding: 20px 24px 60px !important; }
          .comparison-section { padding: 60px 24px !important; }
          .social-proof-section { padding: 20px 24px 60px !important; }
        }

        /* ── Responsive: Phone (max-width 767px) ── */
        @media (max-width: 767px) {
          .nav-links { display: none !important; }
          .nav-auth { gap: 8px !important; }
          .pricing-nav { padding: 0 16px !important; }
          .pricing-hero { padding: 120px 16px 40px !important; }
          .pricing-cards-grid {
            flex-direction: column !important;
            align-items: center !important;
          }
          .pricing-cards-grid > * {
            width: 100% !important;
            max-width: 400px !important;
            transform: none !important;
          }
          .pricing-cards-section { padding: 20px 16px 40px !important; }
          .comparison-section { padding: 40px 16px !important; }
          .comparison-desktop { display: none !important; }
          .comparison-mobile { display: block !important; }
          .social-proof-section { padding: 20px 16px 40px !important; }
          .social-proof-grid {
            flex-direction: column !important;
          }
          .cta-banner { padding: 60px 16px !important; }
          .pricing-footer {
            padding: 28px 16px !important;
            flex-direction: column !important;
            text-align: center !important;
          }
        }

        /* Reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .aurora-orb-1, .aurora-orb-2, .aurora-orb-3,
          .popular-badge { animation: none !important; }
          * { transition-duration: 0.01ms !important; }
        }
      `}</style>

      {/* Grain */}
      <div className="grain" />

      {/* ── NAVBAR ── */}
      <nav
        className="pricing-nav"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          padding: '0 40px',
          height: 64,
          display: 'flex',
          alignItems: 'center',
          background: scrolled ? 'rgba(26, 26, 54,0.88)' : 'transparent',
          backdropFilter: scrolled ? 'blur(24px)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(24px)' : 'none',
          borderBottom: scrolled ? '1px solid rgba(174,137,255,0.1)' : '1px solid transparent',
          transition:
            'background 0.35s cubic-bezier(0.22,1,0.36,1), backdrop-filter 0.35s, border-color 0.35s',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            width: '100%',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Logo */}
          <Link href="/" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo_trimmed.png"
              alt="Notemage"
              style={{ height: 40, width: 'auto', display: 'block' }}
            />
          </Link>

          {/* Right side */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
            <div className="nav-links" style={{ display: 'flex', gap: 36 }}>
              <Link href="/pricing" className="nlink" style={{ opacity: 1 }}>
                Pricing
              </Link>
              <Link href="/#how-it-works" className="nlink">
                How It Works
              </Link>
            </div>
            <div className="nav-auth" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <Link href="/auth/login" className="nlink">
                Log in
              </Link>
              <Link href="/waitlist" className="btn-cta-nav">
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <PricingHero />

      {/* ── PRICING CARDS ── */}
      <section
        ref={cardsRef}
        className="pricing-cards-section"
        style={{ padding: '20px 40px 80px', position: 'relative', zIndex: 1 }}
      >
        <div
          className="pricing-cards-grid"
          style={{
            display: 'flex',
            gap: 24,
            justifyContent: 'center',
            alignItems: 'stretch',
            maxWidth: 1280,
            margin: '0 auto',
          }}
        >
          {tiers.map(({ key, ctaText }, idx) => (
            <PricingCard
              key={key}
              tier={key}
              formattedPrice={formatPrice(TIERS[key].priceCHF)}
              ctaHref={`/waitlist?tier=${key}`}
              ctaText={ctaText}
              isRevealed={cardsRevealed}
              delay={idx * 120}
            />
          ))}
        </div>
      </section>

      {/* ── FEATURE COMPARISON ── */}
      <FeatureComparison />

      {/* ── FAQ ── */}
      <FAQ />

      {/* ── CTA BANNER ── */}
      <section
        ref={ctaRef}
        className="cta-banner"
        style={{
          padding: '80px 40px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background glow */}
        <div
          style={{
            position: 'absolute',
            width: 600,
            height: 600,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,222,89,0.06) 0%, transparent 70%)',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            filter: 'blur(40px)',
          }}
        />

        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(28px, 4vw, 40px)',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: 'var(--on-surface)',
            marginBottom: 16,
            position: 'relative',
            zIndex: 1,
            opacity: ctaRevealed ? 1 : 0,
            transform: ctaRevealed ? 'translateY(0)' : 'translateY(16px)',
            transition:
              'opacity 0.6s cubic-bezier(0.22,1,0.36,1), transform 0.6s cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          Get started today
        </h2>
        <p
          style={{
            fontSize: 'clamp(15px, 2vw, 17px)',
            color: 'var(--on-surface-variant)',
            opacity: ctaRevealed ? 0.7 : 0,
            lineHeight: 1.6,
            maxWidth: 480,
            margin: '0 auto 32px',
            position: 'relative',
            zIndex: 1,
            transform: ctaRevealed ? 'translateY(0)' : 'translateY(16px)',
            transition:
              'opacity 0.6s cubic-bezier(0.22,1,0.36,1) 80ms, transform 0.6s cubic-bezier(0.22,1,0.36,1) 80ms',
          }}
        >
          Pick a plan and start learning in minutes.
        </p>
        <Link
          href="/waitlist"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--tertiary-container)',
            color: '#22223a',
            fontWeight: 700,
            fontSize: 16,
            padding: '15px 32px',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            textDecoration: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 28px rgba(255,222,89,0.25), 0 2px 8px rgba(0,0,0,0.3)',
            position: 'relative',
            zIndex: 1,
            opacity: ctaRevealed ? 1 : 0,
            transform: ctaRevealed ? 'translateY(0)' : 'translateY(16px)',
            transition:
              'opacity 0.6s cubic-bezier(0.22,1,0.36,1) 160ms, transform 0.4s cubic-bezier(0.22,1,0.36,1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-3px)';
            e.currentTarget.style.boxShadow =
              '0 10px 48px rgba(255,222,89,0.35), 0 4px 16px rgba(0,0,0,0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow =
              '0 4px 28px rgba(255,222,89,0.25), 0 2px 8px rgba(0,0,0,0.3)';
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}
          >
            rocket_launch
          </span>
          Get Started Free
        </Link>
      </section>

      {/* ── FOOTER ── */}
      <footer
        className="pricing-footer"
        style={{
          padding: '40px 48px',
          borderTop: '1px solid rgba(174,137,255,0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 20,
          maxWidth: 1200,
          margin: '0 auto',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo_trimmed.png"
          alt="Notemage"
          style={{ height: 32, width: 'auto', opacity: 0.6 }}
        />
        <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', opacity: 0.35 }}>
          &copy; 2026 Notemage &mdash; Built for students, by students.
        </p>
        <div style={{ display: 'flex', gap: 24 }}>
          <Link href="/pricing" className="nlink" style={{ fontSize: 14 }}>
            Pricing
          </Link>
          <Link href="/#how-it-works" className="nlink" style={{ fontSize: 14 }}>
            How It Works
          </Link>
          <Link href="/auth/login" className="nlink" style={{ fontSize: 14 }}>
            Log In
          </Link>
          <Link href="/waitlist" className="nlink" style={{ fontSize: 14 }}>
            Sign Up
          </Link>
        </div>
      </footer>
    </main>
  );
}
