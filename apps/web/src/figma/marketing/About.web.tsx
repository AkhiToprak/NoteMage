'use client';

import { Mage } from '@/figma/kit';
import {
  ONB,
  MktWebFrame,
  MktTopNav,
  MarketingFooterBar,
  Sparkle,
} from './shell';

/**
 * About — web (Figma DDFpUOARLO01i5J2dMxsUT / 72:4). 1440×1747 cream canvas.
 * Centered single-column body text (max-width 680–760). No backend; static only.
 */
export default function AboutWeb() {
  return (
    <MktWebFrame>
      {/* ── Top nav ──────────────────────────────────────────────────── */}
      <MktTopNav />

      {/* ── Main content ─────────────────────────────────────────────── */}
      <main
        style={{
          maxWidth: 1440,
          marginInline: 'auto',
          padding: '0 64px',
        }}
      >
        {/* ── Header cluster ───────────────────────────────────────── */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 56,
            paddingBottom: 40,
          }}
        >
          {/* Decorative sparkle — top-left of headline area */}
          <Sparkle
            size={22}
            color={ONB.gold}
            rotate={-15}
            style={{ position: 'absolute', left: 300, top: 70 }}
          />

          {/* Small sparkle — right side */}
          <Sparkle
            size={15}
            color={ONB.primary}
            style={{ position: 'absolute', right: 340, top: 110 }}
          />

          {/* Mage peeking top-right — wink pose, slightly rotated */}
          <div
            style={{
              position: 'absolute',
              right: 255,
              top: 60,
              transform: 'rotate(4deg)',
            }}
          >
            <Mage pose="wink" size={96} alt="" />
          </div>

          {/* Eyebrow pill */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 29,
              padding: '0 14px',
              borderRadius: 14.5,
              background: ONB.lavender,
              marginBottom: 18,
            }}
          >
            <span
              style={{
                color: ONB.primaryInk,
                fontFamily: ONB.font,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 0,
                whiteSpace: 'pre',
              }}
            >
              {'✦  ABOUT NOTEMAGE'}
            </span>
          </div>

          {/* Headline */}
          <h1
            style={{
              margin: 0,
              fontFamily: ONB.font,
              fontSize: 64,
              fontWeight: 800,
              letterSpacing: '-1.92px',
              lineHeight: 1.04,
              color: ONB.ink,
              textAlign: 'center',
            }}
          >
            Challenge accepted
            <span style={{ color: '#7a5200' }}>.</span>
          </h1>

          {/* Gold underline accent */}
          <div
            style={{
              width: 250,
              height: 8,
              borderRadius: 4,
              background: '#ffde59',
              marginTop: 10,
            }}
          />

          {/* Subtitle */}
          <p
            style={{
              margin: '26px 0 0',
              fontFamily: ONB.font,
              fontSize: 19,
              fontWeight: 500,
              lineHeight: 1.46,
              color: ONB.muted,
              textAlign: 'center',
              maxWidth: 600,
            }}
          >
            A single dev. Fed up with the bad UI of the competitors.
          </p>
        </div>

        {/* ── Story body ───────────────────────────────────────────── */}
        <div
          style={{
            maxWidth: 680,
            marginInline: 'auto',
            paddingTop: 20,
          }}
        >
          {/* First paragraph with drop cap */}
          <p
            style={{
              margin: 0,
              fontFamily: ONB.font,
              fontSize: 19,
              fontWeight: 400,
              lineHeight: 1.72,
              color: ONB.ink,
            }}
          >
            <span
              style={{
                float: 'left',
                fontSize: 64,
                fontWeight: 800,
                lineHeight: 1.3,
                color: '#7a5200',
                marginRight: 4,
                marginTop: 0,
              }}
            >
              N
            </span>
            otemage was created by me, a single dev studying computer science,
            fed up with the clunky UI of the competitors, the constant
            tab-switching, and the noisy ads you only escape by paying the
            monthly $20 for EVERY. SINGLE. ONE of them.
          </p>

          {/* Quote block */}
          <div
            style={{
              position: 'relative',
              marginTop: 48,
              borderRadius: 24,
              background: ONB.lavender,
              border: `1.4px solid #d9cef2`,
              boxShadow: '0px 12px 32px 0px rgba(124,92,255,0.10)',
              overflow: 'hidden',
              padding: '54px 48px 40px',
            }}
          >
            {/* Big quotation mark */}
            <span
              style={{
                position: 'absolute',
                top: -7,
                left: 22,
                fontFamily: ONB.font,
                fontSize: 120,
                lineHeight: 1.3,
                color: '#d7ccf6',
                userSelect: 'none',
                pointerEvents: 'none',
              }}
            >
              &ldquo;
            </span>

            <p
              style={{
                margin: 0,
                fontFamily: ONB.font,
                fontSize: 30,
                fontWeight: 700,
                lineHeight: 1.28,
                color: ONB.ink,
                textAlign: 'center',
              }}
            >
              You&apos;re supposed to be able to build this yourself, no?
            </p>

            <p
              style={{
                margin: '24px 0 0',
                fontFamily: ONB.font,
                fontSize: 12,
                fontWeight: 500,
                lineHeight: 1.3,
                color: ONB.primary,
                textAlign: 'center',
                letterSpacing: '0.72px',
                textTransform: 'uppercase',
              }}
            >
              — SO I THOUGHT TO MYSELF
            </p>
          </div>

          {/* Paragraph — no-ads + free features */}
          <p
            style={{
              margin: '48px 0 0',
              fontFamily: ONB.font,
              fontSize: 19,
              fontWeight: 400,
              lineHeight: 1.72,
              color: ONB.ink,
            }}
          >
            That&apos;s why I have a{' '}
            <strong style={{ fontWeight: 700, color: '#7a5200' }}>strict no-ads policy</strong>{' '}
            and{' '}
            <strong style={{ fontWeight: 700, color: '#7a5200' }}>
              keep the core features of the app free
            </strong>
            . You only pay for AI usage — because, well… I have to pay for it :(
          </p>

          {/* Paragraph — bugs */}
          <p
            style={{
              margin: '24px 0 0',
              fontFamily: ONB.font,
              fontSize: 19,
              fontWeight: 400,
              lineHeight: 1.72,
              color: ONB.ink,
            }}
          >
            So if you hit any bugs, just reach out — I&apos;ll get them fixed as fast as I can.
          </p>

          {/* Contact me button */}
          <div style={{ marginTop: 32 }}>
            <button
              type="button"
              onClick={() => {}}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 52,
                padding: '0 32px',
                borderRadius: 26,
                border: 'none',
                background: '#ffde59',
                boxShadow: '0px 10px 12px rgba(255,200,61,0.30)',
                color: '#7a5200',
                fontFamily: ONB.font,
                fontSize: 15.5,
                fontWeight: 700,
                cursor: 'pointer',
                gap: 8,
                transition: 'opacity 0.18s cubic-bezier(0.22,1,0.36,1)',
                whiteSpace: 'pre',
              }}
            >
              {'✉   Contact me'}
            </button>
          </div>

          {/* Divider */}
          <div
            style={{
              height: 1,
              background: ONB.paperLine,
              marginTop: 64,
              marginBottom: 64,
            }}
          />

          {/* Paragraph — students */}
          <p
            style={{
              margin: 0,
              fontFamily: ONB.font,
              fontSize: 19,
              fontWeight: 400,
              lineHeight: 1.72,
              color: ONB.ink,
            }}
          >
            Notemage is built for students who want everything they need to study in one app — a
            genuinely nice UI, and{' '}
            <strong style={{ fontWeight: 700, color: ONB.primaryInk }}>
              a dev who actually cares
            </strong>{' '}
            about your wants and needs. Not a faceless corporation that can&apos;t be bothered.
            &nbsp;*cough cough*&nbsp; M-slop
          </p>
        </div>

        {/* ── Sticky note + Mage ───────────────────────────────────── */}
        <div
          style={{
            position: 'relative',
            maxWidth: 680,
            marginInline: 'auto',
            marginTop: 80,
            marginBottom: 80,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {/* Mage sitting left of the note */}
          <div
            style={{
              position: 'absolute',
              left: -26,
              bottom: -16,
              zIndex: 2,
            }}
          >
            <Mage pose="wand" size={120} alt="" />
          </div>

          {/* Sticky note */}
          <div
            style={{
              position: 'relative',
              transform: 'rotate(1.4deg)',
              zIndex: 1,
            }}
          >
            <div
              style={{
                background: '#ffde59',
                borderRadius: 8,
                width: 440,
                height: 150,
                overflow: 'hidden',
                boxShadow:
                  '0px 8px 20px 0px rgba(26,19,48,0.12), 0px 24px 48px 0px rgba(255,200,61,0.20)',
                position: 'relative',
              }}
            >
              {/* tape piece */}
              <div
                style={{
                  position: 'absolute',
                  top: -10,
                  left: 172,
                  width: 96,
                  height: 22,
                  borderRadius: 3,
                  background: ONB.white,
                  opacity: 0.6,
                }}
              />

              <p
                style={{
                  position: 'absolute',
                  top: 30,
                  left: 36,
                  margin: 0,
                  fontFamily: ONB.font,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '2.16px',
                  color: '#7a5200',
                  whiteSpace: 'nowrap',
                }}
              >
                P.S.
              </p>

              <p
                style={{
                  position: 'absolute',
                  top: 54,
                  left: 36,
                  margin: 0,
                  width: 368,
                  fontFamily: ONB.font,
                  fontSize: 24,
                  fontWeight: 700,
                  lineHeight: 1.3,
                  color: '#7a5200',
                }}
              >
                If you&apos;re reading this — have fun with Notemage!
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <MarketingFooterBar />
    </MktWebFrame>
  );
}
