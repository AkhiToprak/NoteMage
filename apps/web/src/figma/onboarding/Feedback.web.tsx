'use client';

import { useRouter } from 'next/navigation';
import { Mage } from '@/figma/kit';
import { ONB, OnbButton, OnbWebFrame, Sparkle } from './shell';

/**
 * 10 Feedback — web (Figma 48:20). 1440-designed cream canvas.
 * Shows the CORRECT-answer feedback state: logo top-left nav, then a centered
 * column (max 640px) with green checkmark circle, "Correct." heading, skill
 * pill, Mage avatar speech bubble, explanation card, and "Next question" CTA.
 * Continue → 11-weak-point.
 */
export default function FeedbackWeb() {
  const router = useRouter();

  // ─── local colour aliases ────────────────────────────────────────────
  const circleGreen = '#2fa968';
  const headingGreen = '#0f6b3d';
  const pillBg = '#e2f5eb';
  const citeBg = '#f3ede1';

  return (
    <OnbWebFrame>
      {/* ── Top nav ────────────────────────────────────────────── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '46px 64px 0',
          maxWidth: 1440,
          marginInline: 'auto',
        }}
      >
        <Mage pose="logo-color" size={150} alt="NoteMage" priority />
      </header>

      {/* ── Main content: centered column ──────────────────────── */}
      <main
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '80px 40px 120px',
          maxWidth: 1440,
          marginInline: 'auto',
        }}
      >
        {/* ── Result cluster (circle + heading + sparkles) ── */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0,
          }}
        >
          {/* Decorative sparkles flanking the circle */}
          <Sparkle
            size={20}
            color={ONB.primary}
            rotate={-12}
            style={{ position: 'absolute', left: -54, top: 10 }}
          />
          <Sparkle
            size={14}
            color={ONB.gold}
            style={{ position: 'absolute', right: -72, top: 20 }}
          />

          {/* Green checkmark circle */}
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: 38,
              background: circleGreen,
              boxShadow: '0px 10px 12px rgba(47,169,104,0.38)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                color: ONB.white,
                fontFamily: ONB.font,
                fontWeight: 700,
                fontSize: 34,
                lineHeight: 1,
                userSelect: 'none',
              }}
            >
              ✓
            </span>
          </div>

          {/* "Correct." heading */}
          <h1
            style={{
              margin: '20px 0 0',
              color: headingGreen,
              fontFamily: ONB.font,
              fontWeight: 700,
              fontSize: 42,
              lineHeight: 1.3,
              letterSpacing: '-0.84px',
              textAlign: 'center',
            }}
          >
            Correct.
          </h1>
        </div>

        {/* ── Skill-gain pill ─────────────────────────────────── */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: 29,
            paddingInline: 11,
            borderRadius: 14.5,
            background: pillBg,
            marginTop: 12,
            userSelect: 'none',
          }}
        >
          <span
            style={{
              color: headingGreen,
              fontFamily: ONB.font,
              fontWeight: 600,
              fontSize: 13,
              lineHeight: 1.3,
              whiteSpace: 'nowrap',
            }}
          >
            Database basics +1
          </span>
        </div>

        {/* ── Avatar + speech bubble ──────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginTop: 38,
            width: '100%',
            maxWidth: 640,
          }}
        >
          {/* Mage avatar */}
          <div
            style={{
              flexShrink: 0,
              width: 52,
              height: 52,
              borderRadius: 26,
              background: ONB.lavender,
              border: `2px solid ${ONB.white}`,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img
              src="/figma/onboarding/mage-avatar.png"
              alt="Mage"
              width={50}
              height={50}
              style={{ objectFit: 'contain', pointerEvents: 'none' }}
              draggable={false}
            />
          </div>

          {/* Speech bubble */}
          <div
            style={{
              flex: 1,
              minHeight: 52,
              background: ONB.white,
              border: `1px solid ${ONB.line}`,
              borderRadius: 18,
              boxShadow: '0px 5px 7px rgba(58,46,102,0.07)',
              padding: '14px 17px',
            }}
          >
            <p
              style={{
                margin: 0,
                color: ONB.ink,
                fontFamily: ONB.font,
                fontWeight: 500,
                fontSize: 16,
                lineHeight: 1.38,
                whiteSpace: 'nowrap',
              }}
            >
              Exactly. In a table, one row usually represents one record.
            </p>
          </div>
        </div>

        {/* ── Explanation card ─────────────────────────────────── */}
        <div
          style={{
            position: 'relative',
            marginTop: 20,
            width: '100%',
            maxWidth: 640,
            background: ONB.white,
            border: `1.2px solid ${ONB.line}`,
            borderRadius: 22,
            boxShadow: '0px 8px 24px rgba(58,46,102,0.08)',
            overflow: 'hidden',
            paddingTop: 26,
            paddingBottom: 30,
            paddingLeft: 30,
            paddingRight: 30,
          }}
        >
          {/* Green left accent bar */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 5,
              bottom: 0,
              borderRadius: '2px 0 0 2px',
              background: circleGreen,
            }}
          />

          {/* "Here's why" label */}
          <p
            style={{
              margin: 0,
              color: headingGreen,
              fontFamily: ONB.font,
              fontWeight: 700,
              fontSize: 14,
              lineHeight: 1.3,
              letterSpacing: '0.14px',
            }}
          >
            {"Here's why"}
          </p>

          {/* Explanation body */}
          <p
            style={{
              margin: '14px 0 0',
              color: ONB.ink,
              fontFamily: ONB.font,
              fontWeight: 400,
              fontSize: 17,
              lineHeight: 1.52,
              maxWidth: 576,
            }}
          >
            In a student table, one row could represent one student. The columns
            describe that student, such as name, age, or class.
          </p>

          {/* Source citation chip */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 22,
              height: 34,
              paddingInline: 14,
              borderRadius: 17,
              background: citeBg,
              border: `1px solid ${ONB.line}`,
            }}
          >
            {/* Doc icon */}
            <span
              style={{
                position: 'relative',
                display: 'inline-block',
                width: 14,
                height: 17,
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  inset: 0,
                  border: `1.6px solid ${ONB.muted}`,
                  borderRadius: 2,
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  left: 3.5,
                  top: 5.5,
                  width: 7,
                  height: 1.6,
                  borderRadius: 1,
                  background: ONB.muted,
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  left: 3.5,
                  top: 9.5,
                  width: 7,
                  height: 1.6,
                  borderRadius: 1,
                  background: ONB.muted,
                }}
              />
            </span>
            <span
              style={{
                color: ONB.muted,
                fontFamily: ONB.font,
                fontWeight: 600,
                fontSize: 13.5,
                lineHeight: 1.3,
                whiteSpace: 'nowrap',
              }}
            >
              Source: Sample SQL Notes · page 2
            </span>
          </div>
        </div>

        {/* ── Continue CTA ─────────────────────────────────────── */}
        <div style={{ marginTop: 38 }}>
          <OnbButton
            radius={16}
            height={58}
            style={{ padding: '0 60px' }}
            onClick={() => router.push('/figma/onboarding/11-weak-point')}
          >
            Next question
          </OnbButton>
        </div>
      </main>
    </OnbWebFrame>
  );
}
