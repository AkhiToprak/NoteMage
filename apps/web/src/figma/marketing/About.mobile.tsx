'use client';

import { Mage } from '@/figma/kit';
import { ONB, OnbMobileFrame, Sparkle } from './shell';

/**
 * About — mobile (derived 393-wide single-column reflow; web-only in Figma —
 * known gap). Cream background, same copy as the web version.
 */
export default function AboutMobile() {
  return (
    <OnbMobileFrame>
      <div style={{ background: ONB.cream, minHeight: '100%', fontFamily: ONB.font }}>
        {/* ── Minimal top bar ──────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px 24px 12px',
          }}
        >
          <Mage pose="logo-color" size={110} alt="NoteMage" priority />
        </div>

        {/* ── Header cluster ───────────────────────────────────────── */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '12px 24px 24px',
            textAlign: 'center',
          }}
        >
          {/* Decorative sparkle */}
          <Sparkle
            size={16}
            color={ONB.gold}
            rotate={-15}
            style={{ position: 'absolute', left: 28, top: 20 }}
          />

          {/* Mage peeking top-right */}
          <div
            style={{
              position: 'absolute',
              right: 18,
              top: 4,
              transform: 'rotate(4deg)',
            }}
          >
            <Mage pose="wink" size={72} alt="" />
          </div>

          {/* Eyebrow pill */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 26,
              padding: '0 12px',
              borderRadius: 13,
              background: ONB.lavender,
              marginBottom: 14,
            }}
          >
            <span
              style={{
                color: ONB.primaryInk,
                fontFamily: ONB.font,
                fontSize: 11,
                fontWeight: 600,
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
              fontSize: 38,
              fontWeight: 800,
              letterSpacing: '-1.2px',
              lineHeight: 1.08,
              color: ONB.ink,
              textAlign: 'center',
            }}
          >
            Challenge accepted
            <span style={{ color: '#7a5200' }}>.</span>
          </h1>

          {/* Gold underline */}
          <div
            style={{
              width: 160,
              height: 6,
              borderRadius: 3,
              background: '#ffde59',
              marginTop: 8,
            }}
          />

          {/* Subtitle */}
          <p
            style={{
              margin: '16px 0 0',
              fontFamily: ONB.font,
              fontSize: 16,
              fontWeight: 500,
              lineHeight: 1.5,
              color: ONB.muted,
              textAlign: 'center',
            }}
          >
            A single dev. Fed up with the bad UI of the competitors.
          </p>
        </div>

        {/* ── Story body ───────────────────────────────────────────── */}
        <div style={{ padding: '8px 24px 0' }}>
          {/* First paragraph — drop cap */}
          <p
            style={{
              margin: 0,
              fontFamily: ONB.font,
              fontSize: 16,
              fontWeight: 400,
              lineHeight: 1.7,
              color: ONB.ink,
            }}
          >
            <span
              style={{
                float: 'left',
                fontSize: 48,
                fontWeight: 800,
                lineHeight: 1.25,
                color: '#7a5200',
                marginRight: 3,
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
              marginTop: 32,
              borderRadius: 20,
              background: ONB.lavender,
              border: `1.4px solid #d9cef2`,
              boxShadow: '0px 8px 24px 0px rgba(124,92,255,0.10)',
              overflow: 'hidden',
              padding: '48px 28px 32px',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: -7,
                left: 16,
                fontFamily: ONB.font,
                fontSize: 100,
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
                fontSize: 22,
                fontWeight: 700,
                lineHeight: 1.3,
                color: ONB.ink,
                textAlign: 'center',
              }}
            >
              You&apos;re supposed to be able to build this yourself, no?
            </p>

            <p
              style={{
                margin: '18px 0 0',
                fontFamily: ONB.font,
                fontSize: 11,
                fontWeight: 500,
                lineHeight: 1.3,
                color: ONB.primary,
                textAlign: 'center',
                letterSpacing: '0.66px',
                textTransform: 'uppercase',
              }}
            >
              — SO I THOUGHT TO MYSELF
            </p>
          </div>

          {/* Paragraph — no-ads */}
          <p
            style={{
              margin: '32px 0 0',
              fontFamily: ONB.font,
              fontSize: 16,
              fontWeight: 400,
              lineHeight: 1.7,
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
              margin: '18px 0 0',
              fontFamily: ONB.font,
              fontSize: 16,
              fontWeight: 400,
              lineHeight: 1.7,
              color: ONB.ink,
            }}
          >
            So if you hit any bugs, just reach out — I&apos;ll get them fixed as fast as I can.
          </p>

          {/* Contact me button */}
          <div style={{ marginTop: 24 }}>
            <button
              type="button"
              onClick={() => {}}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 48,
                padding: '0 26px',
                borderRadius: 24,
                border: 'none',
                background: '#ffde59',
                boxShadow: '0px 8px 10px rgba(255,200,61,0.28)',
                color: '#7a5200',
                fontFamily: ONB.font,
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
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
              marginTop: 40,
              marginBottom: 40,
            }}
          />

          {/* Paragraph — students */}
          <p
            style={{
              margin: 0,
              fontFamily: ONB.font,
              fontSize: 16,
              fontWeight: 400,
              lineHeight: 1.7,
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

          {/* Sticky note + Mage */}
          <div
            style={{
              position: 'relative',
              marginTop: 48,
              marginBottom: 16,
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            {/* Mage sits below-left of note */}
            <div
              style={{
                position: 'absolute',
                left: -4,
                bottom: -20,
                zIndex: 2,
              }}
            >
              <Mage pose="wand" size={80} alt="" />
            </div>

            <div
              style={{
                transform: 'rotate(1.4deg)',
                zIndex: 1,
              }}
            >
              <div
                style={{
                  background: '#ffde59',
                  borderRadius: 8,
                  width: 280,
                  padding: '36px 24px 24px',
                  boxShadow:
                    '0px 6px 16px 0px rgba(26,19,48,0.12), 0px 16px 32px 0px rgba(255,200,61,0.20)',
                  position: 'relative',
                }}
              >
                {/* tape */}
                <div
                  style={{
                    position: 'absolute',
                    top: -8,
                    left: 100,
                    width: 70,
                    height: 16,
                    borderRadius: 2,
                    background: ONB.white,
                    opacity: 0.6,
                  }}
                />

                <p
                  style={{
                    margin: '0 0 8px',
                    fontFamily: ONB.font,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '2px',
                    color: '#7a5200',
                  }}
                >
                  P.S.
                </p>

                <p
                  style={{
                    margin: 0,
                    fontFamily: ONB.font,
                    fontSize: 18,
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
        </div>

        {/* ── Footer ───────────────────────────────────────────────── */}
        <div style={{ marginTop: 80 }}>
          <footer
            style={{
              borderTop: `1px solid ${ONB.line}`,
              padding: '32px 24px 40px',
              textAlign: 'center',
            }}
          >
            <Mage pose="logo-color" size={110} alt="NoteMage" />
            <p
              style={{
                margin: '16px 0 0',
                color: ONB.muted2,
                fontFamily: ONB.font,
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              © 2026 Notemage
            </p>
          </footer>
        </div>
      </div>
    </OnbMobileFrame>
  );
}
