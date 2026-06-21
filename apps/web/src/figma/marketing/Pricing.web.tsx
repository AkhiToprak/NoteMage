'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ONB, MKTC, MktWebFrame, MktTopNav, MarketingFooterBar, Sparkle, mkt } from './shell';

/**
 * Pricing — web (Figma 72:2 / 73:* + 74:*). 1440-wide cream canvas.
 * Billing toggle (Weekly/Monthly/Yearly — Yearly default) drives Pro price.
 * FAQ accordion — first item open by default.
 * All buttons → /figma/marketing/login (mock only, no backend).
 */

// ── Billing plan data ───────────────────────────────────────────────────────
type BillingInterval = 'weekly' | 'monthly' | 'yearly';

const PRICE: Record<BillingInterval, { big: string; unit: string; sub: string | null }> = {
  yearly:  { big: 'CHF 99',    unit: '/yr', sub: '≈ CHF 8.25/mo · billed yearly' },
  monthly: { big: 'CHF 12.99', unit: '/mo', sub: null },
  weekly:  { big: 'CHF 4.50',  unit: '/wk', sub: null },
};

// ── Free-plan checklist ─────────────────────────────────────────────────────
const FREE_ITEMS = [
  '1 AI flashcard set',
  'Community study paths',
  '2 AI quizzes / month',
  '50 Mage chat messages / month',
  '50 PDF pages (one-time)',
  'Flashcards, quizzes & study tools',
];

// ── Pro-plan checklist ──────────────────────────────────────────────────────
const PRO_ITEMS = [
  'Unlimited AI flashcards, quizzes & chat*',
  'Unlimited AI study paths',
  '3 Ultra paths / month',
  '450 PDF pages / month',
  'Inline AI editing',
  'Everything in Free',
];

// ── Comparison table ────────────────────────────────────────────────────────
type CmpRow =
  | { kind: 'section'; label: string }
  | { kind: 'row'; feature: string; free: string; pro: string; proGold?: boolean };

const CMP_ROWS: CmpRow[] = [
  { kind: 'section', label: 'AI FEATURES' },
  { kind: 'row', feature: 'AI flashcard sets',    free: '1 / mo',    pro: 'Unlimited*', proGold: true },
  { kind: 'row', feature: 'AI presentations',     free: '1 / mo',    pro: 'Unlimited*', proGold: true },
  { kind: 'row', feature: 'Study paths',          free: 'Community', pro: 'Unlimited*', proGold: true },
  { kind: 'row', feature: 'Ultra paths',          free: '—',         pro: '3 / mo' },
  { kind: 'row', feature: 'AI quizzes',           free: '2 / mo',    pro: 'Unlimited*', proGold: true },
  { kind: 'row', feature: 'Mage chat messages',   free: '50 / mo',   pro: 'Unlimited*', proGold: true },
  { kind: 'row', feature: 'Inline AI editing',    free: '—',         pro: 'Unlimited*', proGold: true },
  { kind: 'row', feature: 'PDF pages',            free: '50 total',  pro: '450 / mo' },
  { kind: 'row', feature: 'Path translations',    free: '5 total',   pro: '50 / mo' },
  { kind: 'section', label: 'STUDY TOOLS' },
  { kind: 'row', feature: 'Flashcards & quizzes',  free: '✓', pro: '✓' },
  { kind: 'row', feature: 'Text & canvas files',   free: '✓', pro: '✓' },
  { kind: 'row', feature: 'Mind maps',             free: '✓', pro: '✓' },
  { kind: 'row', feature: 'Exam timers & streaks', free: '✓', pro: '✓' },
  { kind: 'row', feature: 'And much more…',        free: '✓', pro: '✓' },
];

const CHECK_SYMBOL = '✓';
const isCheck = (v: string) => v === CHECK_SYMBOL;
const isDash  = (v: string) => v === '—';

// ── FAQ data ────────────────────────────────────────────────────────────────
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
    a: 'Free users are gently paused until the next month. Pro users are very unlikely to hit the fair-use cap (~1M tokens/month is far more than any student realistically uses).',
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

// ── Component ───────────────────────────────────────────────────────────────
export default function PricingWeb() {
  const router = useRouter();
  const [interval, setBillingInterval] = useState<BillingInterval>('yearly');
  const [openFaq, setOpenFaq] = useState<number>(0); // first item open by default
  const goLogin = () => router.push('/figma/marketing/login');

  const price = PRICE[interval];

  return (
    <MktWebFrame style={{ minHeight: 2568 }}>
      <MktTopNav active="pricing" />

      {/* ── Hero header ──────────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', paddingTop: 52 }}>
        {/* Sparkle ornaments */}
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <Sparkle
            size={22}
            color={ONB.gold}
            rotate={-15}
            style={{ position: 'absolute', left: -60, top: -8, display: 'block' }}
          />
          <Sparkle
            size={16}
            color={ONB.primary}
            style={{ position: 'absolute', right: -50, top: 0, display: 'block' }}
          />
          <p
            style={{
              margin: 0,
              fontFamily: ONB.font,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '1.04px',
              color: ONB.primary,
              textTransform: 'uppercase',
            }}
          >
            PRICING
          </p>
        </div>

        <h1
          style={{
            margin: '8px 0 0',
            fontFamily: ONB.font,
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: '-0.88px',
            lineHeight: 1.08,
            color: ONB.ink,
          }}
        >
          Simple, student-friendly pricing.
        </h1>
        <p
          style={{
            margin: '18px 0 0',
            fontFamily: ONB.font,
            fontSize: 18,
            fontWeight: 400,
            lineHeight: 1.46,
            color: ONB.muted,
            maxWidth: 640,
            marginInline: 'auto',
          }}
        >
          Start free. Upgrade to Pro for unlimited AI whenever you need it.
        </p>
      </div>

      {/* ── Billing toggle ────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          marginTop: 36,
        }}
      >
        {/* Segmented pill */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            height: 56,
            width: 372,
            background: ONB.white,
            border: `1.4px solid ${ONB.line}`,
            borderRadius: 28,
            padding: '4px',
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
                  height: 48,
                  borderRadius: 24,
                  border: 'none',
                  background: active ? ONB.primary : 'transparent',
                  color: active ? ONB.white : ONB.muted,
                  fontFamily: ONB.font,
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
                  position: 'relative',
                  zIndex: 1,
                }}
                aria-pressed={active}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            );
          })}
        </div>

        {/* Save 36% chip */}
        <div
          style={{
            height: 27,
            padding: '0 10px',
            borderRadius: 13.5,
            background: '#fff3d6',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          <span
            style={{
              fontFamily: ONB.font,
              fontSize: 13,
              fontWeight: 600,
              color: '#7a5200',
              whiteSpace: 'nowrap',
            }}
          >
            Save 36%
          </span>
        </div>
      </div>

      {/* ── Plan cards ───────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 28,
          marginTop: 40,
          padding: '0 64px',
          maxWidth: 1440,
          marginInline: 'auto',
          marginBottom: 0,
        }}
      >
        {/* FREE card */}
        <div
          style={{
            position: 'relative',
            width: 410,
            height: 580,
            background: ONB.white,
            border: `1.4px solid ${ONB.line}`,
            borderRadius: 26,
            boxShadow: '0px 8px 24px 0px rgba(58,46,102,0.07)',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <div style={{ padding: '32px 30px 0' }}>
            {/* Plan label */}
            <p
              style={{
                margin: 0,
                fontFamily: ONB.font,
                fontSize: 20,
                fontWeight: 700,
                color: ONB.ink,
              }}
            >
              Free
            </p>
            {/* Price */}
            <p
              style={{
                margin: '8px 0 0',
                fontFamily: ONB.font,
                fontSize: 42,
                fontWeight: 800,
                color: ONB.ink,
                lineHeight: 1.3,
              }}
            >
              CHF 0
            </p>
            {/* Sub */}
            <p
              style={{
                margin: '8px 0 0',
                fontFamily: ONB.font,
                fontSize: 13.5,
                fontWeight: 500,
                color: ONB.muted,
              }}
            >
              Free forever — no card needed
            </p>
            {/* Divider */}
            <div
              style={{
                marginTop: 20,
                height: 1,
                background: ONB.line,
                marginLeft: 0,
                width: 346,
              }}
            />
            {/* Checklist */}
            <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {FREE_ITEMS.map((item) => (
                <li key={item} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      background: '#e2f5eb',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      fontFamily: ONB.font,
                      fontWeight: 700,
                      fontSize: 12,
                      color: '#0f6b3d',
                    }}
                  >
                    ✓
                  </span>
                  <span
                    style={{
                      fontFamily: ONB.font,
                      fontSize: 15,
                      fontWeight: 500,
                      color: ONB.ink,
                      lineHeight: 1.34,
                    }}
                  >
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* CTA button — absolute bottom */}
          <div style={{ position: 'absolute', bottom: 30, left: 30, right: 30 }}>
            <button
              onClick={goLogin}
              className={mkt.tapPill}
              style={{
                width: '100%',
                height: 56,
                borderRadius: 15,
                border: `1.6px solid ${ONB.paperLine}`,
                background: 'transparent',
                color: ONB.primary,
                fontFamily: ONB.font,
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Get started
            </button>
          </div>
        </div>

        {/* PRO card */}
        <div
          style={{
            position: 'relative',
            width: 410,
            height: 580,
            background: ONB.white,
            border: `2.4px solid ${ONB.primary}`,
            borderRadius: 26,
            boxShadow: '0px 18px 48px 0px rgba(124,92,255,0.2)',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {/* Most popular badge */}
          <div
            style={{
              position: 'absolute',
              top: 27,
              right: 30,
              height: 26,
              padding: '0 10px',
              borderRadius: 13,
              background: MKTC.badge,
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontFamily: ONB.font,
                fontSize: 12,
                fontWeight: 600,
                color: '#7a5200',
                whiteSpace: 'nowrap',
              }}
            >
              Most popular
            </span>
          </div>

          <div style={{ padding: '32px 30px 0' }}>
            {/* Plan label */}
            <p
              style={{
                margin: 0,
                fontFamily: ONB.font,
                fontSize: 20,
                fontWeight: 700,
                color: ONB.ink,
              }}
            >
              Pro
            </p>
            {/* Price row */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 8 }}>
              <p
                style={{
                  margin: 0,
                  fontFamily: ONB.font,
                  fontSize: 42,
                  fontWeight: 800,
                  color: ONB.ink,
                  lineHeight: 1.3,
                }}
              >
                {price.big}
              </p>
              <span
                style={{
                  fontFamily: ONB.font,
                  fontSize: 17,
                  fontWeight: 600,
                  color: ONB.muted,
                }}
              >
                {price.unit}
              </span>
            </div>
            {/* Sub-line */}
            <p
              style={{
                margin: '6px 0 0',
                fontFamily: ONB.font,
                fontSize: 13.5,
                fontWeight: 500,
                color: ONB.muted,
                minHeight: 20,
              }}
            >
              {price.sub ?? ' '}
            </p>
            {/* Divider */}
            <div
              style={{
                marginTop: 20,
                height: 1,
                background: ONB.line,
                width: 346,
              }}
            />
            {/* Checklist */}
            <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {PRO_ITEMS.map((item) => (
                <li key={item} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      background: '#fff3d6',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      fontFamily: ONB.font,
                      fontWeight: 700,
                      fontSize: 12,
                      color: '#7a5200',
                    }}
                  >
                    ✓
                  </span>
                  <span
                    style={{
                      fontFamily: ONB.font,
                      fontSize: 15,
                      fontWeight: 500,
                      color: ONB.ink,
                      lineHeight: 1.34,
                    }}
                  >
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* CTA + footnote — absolute bottom */}
          <div style={{ position: 'absolute', bottom: 30, left: 30, right: 30 }}>
            <button
              onClick={goLogin}
              className={mkt.tapPill}
              style={{
                width: '100%',
                height: 56,
                borderRadius: 15,
                border: 'none',
                background: MKTC.badge,
                color: '#7a5200',
                fontFamily: ONB.font,
                fontSize: 16,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0px 12px 28px 0px rgba(255,200,61,0.34)',
              }}
            >
              Go Pro  →
            </button>
            <p
              style={{
                margin: '10px 0 0',
                textAlign: 'center',
                fontFamily: ONB.font,
                fontSize: 12,
                fontWeight: 500,
                color: ONB.muted2,
              }}
            >
              *Fair use ~1M tokens / month
            </p>
          </div>
        </div>
      </div>

      {/* ── Compare plans in detail ───────────────────────────────────────── */}
      <div style={{ maxWidth: 1440, marginInline: 'auto', padding: '0 64px', marginTop: 60 }}>
        <h2
          style={{
            textAlign: 'center',
            fontFamily: ONB.font,
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: '-0.45px',
            lineHeight: 1.3,
            color: ONB.ink,
            margin: '0 0 40px',
          }}
        >
          Compare plans in detail
        </h2>

        {/* Table container */}
        <div
          style={{
            position: 'relative',
            width: 860,
            marginInline: 'auto',
            background: ONB.white,
            border: `1.2px solid ${ONB.line}`,
            borderRadius: 22,
            boxShadow: '0px 8px 24px 0px rgba(58,46,102,0.07)',
            overflow: 'hidden',
          }}
        >
          {/* Pro column tint */}
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: 220,
              background: MKTC.proColumn,
              pointerEvents: 'none',
            }}
          />

          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              position: 'relative',
              zIndex: 1,
            }}
          >
            {/* Column header */}
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '22px 0 22px 23px',
                    fontFamily: ONB.font,
                    fontSize: 13,
                    fontWeight: 600,
                    color: ONB.muted2,
                    width: '50%',
                    borderBottom: `1px solid ${ONB.line}`,
                  }}
                >
                  Feature
                </th>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '22px 0',
                    fontFamily: ONB.font,
                    fontSize: 14,
                    fontWeight: 700,
                    color: ONB.muted,
                    width: '25%',
                    borderBottom: `1px solid ${ONB.line}`,
                  }}
                >
                  Free
                </th>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '22px 0',
                    fontFamily: ONB.font,
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#7a5200',
                    width: '25%',
                    borderBottom: `1px solid ${ONB.line}`,
                  }}
                >
                  Pro
                </th>
              </tr>
            </thead>
            <tbody>
              {CMP_ROWS.map((row, idx) => {
                if (row.kind === 'section') {
                  return (
                    <tr key={row.label}>
                      <td
                        colSpan={3}
                        style={{
                          padding: '16px 0 10px 23px',
                          fontFamily: ONB.font,
                          fontSize: 11,
                          fontWeight: 700,
                          color: ONB.primary,
                          letterSpacing: '0.88px',
                          textTransform: 'uppercase',
                        }}
                      >
                        {row.label}
                      </td>
                    </tr>
                  );
                }

                const isEven = idx % 2 === 0;
                const rowBg = isEven ? '#fbf8f1' : 'transparent';

                return (
                  <tr
                    key={row.feature}
                    style={{ background: rowBg }}
                  >
                    <td
                      style={{
                        padding: '13px 0 13px 23px',
                        fontFamily: ONB.font,
                        fontSize: 14,
                        fontWeight: 500,
                        color: ONB.ink,
                      }}
                    >
                      {row.feature}
                    </td>
                    <td
                      style={{
                        padding: '13px 0',
                        fontFamily: ONB.font,
                        fontSize: isCheck(row.free) ? 16 : 13,
                        fontWeight: isCheck(row.free) ? 700 : isDash(row.free) ? 400 : 500,
                        color: isCheck(row.free)
                          ? '#2fa968'
                          : isDash(row.free)
                          ? ONB.muted2
                          : ONB.muted,
                      }}
                    >
                      {row.free}
                    </td>
                    <td
                      style={{
                        padding: '13px 0',
                        fontFamily: ONB.font,
                        fontSize: isCheck(row.pro) ? 16 : 13,
                        fontWeight: isCheck(row.pro) ? 700 : row.proGold ? 600 : 500,
                        color: isCheck(row.pro)
                          ? '#2fa968'
                          : row.proGold
                          ? '#7a5200'
                          : ONB.muted,
                      }}
                    >
                      {row.pro}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Fair-use footnote */}
        <p
          style={{
            marginTop: 20,
            textAlign: 'center',
            fontFamily: ONB.font,
            fontSize: 13,
            fontWeight: 400,
            lineHeight: 1.5,
            color: ONB.muted2,
            maxWidth: 760,
            marginInline: 'auto',
          }}
        >
          *Pro usage is subject to a fair-use policy (~1M tokens/month) — far more than any student realistically uses. It&apos;s only there to prevent abuse.
        </p>
      </div>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1440, marginInline: 'auto', padding: '0 64px', marginTop: 76 }}>
        <h2
          style={{
            textAlign: 'center',
            fontFamily: ONB.font,
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: '-0.42px',
            lineHeight: 1.3,
            color: ONB.ink,
            margin: '0 0 44px',
          }}
        >
          Frequently asked questions
        </h2>

        <div style={{ maxWidth: 760, marginInline: 'auto' }}>
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
                    padding: '20px 0',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    gap: 16,
                  }}
                >
                  <span
                    style={{
                      fontFamily: ONB.font,
                      fontSize: 16.5,
                      fontWeight: 600,
                      color: isOpen ? ONB.ink : ONB.muted,
                      lineHeight: 1.3,
                    }}
                  >
                    {item.q}
                  </span>
                  <span
                    className={`material-symbols-outlined ${isOpen ? mkt.chevOpen : mkt.chev}`}
                    style={{
                      fontSize: 22,
                      color: ONB.muted2,
                      flexShrink: 0,
                    }}
                  >
                    expand_more
                  </span>
                </button>

                {isOpen && (
                  <p
                    style={{
                      margin: '0 0 20px',
                      fontFamily: ONB.font,
                      fontSize: 15,
                      fontWeight: 400,
                      lineHeight: 1.6,
                      color: ONB.muted,
                      maxWidth: 720,
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
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 80 }}>
        <MarketingFooterBar />
      </div>
    </MktWebFrame>
  );
}
