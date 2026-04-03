'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import PricingCard from '@/components/pricing/PricingCard';
import { TIERS, type TierKey } from '@/lib/tiers';
import { useCurrency } from '@/hooks/useCurrency';

export default function PricingPage() {
  const [scrolled, setScrolled] = useState(false);
  const { formatPrice } = useCurrency();

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
    <main style={{ background: '#09081a', color: '#ede9ff', minHeight: '100vh', overflowX: 'hidden' }}>
      {/* ── GLOBAL STYLES ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Shrikhand&family=Gliker:wght@400;500;600;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body { font-family: 'Gliker', 'DM Sans', sans-serif; background: #09081a; }

        .btn-yellow {
          display: inline-flex; align-items: center; gap: 8px;
          background: #ffde59; color: #09081a;
          font-family: 'Gliker', 'DM Sans', sans-serif; font-weight: 700; font-size: 16px;
          padding: 15px 32px; border-radius: 14px; border: none;
          text-decoration: none; cursor: pointer;
          box-shadow: 0 4px 28px rgba(255,222,89,0.28), 0 2px 8px rgba(0,0,0,0.4);
          transition: transform 0.22s cubic-bezier(0.22,1,0.36,1), box-shadow 0.22s cubic-bezier(0.22,1,0.36,1);
        }
        .btn-yellow:hover {
          transform: translateY(-3px);
          box-shadow: 0 10px 48px rgba(255,222,89,0.38), 0 4px 16px rgba(0,0,0,0.5);
        }
        .btn-yellow:active { transform: translateY(0); }
        .btn-yellow:focus-visible {
          outline: 2px solid #ffde59;
          outline-offset: 3px;
        }

        .nlink {
          color: rgba(237,233,255,0.62); font-size: 15px; font-weight: 500;
          text-decoration: none;
          transition: color 0.2s ease;
        }
        .nlink:hover { color: #ede9ff; }

        .grain {
          position: fixed; inset: 0; pointer-events: none; z-index: 999;
          opacity: 0.022;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='400' height='400' filter='url(%23n)'/%3E%3C/svg%3E");
        }

        @media (max-width: 768px) {
          .nav-links { display: none !important; }
          .nav-auth { gap: 8px !important; }
          .pricing-cards-grid { flex-direction: column !important; align-items: center !important; }
        }
      `}</style>

      {/* Grain */}
      <div className="grain" />

      {/* ── NAVBAR ── */}
      <nav
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
          padding: '0 40px', height: 64,
          display: 'flex', alignItems: 'center',
          background: scrolled ? 'rgba(9,8,26,0.88)' : 'transparent',
          backdropFilter: scrolled ? 'blur(24px)' : 'none',
          borderBottom: scrolled ? '1px solid rgba(140,82,255,0.12)' : '1px solid transparent',
          transition: 'background 0.35s ease, backdrop-filter 0.35s ease, border-color 0.35s ease',
        }}
      >
        <div style={{ maxWidth: 1200, width: '100%', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Logo */}
          <Link href="/" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo_trimmed.png" alt="Quizzard" style={{ height: 40, width: 'auto', display: 'block' }} />
          </Link>

          {/* Right side: links + auth */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
            <div className="nav-links" style={{ display: 'flex', gap: 36 }}>
              <Link href="/pricing" className="nlink">Pricing</Link>
              <Link href="/#how-it-works" className="nlink">How It Works</Link>
            </div>
            <div className="nav-auth" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <Link href="/auth/login" className="nlink">Log in</Link>
              <Link href="/auth/register" className="btn-yellow" style={{ padding: '9px 20px', fontSize: 14 }}>
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          padding: '160px 40px 80px',
          textAlign: 'center',
        }}
      >
        {/* Radial glow blobs */}
        <div style={{ position: 'absolute', width: 800, height: 800, borderRadius: '50%', background: 'radial-gradient(circle, rgba(140,82,255,0.11) 0%, transparent 70%)', top: '-10%', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(81,112,255,0.07) 0%, transparent 70%)', top: '60%', right: '10%', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,222,89,0.04) 0%, transparent 70%)', bottom: '10%', left: '15%', pointerEvents: 'none' }} />

        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: '#8c52ff',
            marginBottom: 20,
          }}
        >
          Pricing
        </p>
        <h1
          style={{
            fontFamily: "'Shrikhand', cursive",
            fontSize: 'clamp(36px, 5vw, 64px)',
            letterSpacing: '-0.02em',
            lineHeight: 1.08,
            marginBottom: 20,
            color: '#ede9ff',
            position: 'relative',
            zIndex: 1,
          }}
        >
          Choose Your Plan
        </h1>
        <p
          style={{
            fontSize: 'clamp(15px, 2vw, 18px)',
            color: 'rgba(237,233,255,0.52)',
            lineHeight: 1.7,
            maxWidth: 560,
            position: 'relative',
            zIndex: 1,
          }}
        >
          Start free, upgrade when you need more. Every plan includes the core
          Quizzard experience — AI flashcards, study plans, and Scholar Chat.
        </p>
      </section>

      {/* ── PRICING CARDS ── */}
      <section style={{ padding: '20px 40px 120px', position: 'relative', zIndex: 1 }}>
        <div
          className="pricing-cards-grid"
          style={{
            display: 'flex',
            gap: 24,
            justifyContent: 'center',
            alignItems: 'stretch',
            maxWidth: 1040,
            margin: '0 auto',
          }}
        >
          {tiers.map(({ key, ctaText }) => (
            <PricingCard
              key={key}
              tier={key}
              formattedPrice={formatPrice(TIERS[key].priceCHF)}
              ctaHref={`/auth/register?tier=${key}`}
              ctaText={ctaText}
            />
          ))}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer
        style={{
          padding: '40px 48px',
          borderTop: '1px solid rgba(140,82,255,0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 20,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo_trimmed.png" alt="Quizzard" style={{ height: '32px', width: 'auto', opacity: 0.75 }} />
        <p style={{ fontSize: 13, color: 'rgba(237,233,255,0.28)' }}>
          © 2026 Quizzard — Built for students, by students.
        </p>
        <div style={{ display: 'flex', gap: 24 }}>
          <Link href="/auth/login" className="nlink" style={{ fontSize: 14 }}>Log In</Link>
          <Link href="/auth/register" className="nlink" style={{ fontSize: 14 }}>Sign Up</Link>
        </div>
      </footer>
    </main>
  );
}
