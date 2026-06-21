'use client';

import { useRouter } from 'next/navigation';
import { Mage } from '@/figma/kit';
import { ONB, OnbButton, OnbWebFrame, PaperCard, Sparkle } from './shell';

/**
 * 01 Welcome — web (Figma 48:2 / inner 49:*). 1440-designed cream hero:
 * top nav (logo · Log in · Get started) + two-column hero (copy left, the
 * sparkle/paper Mage illustration right). CTA routes to 02 Source.
 */
export default function WelcomeWeb() {
  const router = useRouter();
  return (
    <OnbWebFrame>
      {/* Top nav */}
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
          <OnbButton radius={16} height={58} style={{ padding: '0 32px' }} onClick={() => router.push('/figma/onboarding/02-source')}>
            Get started
          </OnbButton>
        </div>
      </header>

      {/* Hero */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 48,
          maxWidth: 1312,
          marginInline: 'auto',
          padding: '90px 64px 120px',
        }}
      >
        {/* Copy */}
        <div style={{ flex: '0 1 560px', maxWidth: 560 }}>
          <h1
            style={{
              margin: 0,
              color: ONB.ink,
              fontFamily: ONB.font,
              fontWeight: 700,
              fontSize: 54,
              lineHeight: 1.06,
              letterSpacing: '-1.35px',
            }}
          >
            Turn your study material into a learning path.
          </h1>
          <p
            style={{
              margin: '28px 0 0',
              maxWidth: 520,
              color: ONB.muted,
              fontFamily: ONB.font,
              fontSize: 18,
              lineHeight: 1.5,
            }}
          >
            Upload your PDFs, slides, notes, or images. Mage turns them into short study steps, quizzes you, explains
            mistakes, and shows what to review next.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 40 }}>
            <OnbButton radius={16} height={58} style={{ padding: '0 28px' }} onClick={() => router.push('/figma/onboarding/02-source')}>
              Create my first path
            </OnbButton>
            <button
              type="button"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: ONB.primary,
                fontFamily: ONB.font,
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  background: ONB.lavender,
                  color: ONB.primaryInk,
                  fontSize: 11,
                }}
              >
                ▶
              </span>
              See a 2-minute demo
            </button>
          </div>
        </div>

        {/* Illustration */}
        <div style={{ position: 'relative', flex: '0 0 500px', width: 500, height: 460 }}>
          {/* lavender halos */}
          <div style={{ position: 'absolute', left: 30, top: 10, width: 440, height: 440, borderRadius: 120, background: ONB.lavender }} />
          <div style={{ position: 'absolute', left: 80, top: 60, width: 340, height: 340, borderRadius: 96, background: ONB.lavender2, opacity: 0.7 }} />
          {/* papers */}
          <PaperCard scale={1.79} rotate={-13} style={{ position: 'absolute', left: -30, top: 66 }} />
          <PaperCard scale={1.79} rotate={12} style={{ position: 'absolute', left: 392, top: 80 }} />
          <PaperCard scale={1.79} rotate={9} style={{ position: 'absolute', left: -21, top: 290 }} />
          {/* mascot */}
          <div style={{ position: 'absolute', left: 70, top: 30 }}>
            <Mage pose="default" size={360} alt="Mage" priority />
          </div>
          {/* sparkles */}
          <Sparkle size={34} color={ONB.gold} rotate={-15} style={{ position: 'absolute', left: 450, top: 21 }} />
          <Sparkle size={26} color={ONB.gold} rotate={-10} style={{ position: 'absolute', left: 260, top: -25 }} />
          <Sparkle size={20} color={ONB.gold} rotate={-20} style={{ position: 'absolute', left: 460, top: 283 }} />
          <Sparkle size={22} color={ONB.primary} style={{ position: 'absolute', left: 0, top: 50 }} />
          <Sparkle size={16} color={ONB.primary} style={{ position: 'absolute', left: 30, top: 270 }} />
          <Sparkle size={14} color={ONB.primary} style={{ position: 'absolute', left: 190, top: 370 }} />
        </div>
      </div>
    </OnbWebFrame>
  );
}
