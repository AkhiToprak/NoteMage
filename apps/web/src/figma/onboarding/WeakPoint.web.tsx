'use client';

import { useRouter } from 'next/navigation';
import { Mage } from '@/figma/kit';
import { ONB, OnbButton, OnbWebFrame, Sparkle } from './shell';

/**
 * 11 Weak point — web (Figma 48:24). 1440-designed, cream.
 *
 * Layout (top→bottom):
 *  • Top nav: logo left, "Log in" + "Get started" right
 *  • Centered single-column content (max-width ~840px):
 *    – Mage mascot + lavender halo + sparkles (hero illustration)
 *    – "First weak point found." headline
 *    – Subtitle
 *    – "Session complete" white stats card
 *    – Amber "Needs practice" card
 *    – CTA row: "Continue path" (primary, → 12-signup) + "Save my progress" (outlined)
 *
 * No back control. Interactions = mock-state only.
 */

/** Amber tones — exact from Figma node 59:25–34 */
const AMBER = {
  bg: '#fcefd9',
  border: '#f0dbb4',
  pill: '#f2a33c',
  divider: '#ebd9b6',
  gold: ONB.gold,
  label: '#8a5a12',
  labelIcon: '#7a5200',
} as const;

/** One stat column for the session-complete card. */
function StatCol({
  value,
  label,
  color,
}: {
  value: string;
  label: string;
  color: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flex: 1,
      }}
    >
      <span
        style={{
          fontFamily: ONB.font,
          fontWeight: 800,
          fontSize: 26,
          color,
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontFamily: ONB.font,
          fontWeight: 500,
          fontSize: 13,
          color: ONB.muted,
          marginTop: 8,
          textAlign: 'center',
        }}
      >
        {label}
      </span>
    </div>
  );
}

export default function WeakPointWeb() {
  const router = useRouter();

  return (
    <OnbWebFrame>
      {/* ── Top nav ── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '46px 64px 0',
          maxWidth: 1440,
          marginInline: 'auto',
        }}
      >
        <Mage pose="logo-color" size={150} alt="NoteMage" priority />
        <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
          <button
            type="button"
            style={{
              border: 'none',
              background: 'transparent',
              color: ONB.muted,
              fontFamily: ONB.font,
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => router.push('/figma/onboarding/12-signup')}
          >
            Log in
          </button>
          <OnbButton
            radius={16}
            height={58}
            style={{ padding: '0 32px' }}
            onClick={() => router.push('/figma/onboarding/12-signup')}
          >
            Get started
          </OnbButton>
        </div>
      </header>

      {/* ── Single-column content ── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '60px 64px 80px',
          maxWidth: 1440,
          marginInline: 'auto',
        }}
      >
        {/* Hero illustration — lavender squircle + Mage + sparkles */}
        <div style={{ position: 'relative', width: 230, height: 230, marginBottom: 8 }}>
          {/* Lavender halo */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: 230,
              height: 230,
              borderRadius: 68,
              background: ONB.lavender,
            }}
          />
          {/* Mascot */}
          <div style={{ position: 'absolute', left: 20, top: 8 }}>
            <Mage pose="default" size={190} alt="Mage" priority />
          </div>
          {/* Gold sparkles */}
          <Sparkle size={24} color={ONB.gold} rotate={-12} style={{ position: 'absolute', left: 235, top: 17 }} />
          <Sparkle size={18} color={ONB.gold} rotate={-20} style={{ position: 'absolute', left: 247, top: 156 }} />
          {/* Purple sparkles */}
          <Sparkle size={16} color={ONB.primary} style={{ position: 'absolute', left: -34, top: 32 }} />
          <Sparkle size={13} color={ONB.primary} style={{ position: 'absolute', left: -14, top: 162 }} />
        </div>

        {/* Headline */}
        <h1
          style={{
            margin: '32px 0 0',
            textAlign: 'center',
            color: ONB.ink,
            fontFamily: ONB.font,
            fontWeight: 700,
            fontSize: 40,
            lineHeight: 1.3,
            letterSpacing: '-0.8px',
            maxWidth: 800,
          }}
        >
          First weak point found.
        </h1>

        {/* Subtitle */}
        <p
          style={{
            margin: '16px 0 0',
            maxWidth: 600,
            textAlign: 'center',
            color: ONB.muted,
            fontFamily: ONB.font,
            fontWeight: 400,
            fontSize: 17,
            lineHeight: 1.48,
          }}
        >
          {`You're doing well. Relationships between tables need a little more practice, so I added them to your review queue.`}
        </p>

        {/* Session complete card */}
        <div
          style={{
            marginTop: 32,
            width: '100%',
            maxWidth: 600,
            background: ONB.white,
            border: `1.2px solid ${ONB.line}`,
            borderRadius: 22,
            boxShadow: '0px 8px 24px rgba(58,46,102,0.08)',
            overflow: 'hidden',
            padding: '18px 0 18px',
          }}
        >
          <span
            style={{
              display: 'block',
              fontFamily: ONB.font,
              fontWeight: 700,
              fontSize: 17,
              color: ONB.ink,
              padding: '0 26px',
              marginBottom: 14,
            }}
          >
            Session complete
          </span>
          <div style={{ display: 'flex', padding: '0 8px' }}>
            <StatCol value="3" label="Answered"   color={ONB.ink} />
            <StatCol value="2" label="Correct"    color="#2fa968" />
            <StatCol value="1" label="Weak point" color="#f2a33c" />
            <StatCol value="1" label="Source"     color={ONB.primaryInk} />
          </div>
        </div>

        {/* Weak point card */}
        <div
          style={{
            marginTop: 16,
            width: '100%',
            maxWidth: 600,
            background: AMBER.bg,
            border: `1.2px solid ${AMBER.border}`,
            borderRadius: 22,
            overflow: 'hidden',
            padding: '0 0 20px',
          }}
        >
          {/* "Needs practice" pill */}
          <div style={{ padding: '20px 27px 0' }}>
            <span
              style={{
                display: 'inline-block',
                background: AMBER.pill,
                borderRadius: 14,
                padding: '5.5px 13px',
                fontFamily: ONB.font,
                fontWeight: 600,
                fontSize: 12,
                color: ONB.white,
                lineHeight: 1.3,
              }}
            >
              Needs practice
            </span>
          </div>

          {/* Topic title */}
          <p
            style={{
              margin: '12px 27px 0',
              fontFamily: ONB.font,
              fontWeight: 700,
              fontSize: 20,
              color: ONB.ink,
              lineHeight: 1.3,
            }}
          >
            Table relationships
          </p>

          {/* Topic description */}
          <p
            style={{
              margin: '6px 27px 0',
              fontFamily: ONB.font,
              fontWeight: 400,
              fontSize: 15,
              color: ONB.muted,
              lineHeight: 1.44,
            }}
          >
            You understood tables, but struggled with how records connect across tables.
          </p>

          {/* Divider */}
          <div
            style={{
              margin: '16px 27px',
              height: 1,
              background: AMBER.divider,
            }}
          />

          {/* Review queue row — Figma web places label + aside dot-separated on same line */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '0 27px',
            }}
          >
            {/* Gold circle with ↺ */}
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                background: AMBER.gold,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontFamily: ONB.font,
                  fontWeight: 700,
                  fontSize: 15,
                  color: AMBER.labelIcon,
                  lineHeight: 1,
                }}
              >
                ↺
              </span>
            </div>
            <span
              style={{
                fontFamily: ONB.font,
                fontWeight: 600,
                fontSize: 14,
                color: AMBER.label,
                lineHeight: 1.3,
              }}
            >
              Added to your review queue
            </span>
            <span
              style={{
                fontFamily: ONB.font,
                fontWeight: 500,
                fontSize: 14,
                color: ONB.muted,
                lineHeight: 1.3,
              }}
            >
              {`· You'll see this again after 2 sections.`}
            </span>
          </div>
        </div>

        {/* CTA row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            marginTop: 32,
          }}
        >
          <OnbButton
            radius={16}
            height={58}
            style={{ padding: '0 52px' }}
            onClick={() => router.push('/figma/onboarding/12-signup')}
          >
            Continue path
          </OnbButton>

          {/* "Save my progress" outlined button */}
          <button
            type="button"
            style={{
              height: 58,
              padding: '0 36px',
              borderRadius: 16,
              border: `1.6px solid ${ONB.paperLine}`,
              background: 'transparent',
              fontFamily: ONB.font,
              fontWeight: 600,
              fontSize: 17,
              color: ONB.primary,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
            onClick={() => router.push('/figma/onboarding/12-signup')}
          >
            Save my progress
          </button>
        </div>
      </div>
    </OnbWebFrame>
  );
}
