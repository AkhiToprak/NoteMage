'use client';

import { useRouter } from 'next/navigation';
import { Mage } from '@/figma/kit';
import { ONB, OnbButton, OnbWebFrame } from './shell';

/**
 * 08 Study session — web (Figma 48:16). 1440-designed cream canvas.
 * Two-column layout: left sidebar (logo at 64 top-46, back at 64 top-120)
 * + right content column starting at 360px.
 * Mage speech-bubble intro → lesson card → key idea → "Start quiz" CTA → 09-quiz.
 */
export default function StudySessionWeb() {
  const router = useRouter();

  return (
    <OnbWebFrame>
      <div
        style={{
          position: 'relative',
          maxWidth: 1440,
          marginInline: 'auto',
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Left sidebar — logo + back button */}
        <div
          style={{
            position: 'absolute',
            left: 64,
            top: 0,
          }}
        >
          {/* Logo */}
          <div style={{ marginTop: 46 }}>
            <Mage pose="logo-color" size={132} alt="NoteMage" priority />
          </div>
          {/* Back button */}
          <button
            type="button"
            onClick={() => router.push('/figma/onboarding/07-path-reveal')}
            style={{
              marginTop: 28,
              width: 44,
              height: 44,
              borderRadius: 22,
              border: `1px solid ${ONB.line}`,
              background: ONB.white,
              boxShadow: '0px 4px 5px rgba(58,46,102,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: ONB.ink,
              fontFamily: ONB.font,
              fontSize: 20,
              fontWeight: 600,
            }}
            aria-label="Back"
          >
            ←
          </button>
        </div>

        {/* Right content column — starts at 360px */}
        <div
          style={{
            marginLeft: 360,
            paddingTop: 118,
            paddingRight: 64,
            paddingBottom: 80,
          }}
        >
          {/* Lesson title + meta */}
          <h1
            style={{
              margin: 0,
              color: ONB.ink,
              fontFamily: ONB.font,
              fontWeight: 700,
              fontSize: 34,
              lineHeight: 1.3,
              letterSpacing: '-0.51px',
            }}
          >
            Database basics
          </h1>
          <p
            style={{
              margin: '6px 0 0',
              color: ONB.muted,
              fontFamily: ONB.font,
              fontWeight: 600,
              fontSize: 15,
              lineHeight: 1.3,
            }}
          >
            First section · 3 min
          </p>

          {/* Mage avatar + speech bubble */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              marginTop: 20,
            }}
          >
            {/* Avatar */}
            <div
              style={{
                flex: '0 0 52px',
                width: 52,
                height: 52,
                borderRadius: 26,
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
                  width: 50,
                  height: 50,
                  objectFit: 'contain',
                }}
              />
            </div>
            {/* Bubble */}
            <div
              style={{
                flex: '0 1 656px',
                background: ONB.white,
                border: `1px solid ${ONB.line}`,
                borderRadius: 18,
                padding: '14px 17px',
                boxShadow: '0px 5px 7px rgba(58,46,102,0.07)',
                minHeight: 52,
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
                  fontSize: 16,
                  lineHeight: 1.38,
                }}
              >
                {"Let's start small. Read this, then I'll check your understanding with 3 questions."}
              </p>
            </div>
          </div>

          {/* Lesson card */}
          <div
            style={{
              marginTop: 20,
              width: 720,
              background: ONB.white,
              border: `1.2px solid ${ONB.line}`,
              borderRadius: 24,
              overflow: 'hidden',
              boxShadow: '0px 8px 24px 0px rgba(58,46,102,0.08)',
            }}
          >
            {/* Short explanation header */}
            <p
              style={{
                margin: 0,
                padding: '26.8px 30.8px 0',
                color: ONB.primaryInk,
                fontFamily: ONB.font,
                fontWeight: 700,
                fontSize: 14,
                lineHeight: 1.3,
                letterSpacing: '0.14px',
              }}
            >
              Short explanation
            </p>
            {/* Body text */}
            <p
              style={{
                margin: 0,
                padding: '12px 30.8px 0',
                color: ONB.ink,
                fontFamily: ONB.font,
                fontWeight: 400,
                fontSize: 18,
                lineHeight: 1.58,
              }}
            >
              Databases store related information in a structured way. Instead of keeping everything in one long
              document, data is organized into tables, rows, and columns.
            </p>
            {/* Example callout */}
            <div
              style={{
                margin: '16px 30.8px 0',
                background: '#f4efe3',
                borderRadius: 14,
                overflow: 'hidden',
              }}
            >
              <p
                style={{
                  margin: 0,
                  padding: '18px 20px 0',
                  color: '#7a5200',
                  fontFamily: ONB.font,
                  fontWeight: 700,
                  fontSize: 11,
                  lineHeight: 1.3,
                  letterSpacing: '0.88px',
                }}
              >
                EXAMPLE
              </p>
              <p
                style={{
                  margin: 0,
                  padding: '6px 20px 18px',
                  color: ONB.muted,
                  fontFamily: ONB.font,
                  fontWeight: 400,
                  fontSize: 15,
                  lineHeight: 1.48,
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
                gap: 9,
                margin: '16px 30.8px 26.8px',
                background: '#f3ede1',
                border: `1px solid ${ONB.line}`,
                borderRadius: 17,
                padding: '7px 14px',
                height: 34,
              }}
            >
              {/* Mini document icon */}
              <span
                style={{ position: 'relative', width: 14, height: 17, display: 'inline-flex', flexShrink: 0 }}
              >
                <span
                  style={{
                    position: 'absolute',
                    left: 1,
                    top: 1,
                    width: 12,
                    height: 15,
                    borderRadius: 2,
                    border: `1.6px solid ${ONB.muted}`,
                  }}
                />
                <span
                  style={{
                    position: 'absolute',
                    left: 4,
                    top: 6,
                    width: 7,
                    height: 1.6,
                    borderRadius: 1,
                    background: ONB.muted,
                  }}
                />
                <span
                  style={{
                    position: 'absolute',
                    left: 4,
                    top: 10,
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

          {/* Key idea callout */}
          <div
            style={{
              marginTop: 18,
              width: 720,
              background: '#fff3d6',
              borderRadius: 18,
              overflow: 'hidden',
              position: 'relative',
              minHeight: 112,
            }}
          >
            {/* gold left bar */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: 5,
                borderRadius: 2,
                background: ONB.gold,
              }}
            />
            <p
              style={{
                margin: 0,
                padding: '18px 28px 0',
                color: '#7a5200',
                fontFamily: ONB.font,
                fontWeight: 700,
                fontSize: 12,
                lineHeight: 1.3,
                letterSpacing: '0.72px',
              }}
            >
              KEY IDEA
            </p>
            <p
              style={{
                margin: 0,
                padding: '8px 28px 20px',
                color: ONB.ink,
                fontFamily: ONB.font,
                fontWeight: 600,
                fontSize: 16,
                lineHeight: 1.44,
              }}
            >
              Tables organize data. Rows represent records. Columns represent attributes.
            </p>
          </div>

          {/* CTA */}
          <div style={{ marginTop: 24, width: 720 }}>
            <OnbButton block radius={16} height={58} onClick={() => router.push('/figma/onboarding/09-quiz')}>
              Start quiz
            </OnbButton>
          </div>
        </div>
      </div>
    </OnbWebFrame>
  );
}
