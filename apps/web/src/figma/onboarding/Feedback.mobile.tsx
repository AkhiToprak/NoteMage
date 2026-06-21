'use client';

import { useRouter } from 'next/navigation';
import { ONB, OnbButton, OnbMobileFrame, Sparkle } from './shell';

/**
 * 10 Feedback — mobile (Figma 1:35). 393-wide cream phone column.
 * Shows the CORRECT-answer feedback state: green checkmark result banner,
 * "Correct." heading, skill-gain pill, Mage avatar speech bubble, and an
 * explanation card with a green accent bar + "Here's why" + source citation.
 * Continue → 11-weak-point.
 */
export default function FeedbackMobile() {
  const router = useRouter();

  // ─── colours not in ONB ──────────────────────────────────────────────
  // Figma uses a slightly brighter emerald for the circle fill (#2fa968)
  // and the darkest green (#0f6b3d) for the heading / "Here's why" label.
  // Both are one-off on this screen; kept inline so the ONB palette
  // stays canonical.
  const circleGreen = '#2fa968';
  const headingGreen = '#0f6b3d';
  const pillBg = '#e2f5eb';         // one shade lighter than ONB.greenSoft
  const citeBg = '#f3ede1';         // warm beige chip background

  return (
    <OnbMobileFrame>
      {/* ── Result row ─────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginTop: 52,
          paddingLeft: 24,
          position: 'relative',
        }}
      >
        {/* Green checkmark circle */}
        <div
          style={{
            flexShrink: 0,
            width: 60,
            height: 60,
            borderRadius: 30,
            background: circleGreen,
            boxShadow: '0px 8px 9px rgba(47,169,104,0.38)',
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
              fontSize: 26,
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
            margin: 0,
            color: headingGreen,
            fontFamily: ONB.font,
            fontWeight: 700,
            fontSize: 30,
            lineHeight: 1.1,
            letterSpacing: '-0.6px',
          }}
        >
          Correct.
        </h1>

        {/* Decorative sparkles near the heading */}
        <Sparkle
          size={15}
          color={ONB.primary}
          rotate={-12}
          style={{ position: 'absolute', right: 69, top: -1 }}
        />
        <Sparkle
          size={10}
          color={ONB.gold}
          style={{ position: 'absolute', right: 54, top: 14 }}
        />
      </div>

      {/* ── Skill-gain pill ────────────────────────────────────── */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          height: 28,
          paddingInline: 11,
          borderRadius: 14,
          background: pillBg,
          marginTop: 6,
          marginLeft: 100,
          userSelect: 'none',
        }}
      >
        <span
          style={{
            color: headingGreen,
            fontFamily: ONB.font,
            fontWeight: 600,
            fontSize: 12,
            lineHeight: 1.3,
            whiteSpace: 'nowrap',
          }}
        >
          Database basics +1
        </span>
      </div>

      {/* ── Avatar + speech bubble ─────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          marginTop: 28,
          paddingLeft: 24,
          paddingRight: 24,
        }}
      >
        {/* Mage avatar circle */}
        <div
          style={{
            flexShrink: 0,
            width: 46,
            height: 46,
            borderRadius: 23,
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
            width={44}
            height={44}
            style={{ objectFit: 'contain', pointerEvents: 'none' }}
            draggable={false}
          />
        </div>

        {/* Speech bubble */}
        <div
          style={{
            flex: 1,
            minHeight: 62,
            background: ONB.white,
            border: `1px solid ${ONB.line}`,
            borderRadius: 16,
            boxShadow: '0px 4px 6px rgba(58,46,102,0.06)',
            padding: '10px 13px',
          }}
        >
          <p
            style={{
              margin: 0,
              color: ONB.ink,
              fontFamily: ONB.font,
              fontWeight: 500,
              fontSize: 15,
              lineHeight: 1.34,
            }}
          >
            Exactly. In a table, one row usually represents one record.
          </p>
        </div>
      </div>

      {/* ── Explanation card ───────────────────────────────────── */}
      <div
        style={{
          position: 'relative',
          marginTop: 20,
          marginLeft: 24,
          marginRight: 24,
          background: ONB.white,
          border: `1.2px solid ${ONB.line}`,
          borderRadius: 22,
          boxShadow: '0px 5px 16px rgba(58,46,102,0.07)',
          overflow: 'hidden',
          paddingTop: 16,
          paddingBottom: 24,
          paddingLeft: 20,
          paddingRight: 20,
        }}
      >
        {/* Green left accent bar */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 4,
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
            fontSize: 13.5,
            lineHeight: 1.3,
          }}
        >
          {"Here's why"}
        </p>

        {/* Explanation body */}
        <p
          style={{
            margin: '10px 0 0',
            color: ONB.ink,
            fontFamily: ONB.font,
            fontWeight: 400,
            fontSize: 15.5,
            lineHeight: 1.52,
            maxWidth: 307,
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
            marginTop: 18,
            height: 30,
            paddingInline: 12,
            borderRadius: 15,
            background: citeBg,
            border: `1px solid ${ONB.line}`,
          }}
        >
          {/* Doc icon */}
          <span
            style={{
              position: 'relative',
              display: 'inline-block',
              width: 13,
              height: 16,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                position: 'absolute',
                inset: 0,
                border: `1.5px solid ${ONB.muted}`,
                borderRadius: 2,
              }}
            />
            <span
              style={{
                position: 'absolute',
                left: 3,
                top: 5,
                width: 6,
                height: 1.4,
                borderRadius: 1,
                background: ONB.muted,
              }}
            />
            <span
              style={{
                position: 'absolute',
                left: 3,
                top: 8,
                width: 6,
                height: 1.4,
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
              fontSize: 12.5,
              lineHeight: 1.3,
              whiteSpace: 'nowrap',
            }}
          >
            Source: Sample SQL Notes · page 2
          </span>
        </div>
      </div>

      {/* ── Spacer + Continue CTA ─────────────────────────────── */}
      <div style={{ flex: 1 }} />
      <div style={{ padding: '16px 24px 8px' }}>
        <OnbButton
          block
          radius={18}
          height={56}
          onClick={() => router.push('/figma/onboarding/11-weak-point')}
        >
          Next question
        </OnbButton>
      </div>
    </OnbMobileFrame>
  );
}
