'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ONB, MKTC, OnbMobileFrame, MarketingFooterBar, mkt,
} from './shell';

/**
 * Pricing — mobile (derived, 393-wide single-column reflow).
 * Web-only in Figma — this is a sensible mobile adaptation (known gap).
 * Billing toggle → Pro price; FAQ accordion; plan cards stacked.
 */

type BillingInterval = 'weekly' | 'monthly' | 'yearly';

const PRICE: Record<BillingInterval, { big: string; unit: string; sub: string | null }> = {
  yearly:  { big: 'CHF 99',    unit: '/yr', sub: '≈ CHF 8.25/mo · billed yearly' },
  monthly: { big: 'CHF 12.99', unit: '/mo', sub: null },
  weekly:  { big: 'CHF 4.50',  unit: '/wk', sub: null },
};

const FREE_ITEMS = [
  '1 AI flashcard set',
  'Community study paths',
  '2 AI quizzes / month',
  '50 Mage chat messages / month',
  '50 PDF pages (one-time)',
  'Flashcards, quizzes & study tools',
];

const PRO_ITEMS = [
  'Unlimited AI flashcards, quizzes & chat*',
  'Unlimited AI study paths',
  '3 Ultra paths / month',
  '450 PDF pages / month',
  'Inline AI editing',
  'Everything in Free',
];

// Simplified comparison: feature + free value + pro value
type MobileCmpRow =
  | { kind: 'section'; label: string }
  | { kind: 'row'; feature: string; free: string; pro: string; proGold?: boolean };

const MOBILE_CMP: MobileCmpRow[] = [
  { kind: 'section', label: 'AI FEATURES' },
  { kind: 'row', feature: 'AI flashcard sets',  free: '1/mo',      pro: 'Unlimited*',  proGold: true },
  { kind: 'row', feature: 'AI presentations',   free: '1/mo',      pro: 'Unlimited*',  proGold: true },
  { kind: 'row', feature: 'Study paths',        free: 'Community', pro: 'Unlimited*',  proGold: true },
  { kind: 'row', feature: 'Ultra paths',        free: '—',         pro: '3/mo' },
  { kind: 'row', feature: 'AI quizzes',         free: '2/mo',      pro: 'Unlimited*',  proGold: true },
  { kind: 'row', feature: 'Mage chat',          free: '50/mo',     pro: 'Unlimited*',  proGold: true },
  { kind: 'row', feature: 'Inline AI editing',  free: '—',         pro: 'Unlimited*',  proGold: true },
  { kind: 'row', feature: 'PDF pages',          free: '50 total',  pro: '450/mo' },
  { kind: 'row', feature: 'Path translations',  free: '5 total',   pro: '50/mo' },
  { kind: 'section', label: 'STUDY TOOLS' },
  { kind: 'row', feature: 'Flashcards & quizzes',  free: '✓', pro: '✓' },
  { kind: 'row', feature: 'Text & canvas files',   free: '✓', pro: '✓' },
  { kind: 'row', feature: 'Mind maps',             free: '✓', pro: '✓' },
  { kind: 'row', feature: 'Exam timers & streaks', free: '✓', pro: '✓' },
  { kind: 'row', feature: 'And much more…',        free: '✓', pro: '✓' },
];

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: 'Can I switch plans at any time?',
    a: 'Yes — upgrade or downgrade anytime from Settings. Changes take effect right away.',
  },
  {
    q: 'Is there a student discount?',
    a: 'Not at the moment. Our free tier is already generous, and Pro is priced to be accessible to students.',
  },
  {
    q: 'What happens when I hit my monthly limit?',
    a: 'Free users are gently paused until the next month. Pro users are very unlikely to hit the fair-use cap (~1M tokens/month).',
  },
  {
    q: 'Can I cancel my subscription?',
    a: 'Yes — cancel anytime from Settings > Billing. You keep Pro access until the end of your current period.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We accept all major credit and debit cards (Visa, Mastercard, Amex) via our secure payment processor.',
  },
];

const isCheck = (v: string) => v === '✓';
const isDash  = (v: string) => v === '—';

export default function PricingMobile() {
  const router = useRouter();
  const [interval, setBillingInterval] = useState<BillingInterval>('yearly');
  const [openFaq, setOpenFaq] = useState<number>(0);
  const goLogin = () => router.push('/figma/marketing/login');
  const price = PRICE[interval];

  return (
    <OnbMobileFrame>
      <div
        style={{
          width: '100%',
          background: ONB.cream,
          fontFamily: ONB.font,
          color: ONB.ink,
          overflowX: 'hidden',
        }}
      >
        {/* ── Mini top bar ─────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 20px 0',
          }}
        >
          <span
            style={{
              fontFamily: ONB.font,
              fontSize: 18,
              fontWeight: 800,
              color: ONB.primary,
              letterSpacing: '-0.3px',
            }}
          >
            NoteMage
          </span>
          <button
            onClick={goLogin}
            className={mkt.tapPill}
            style={{
              height: 38,
              padding: '0 16px',
              borderRadius: 12,
              border: 'none',
              background: ONB.primary,
              color: ONB.white,
              fontFamily: ONB.font,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: ONB.btnShadow,
            }}
          >
            Get started
          </button>
        </div>

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', padding: '32px 24px 0' }}>
          <p
            style={{
              margin: 0,
              fontFamily: ONB.font,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '1px',
              color: ONB.primary,
              textTransform: 'uppercase',
            }}
          >
            PRICING
          </p>
          <h1
            style={{
              margin: '10px 0 0',
              fontFamily: ONB.font,
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: '-0.5px',
              lineHeight: 1.15,
              color: ONB.ink,
            }}
          >
            Simple, student-friendly pricing.
          </h1>
          <p
            style={{
              margin: '12px 0 0',
              fontFamily: ONB.font,
              fontSize: 15,
              fontWeight: 400,
              lineHeight: 1.5,
              color: ONB.muted,
            }}
          >
            Start free. Upgrade to Pro for unlimited AI whenever you need it.
          </p>
        </div>

        {/* ── Billing toggle ────────────────────────────────────────────── */}
        <div style={{ padding: '24px 24px 0' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              height: 52,
              background: ONB.white,
              border: `1.4px solid ${ONB.line}`,
              borderRadius: 26,
              padding: '3px',
              boxSizing: 'border-box',
            }}
          >
            {(['weekly', 'monthly', 'yearly'] as BillingInterval[]).map((tab) => {
              const active = interval === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setBillingInterval(tab)}
                  className={mkt.tapPill}
                  style={{
                    flex: 1,
                    height: 44,
                    borderRadius: 22,
                    border: 'none',
                    background: active ? ONB.primary : 'transparent',
                    color: active ? ONB.white : ONB.muted,
                    fontFamily: ONB.font,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                  aria-pressed={active}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              );
            })}
          </div>
          {/* Save chip */}
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center' }}>
            <span
              style={{
                height: 26,
                padding: '0 10px',
                borderRadius: 13,
                background: '#fff3d6',
                display: 'inline-flex',
                alignItems: 'center',
                fontFamily: ONB.font,
                fontSize: 12,
                fontWeight: 600,
                color: '#7a5200',
              }}
            >
              Yearly saves 36%
            </span>
          </div>
        </div>

        {/* ── Plan cards (stacked) ──────────────────────────────────────── */}
        <div style={{ padding: '20px 20px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* FREE */}
          <div
            style={{
              background: ONB.white,
              border: `1.4px solid ${ONB.line}`,
              borderRadius: 22,
              boxShadow: '0px 6px 20px 0px rgba(58,46,102,0.07)',
              padding: '24px 22px',
            }}
          >
            <p style={{ margin: 0, fontFamily: ONB.font, fontSize: 18, fontWeight: 700, color: ONB.ink }}>
              Free
            </p>
            <p style={{ margin: '6px 0 0', fontFamily: ONB.font, fontSize: 36, fontWeight: 800, color: ONB.ink, lineHeight: 1.2 }}>
              CHF 0
            </p>
            <p style={{ margin: '6px 0 0', fontFamily: ONB.font, fontSize: 13, fontWeight: 500, color: ONB.muted }}>
              Free forever — no card needed
            </p>
            <div style={{ marginTop: 16, height: 1, background: ONB.line }} />
            <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {FREE_ITEMS.map((item) => (
                <li key={item} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      background: '#e2f5eb',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      fontFamily: ONB.font,
                      fontWeight: 700,
                      fontSize: 11,
                      color: '#0f6b3d',
                    }}
                  >
                    ✓
                  </span>
                  <span style={{ fontFamily: ONB.font, fontSize: 14, fontWeight: 500, color: ONB.ink }}>
                    {item}
                  </span>
                </li>
              ))}
            </ul>
            <button
              onClick={goLogin}
              className={mkt.tapPill}
              style={{
                width: '100%',
                height: 50,
                borderRadius: 14,
                border: `1.6px solid ${ONB.paperLine}`,
                background: 'transparent',
                color: ONB.primary,
                fontFamily: ONB.font,
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                marginTop: 20,
              }}
            >
              Get started
            </button>
          </div>

          {/* PRO */}
          <div
            style={{
              position: 'relative',
              background: ONB.white,
              border: `2.4px solid ${ONB.primary}`,
              borderRadius: 22,
              boxShadow: '0px 16px 40px 0px rgba(124,92,255,0.18)',
              padding: '24px 22px',
            }}
          >
            {/* Badge */}
            <div
              style={{
                position: 'absolute',
                top: 22,
                right: 20,
                height: 24,
                padding: '0 10px',
                borderRadius: 12,
                background: MKTC.badge,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              <span style={{ fontFamily: ONB.font, fontSize: 11, fontWeight: 600, color: '#7a5200' }}>
                Most popular
              </span>
            </div>

            <p style={{ margin: 0, fontFamily: ONB.font, fontSize: 18, fontWeight: 700, color: ONB.ink }}>
              Pro
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 6 }}>
              <p style={{ margin: 0, fontFamily: ONB.font, fontSize: 36, fontWeight: 800, color: ONB.ink, lineHeight: 1.2 }}>
                {price.big}
              </p>
              <span style={{ fontFamily: ONB.font, fontSize: 16, fontWeight: 600, color: ONB.muted }}>
                {price.unit}
              </span>
            </div>
            <p style={{ margin: '6px 0 0', fontFamily: ONB.font, fontSize: 13, fontWeight: 500, color: ONB.muted, minHeight: 19 }}>
              {price.sub ?? ' '}
            </p>
            <div style={{ marginTop: 16, height: 1, background: ONB.line }} />
            <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {PRO_ITEMS.map((item) => (
                <li key={item} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      background: '#fff3d6',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      fontFamily: ONB.font,
                      fontWeight: 700,
                      fontSize: 11,
                      color: '#7a5200',
                    }}
                  >
                    ✓
                  </span>
                  <span style={{ fontFamily: ONB.font, fontSize: 14, fontWeight: 500, color: ONB.ink }}>
                    {item}
                  </span>
                </li>
              ))}
            </ul>
            <button
              onClick={goLogin}
              className={mkt.tapPill}
              style={{
                width: '100%',
                height: 50,
                borderRadius: 14,
                border: 'none',
                background: MKTC.badge,
                color: '#7a5200',
                fontFamily: ONB.font,
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0px 10px 24px 0px rgba(255,200,61,0.3)',
                marginTop: 20,
              }}
            >
              Go Pro  →
            </button>
            <p
              style={{
                margin: '8px 0 0',
                textAlign: 'center',
                fontFamily: ONB.font,
                fontSize: 11,
                fontWeight: 500,
                color: ONB.muted2,
              }}
            >
              *Fair use ~1M tokens / month
            </p>
          </div>
        </div>

        {/* ── Compare plans table ───────────────────────────────────────── */}
        <div style={{ padding: '36px 20px 0' }}>
          <h2
            style={{
              textAlign: 'center',
              fontFamily: ONB.font,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '-0.3px',
              color: ONB.ink,
              margin: '0 0 20px',
            }}
          >
            Compare plans
          </h2>

          <div
            style={{
              background: ONB.white,
              border: `1.2px solid ${ONB.line}`,
              borderRadius: 18,
              boxShadow: '0px 6px 20px 0px rgba(58,46,102,0.07)',
              overflow: 'hidden',
            }}
          >
            {/* Header row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 80px 80px',
                padding: '14px 16px',
                borderBottom: `1px solid ${ONB.line}`,
              }}
            >
              <span style={{ fontFamily: ONB.font, fontSize: 12, fontWeight: 600, color: ONB.muted2 }}>Feature</span>
              <span style={{ fontFamily: ONB.font, fontSize: 13, fontWeight: 700, color: ONB.muted, textAlign: 'center' }}>Free</span>
              <span style={{ fontFamily: ONB.font, fontSize: 13, fontWeight: 700, color: '#7a5200', textAlign: 'center' }}>Pro</span>
            </div>

            {MOBILE_CMP.map((row, idx) => {
              if (row.kind === 'section') {
                return (
                  <div
                    key={row.label}
                    style={{
                      padding: '12px 16px 6px',
                      fontFamily: ONB.font,
                      fontSize: 10,
                      fontWeight: 700,
                      color: ONB.primary,
                      letterSpacing: '0.8px',
                      textTransform: 'uppercase',
                    }}
                  >
                    {row.label}
                  </div>
                );
              }

              const isEven = idx % 2 === 0;
              return (
                <div
                  key={row.feature}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 80px 80px',
                    padding: '11px 16px',
                    background: isEven ? '#fbf8f1' : 'transparent',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontFamily: ONB.font, fontSize: 13, fontWeight: 500, color: ONB.ink }}>
                    {row.feature}
                  </span>
                  <span
                    style={{
                      textAlign: 'center',
                      fontFamily: ONB.font,
                      fontSize: isCheck(row.free) ? 15 : 12,
                      fontWeight: isCheck(row.free) ? 700 : 500,
                      color: isCheck(row.free)
                        ? '#2fa968'
                        : isDash(row.free)
                        ? ONB.muted2
                        : ONB.muted,
                    }}
                  >
                    {row.free}
                  </span>
                  <span
                    style={{
                      textAlign: 'center',
                      fontFamily: ONB.font,
                      fontSize: isCheck(row.pro) ? 15 : 12,
                      fontWeight: isCheck(row.pro) ? 700 : row.proGold ? 600 : 500,
                      color: isCheck(row.pro)
                        ? '#2fa968'
                        : row.proGold
                        ? '#7a5200'
                        : ONB.muted,
                    }}
                  >
                    {row.pro}
                  </span>
                </div>
              );
            })}
          </div>

          <p
            style={{
              marginTop: 14,
              fontFamily: ONB.font,
              fontSize: 11,
              fontWeight: 400,
              lineHeight: 1.5,
              color: ONB.muted2,
              textAlign: 'center',
            }}
          >
            *Fair-use policy (~1M tokens/month) — far more than any student realistically uses.
          </p>
        </div>

        {/* ── FAQ ──────────────────────────────────────────────────────── */}
        <div style={{ padding: '36px 20px 0' }}>
          <h2
            style={{
              textAlign: 'center',
              fontFamily: ONB.font,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '-0.3px',
              color: ONB.ink,
              margin: '0 0 24px',
            }}
          >
            FAQ
          </h2>

          {FAQ_ITEMS.map((item, i) => {
            const isOpen = openFaq === i;
            return (
              <div key={item.q}>
                <button
                  onClick={() => setOpenFaq(isOpen ? -1 : i)}
                  className={mkt.tapPill}
                  aria-expanded={isOpen}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '18px 0',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    gap: 12,
                  }}
                >
                  <span
                    style={{
                      fontFamily: ONB.font,
                      fontSize: 15,
                      fontWeight: 600,
                      color: isOpen ? ONB.ink : ONB.muted,
                      lineHeight: 1.3,
                    }}
                  >
                    {item.q}
                  </span>
                  <span
                    className={`material-symbols-outlined ${isOpen ? mkt.chevOpen : mkt.chev}`}
                    style={{ fontSize: 20, color: ONB.muted2, flexShrink: 0 }}
                  >
                    expand_more
                  </span>
                </button>

                {isOpen && (
                  <p
                    style={{
                      margin: '0 0 18px',
                      fontFamily: ONB.font,
                      fontSize: 14,
                      fontWeight: 400,
                      lineHeight: 1.6,
                      color: ONB.muted,
                    }}
                  >
                    {item.a}
                  </p>
                )}

                <div style={{ height: 1, background: ONB.line }} />
              </div>
            );
          })}
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div style={{ marginTop: 48 }}>
          <MarketingFooterBar />
        </div>
      </div>
    </OnbMobileFrame>
  );
}
