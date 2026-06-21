'use client';

import { useRouter } from 'next/navigation';
import { ONB, OnbButton, OnbMobileFrame } from './shell';

/**
 * 08 Study session — mobile (Figma 1:31). 393-wide cream.
 * Mage speech-bubble intro → lesson card (short explanation + example + cite)
 * → key idea callout → "Start quiz" CTA → 09-quiz.
 */
export default function StudySessionMobile() {
  const router = useRouter();

  return (
    <OnbMobileFrame contentStyle={{ overflowY: 'auto' }}>
      {/* Back button */}
      <div style={{ padding: '10px 20px 0', flex: '0 0 auto' }}>
        <button
          type="button"
          onClick={() => router.push('/figma/onboarding/07-path-reveal')}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            border: `1px solid ${ONB.line}`,
            background: ONB.white,
            boxShadow: '0px 4px 5px rgba(58,46,102,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: ONB.ink,
            fontFamily: ONB.font,
            fontSize: 18,
            fontWeight: 600,
          }}
          aria-label="Back"
        >
          ←
        </button>
      </div>

      {/* Lesson title + meta */}
      <div style={{ padding: '12px 24px 0', flex: '0 0 auto' }}>
        <h1
          style={{
            margin: 0,
            color: ONB.ink,
            fontFamily: ONB.font,
            fontWeight: 700,
            fontSize: 25,
            lineHeight: 1.12,
            letterSpacing: '-0.375px',
          }}
        >
          Database basics
        </h1>
        <p
          style={{
            margin: '4px 0 0',
            color: ONB.muted,
            fontFamily: ONB.font,
            fontWeight: 600,
            fontSize: 14,
            lineHeight: 1.3,
          }}
        >
          First section · 3 min
        </p>
      </div>

      {/* Mage avatar + speech bubble */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '16px 20px 0',
          flex: '0 0 auto',
        }}
      >
        {/* Avatar */}
        <div
          style={{
            flex: '0 0 46px',
            width: 46,
            height: 46,
            borderRadius: 23,
            background: ONB.lavender,
            border: '2px solid #ffffff',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <img
            src="/figma/onboarding/mage-avatar-study.png"
            alt="Mage"
            style={{
              position: 'absolute',
              top: 1,
              left: -1,
              width: 44,
              height: 44,
              objectFit: 'contain',
            }}
          />
        </div>
        {/* Bubble */}
        <div
          style={{
            flex: 1,
            background: ONB.white,
            border: `1px solid ${ONB.line}`,
            borderRadius: 16,
            padding: '10px 13px',
            boxShadow: '0px 4px 6px rgba(58,46,102,0.06)',
            minHeight: 82,
            display: 'flex',
            alignItems: 'center',
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
            {"Let's start small. Read this, then I'll check your understanding with 3 questions."}
          </p>
        </div>
      </div>

      {/* Lesson card */}
      <div
        style={{
          margin: '16px 24px 0',
          background: ONB.white,
          border: `1.2px solid ${ONB.line}`,
          borderRadius: 22,
          overflow: 'hidden',
          boxShadow: '0px 5px 16px 0px rgba(58,46,102,0.07)',
          flex: '0 0 auto',
        }}
      >
        {/* Short explanation header */}
        <p
          style={{
            margin: 0,
            padding: '16.8px 16.8px 0',
            color: ONB.primaryInk,
            fontFamily: ONB.font,
            fontWeight: 700,
            fontSize: 13,
            lineHeight: 1.3,
            letterSpacing: '0.13px',
          }}
        >
          Short explanation
        </p>
        {/* Body text */}
        <p
          style={{
            margin: 0,
            padding: '10px 16.8px 0',
            color: ONB.ink,
            fontFamily: ONB.font,
            fontWeight: 400,
            fontSize: 15.5,
            lineHeight: 1.52,
          }}
        >
          Databases store related information in a structured way. Instead of keeping everything in one long document,
          data is organized into tables, rows, and columns.
        </p>
        {/* Example callout */}
        <div
          style={{
            margin: '16.8px 16.8px 0',
            background: '#f4efe3',
            borderRadius: 12,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <p
            style={{
              margin: 0,
              padding: '14px 14px 0',
              color: '#7a5200',
              fontFamily: ONB.font,
              fontWeight: 700,
              fontSize: 10.5,
              lineHeight: 1.3,
              letterSpacing: '0.84px',
            }}
          >
            EXAMPLE
          </p>
          <p
            style={{
              margin: 0,
              padding: '4px 14px 14px',
              color: ONB.muted,
              fontFamily: ONB.font,
              fontWeight: 400,
              fontSize: 13.5,
              lineHeight: 1.44,
            }}
          >
            A student database can store students, classes, grades, and teachers in separate tables.
          </p>
        </div>
        {/* Source citation pill */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            margin: '14px 16.8px 16.8px',
            background: '#f3ede1',
            border: `1px solid ${ONB.line}`,
            borderRadius: 15,
            padding: '6px 12px',
            height: 30,
          }}
        >
          {/* Mini document icon */}
          <span style={{ position: 'relative', width: 13, height: 16, display: 'inline-flex', flexShrink: 0 }}>
            <span
              style={{
                position: 'absolute',
                left: 1,
                top: 1,
                width: 11,
                height: 14,
                borderRadius: 2,
                border: `1.5px solid ${ONB.muted}`,
              }}
            />
            <span
              style={{
                position: 'absolute',
                left: 4,
                top: 6,
                width: 6,
                height: 1.4,
                borderRadius: 1,
                background: ONB.muted,
              }}
            />
            <span
              style={{
                position: 'absolute',
                left: 4,
                top: 9,
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

      {/* Key idea callout */}
      <div
        style={{
          margin: '14px 24px 0',
          background: '#fff3d6',
          borderRadius: 18,
          overflow: 'hidden',
          position: 'relative',
          minHeight: 104,
          flex: '0 0 auto',
        }}
      >
        {/* gold left bar */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            borderRadius: 2,
            background: ONB.gold,
          }}
        />
        <p
          style={{
            margin: 0,
            padding: '16px 20px 0',
            color: '#7a5200',
            fontFamily: ONB.font,
            fontWeight: 700,
            fontSize: 11.5,
            lineHeight: 1.3,
            letterSpacing: '0.69px',
          }}
        >
          KEY IDEA
        </p>
        <p
          style={{
            margin: 0,
            padding: '6px 20px 16px',
            color: ONB.ink,
            fontFamily: ONB.font,
            fontWeight: 600,
            fontSize: 14.5,
            lineHeight: 1.42,
          }}
        >
          Tables organize data. Rows represent records. Columns represent attributes.
        </p>
      </div>

      {/* CTA */}
      <div style={{ padding: '20px 24px 10px', flex: '0 0 auto' }}>
        <OnbButton block radius={18} height={56} onClick={() => router.push('/figma/onboarding/09-quiz')}>
          Start quiz
        </OnbButton>
      </div>
    </OnbMobileFrame>
  );
}
