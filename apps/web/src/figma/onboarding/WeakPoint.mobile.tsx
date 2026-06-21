'use client';

import { useRouter } from 'next/navigation';
import { Mage } from '@/figma/kit';
import { ONB, OnbButton, OnbMobileFrame, Sparkle } from './shell';

/**
 * 11 Weak point — mobile (Figma 1:37). 393×852, warm/cream.
 *
 * Layout (top→bottom):
 *  • Mage mascot + lavender halo + gold/purple sparkles (hero)
 *  • "First weak point found." headline
 *  • Subtitle text
 *  • "Session complete" white stats card (Answered / Correct / Weak point / Source)
 *  • Amber "Needs practice" card (topic + review-queue row)
 *  • "Continue path" CTA (→ 12-signup)
 *  • "Save my progress" ghost link
 *
 * No back control in the Figma frame. Interactions = mock-state only.
 */

/** Amber / "needs practice" tones extracted from node 41:33–42 */
const AMBER = {
  bg: '#fcefd9',
  border: '#f0dbb4',
  pill: '#f2a33c',
  divider: '#ebd9b6',
  gold: ONB.gold,           // #ffc83d — review icon circle
  ink: '#18202f',
  label: '#8a5a12',         // "Added to review queue" label
  labelIcon: '#7a5200',     // ↺ icon tint
} as const;

/** One statistic column in the "Session complete" card. */
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
          fontSize: 22,
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
          fontSize: 11,
          color: ONB.muted,
          marginTop: 6,
          textAlign: 'center',
        }}
      >
        {label}
      </span>
    </div>
  );
}

export default function WeakPointMobile() {
  const router = useRouter();

  return (
    <OnbMobileFrame>
      {/* ── Hero: lavender halo + Mage mascot + sparkles ── */}
      <div style={{ position: 'relative', width: '100%', height: 210, marginTop: 8 }}>
        {/* Lavender squircle halo */}
        <div
          style={{
            position: 'absolute',
            left: 93.5,
            top: 2,
            width: 206,
            height: 206,
            borderRadius: 62,
            background: ONB.lavender,
          }}
        />
        {/* Mascot — "default" pose (book mascot matches Figma art) */}
        <div style={{ position: 'absolute', left: 113.5, top: 10 }}>
          <Mage pose="default" size={166} alt="Mage" priority />
        </div>
        {/* Gold sparkles */}
        <Sparkle size={20} color={ONB.gold} rotate={-12} style={{ position: 'absolute', left: 292, top: 18 }} />
        <Sparkle size={13} color={ONB.gold} rotate={-20} style={{ position: 'absolute', left: 296, top: 143 }} />
        {/* Purple sparkles */}
        <Sparkle size={13} color={ONB.primary} style={{ position: 'absolute', left: 84, top: 34 }} />
        <Sparkle size={10} color={ONB.primary} style={{ position: 'absolute', left: 86, top: 148 }} />
      </div>

      {/* ── Headline ── */}
      <h1
        style={{
          margin: '16px auto 0',
          maxWidth: 345,
          padding: '0 24px',
          textAlign: 'center',
          color: ONB.ink,
          fontFamily: ONB.font,
          fontWeight: 700,
          fontSize: 27,
          lineHeight: 1.14,
          letterSpacing: '-0.405px',
        }}
      >
        First weak point found.
      </h1>

      {/* ── Subtitle ── */}
      <p
        style={{
          margin: '10px auto 0',
          maxWidth: 330,
          padding: '0 24px',
          textAlign: 'center',
          color: ONB.muted,
          fontFamily: ONB.font,
          fontWeight: 400,
          fontSize: 15,
          lineHeight: 1.46,
        }}
      >
        {`You're doing well. Relationships between tables need a little more practice, so I added them to your review queue.`}
      </p>

      {/* ── Session complete card ── */}
      <div
        style={{
          margin: '20px 24px 0',
          background: ONB.white,
          border: `1.2px solid ${ONB.line}`,
          borderRadius: 22,
          boxShadow: '0px 5px 16px rgba(58,46,102,0.07)',
          overflow: 'hidden',
          padding: '14px 0 16px',
        }}
      >
        <span
          style={{
            display: 'block',
            fontFamily: ONB.font,
            fontWeight: 700,
            fontSize: 16.5,
            color: ONB.ink,
            padding: '0 18px',
            marginBottom: 12,
          }}
        >
          Session complete
        </span>
        <div style={{ display: 'flex', padding: '0 4px' }}>
          <StatCol value="3" label="Answered"   color={ONB.ink} />
          <StatCol value="2" label="Correct"    color="#2fa968" />
          <StatCol value="1" label="Weak point" color="#f2a33c" />
          <StatCol value="1" label="Source"     color={ONB.primaryInk} />
        </div>
      </div>

      {/* ── Weak point card ── */}
      <div
        style={{
          margin: '14px 24px 0',
          background: AMBER.bg,
          border: `1.2px solid ${AMBER.border}`,
          borderRadius: 22,
          overflow: 'hidden',
          padding: '0 0 16px',
        }}
      >
        {/* "Needs practice" pill */}
        <div style={{ padding: '16px 17px 0' }}>
          <span
            style={{
              display: 'inline-block',
              background: AMBER.pill,
              borderRadius: 13.5,
              padding: '5px 12px',
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
            margin: '10px 17px 0',
            fontFamily: ONB.font,
            fontWeight: 700,
            fontSize: 18,
            color: ONB.ink,
            lineHeight: 1.3,
          }}
        >
          Table relationships
        </p>

        {/* Topic description */}
        <p
          style={{
            margin: '6px 17px 0',
            fontFamily: ONB.font,
            fontWeight: 400,
            fontSize: 14,
            color: ONB.muted,
            lineHeight: 1.44,
          }}
        >
          You understood tables, but struggled with how records connect across tables.
        </p>

        {/* Divider */}
        <div
          style={{
            margin: '14px 17px',
            height: 1,
            background: AMBER.divider,
          }}
        />

        {/* Review queue row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 17px' }}>
          {/* Gold circle with ↺ */}
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
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
                fontSize: 14,
                color: AMBER.labelIcon,
                lineHeight: 1,
              }}
            >
              ↺
            </span>
          </div>
          <div>
            <p
              style={{
                margin: 0,
                fontFamily: ONB.font,
                fontWeight: 600,
                fontSize: 13.5,
                color: AMBER.label,
                lineHeight: 1.3,
              }}
            >
              Added to your review queue
            </p>
            <p
              style={{
                margin: '2px 0 0',
                fontFamily: ONB.font,
                fontWeight: 500,
                fontSize: 12.5,
                color: ONB.muted,
                lineHeight: 1.3,
              }}
            >
              {`You'll see this again after 2 sections.`}
            </p>
          </div>
        </div>
      </div>

      {/* ── CTAs pinned toward the bottom ── */}
      <div style={{ marginTop: 'auto', padding: '24px 24px 0' }}>
        <OnbButton
          block
          radius={18}
          height={56}
          onClick={() => router.push('/figma/onboarding/12-signup')}
        >
          Continue path
        </OnbButton>
      </div>

      {/* "Save my progress" ghost link */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 24px 0' }}>
        <button
          type="button"
          style={{
            border: 'none',
            background: 'transparent',
            fontFamily: ONB.font,
            fontWeight: 600,
            fontSize: 16,
            color: ONB.primary,
            cursor: 'pointer',
            padding: 0,
          }}
          onClick={() => router.push('/figma/onboarding/12-signup')}
        >
          Save my progress
        </button>
      </div>
    </OnbMobileFrame>
  );
}
