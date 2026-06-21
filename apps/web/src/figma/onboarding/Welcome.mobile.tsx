'use client';

import { useRouter } from 'next/navigation';
import { Mage } from '@/figma/kit';
import { ONB, OnbButton, OnbMobileFrame, PaperCard, Sparkle } from './shell';

/**
 * 01 Welcome — mobile (Figma 1:17 / inner 34:*). 393×852, warm/cream.
 * Logo · sparkle-and-paper hero around the Mage · headline · subtitle · CTA.
 * Self-contained, mock state only; CTA routes to 02 Source.
 */
export default function WelcomeMobile() {
  const router = useRouter();
  return (
    <OnbMobileFrame>
      {/* Logo wordmark */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 18 }}>
        <Mage pose="logo-color" size={124} alt="NoteMage" priority />
      </div>

      {/* Hero cluster — circles, papers, mascot, sparkles (origin y = 110). */}
      <div style={{ position: 'relative', width: '100%', height: 290, marginTop: 4 }}>
        {/* lavender halos */}
        <div
          style={{
            position: 'absolute',
            left: 82.5,
            top: 30,
            width: 228,
            height: 228,
            borderRadius: 68,
            background: ONB.lavender,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 106.5,
            top: 54,
            width: 180,
            height: 180,
            borderRadius: 56,
            background: ONB.lavender2,
            opacity: 0.7,
          }}
        />
        {/* papers (behind the mascot's sides) */}
        <PaperCard scale={1} rotate={-13} style={{ position: 'absolute', left: 58, top: 73 }} />
        <PaperCard scale={1} rotate={12} style={{ position: 'absolute', left: 266, top: 80 }} />
        <PaperCard scale={1} rotate={9} style={{ position: 'absolute', left: 54, top: 200 }} />
        {/* mascot */}
        <div style={{ position: 'absolute', left: 98.5, top: 40 }}>
          <Mage pose="default" size={196} alt="Mage" priority />
        </div>
        {/* sparkles */}
        <Sparkle size={21} color={ONB.gold} rotate={-15} style={{ position: 'absolute', left: 298, top: 25 }} />
        <Sparkle size={15} color={ONB.gold} rotate={-10} style={{ position: 'absolute', left: 192, top: 7 }} />
        <Sparkle size={12} color={ONB.gold} rotate={-20} style={{ position: 'absolute', left: 312, top: 174 }} />
        <Sparkle size={13} color={ONB.primary} style={{ position: 'absolute', left: 72, top: 48 }} />
        <Sparkle size={10} color={ONB.primary} style={{ position: 'absolute', left: 82, top: 202 }} />
        <Sparkle size={9} color={ONB.primary} style={{ position: 'absolute', left: 248, top: 246 }} />
      </div>

      {/* Headline */}
      <h1
        style={{
          margin: '8px auto 0',
          maxWidth: 345,
          padding: '0 24px',
          textAlign: 'center',
          color: ONB.ink,
          fontFamily: ONB.font,
          fontWeight: 700,
          fontSize: 33,
          lineHeight: 1.15,
          letterSpacing: '-0.66px',
        }}
      >
        Turn your study material into a learning path.
      </h1>

      {/* Subtitle */}
      <p
        style={{
          margin: '16px auto 0',
          maxWidth: 334,
          padding: '0 24px',
          textAlign: 'center',
          color: ONB.muted,
          fontFamily: ONB.font,
          fontSize: 15.5,
          lineHeight: 1.48,
        }}
      >
        Upload your PDFs, slides, notes, or images. Mage turns them into short study steps, quizzes you, explains
        mistakes, and shows what to review next.
      </p>

      {/* CTA pinned toward the bottom */}
      <div style={{ marginTop: 'auto', padding: '24px 24px 10px' }}>
        <OnbButton block radius={18} height={56} onClick={() => router.push('/figma/onboarding/02-source')}>
          Create my first path
        </OnbButton>
      </div>
    </OnbMobileFrame>
  );
}
