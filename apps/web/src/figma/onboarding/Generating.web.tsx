'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mage } from '@/figma/kit';
import { ONB, OnbWebFrame, PaperCard, Sparkle, onb } from './shell';

/**
 * 06 Generating — web (Figma 48:12). 1440-wide, warm/cream.
 *
 * Logo top-left, centered two-column-ish layout: left side = illustration
 * cluster (lavender halo + wand mage + papers + sparkles), right section is
 * purely decorative (lavender bg extends). Below the illustration: headline,
 * subtitle, animated checklist card, hint text, progress bar. Auto-advances to
 * 07-path-reveal after ~3 s. No back button (loading screen has no navigation).
 *
 * Figma: 1440×1024, all absolute coords re-mapped to centered flow layout.
 */

const STEPS = [
  'Reading Sample SQL Notes',
  'Finding main topics',
  'Extracting key concepts',
  'Preparing questions',
  'Creating your first session',
];

const STEP_TICK_MS = [0, 0, 900, 1800, 2600];
const ADVANCE_MS = 3000;
const PROGRESS_START = 62;

export default function GeneratingWeb() {
  const router = useRouter();
  const [doneCount, setDoneCount] = useState(2);
  const [progress, setProgress] = useState(PROGRESS_START);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 2; i < STEPS.length; i++) {
      timers.push(
        setTimeout(() => setDoneCount((c) => Math.max(c, i + 1)), STEP_TICK_MS[i]),
      );
    }

    const INTERVAL_MS = 40;
    const totalSteps = Math.ceil((ADVANCE_MS - 200) / INTERVAL_MS);
    const increment = (100 - PROGRESS_START) / totalSteps;
    let step = 0;
    const interval = setInterval(() => {
      step++;
      setProgress((p) => Math.min(100, p + increment));
      if (step >= totalSteps) clearInterval(interval);
    }, INTERVAL_MS);

    const advance = setTimeout(() => {
      router.push('/figma/onboarding/07-path-reveal');
    }, ADVANCE_MS);

    return () => {
      timers.forEach(clearTimeout);
      clearInterval(interval);
      clearTimeout(advance);
    };
  }, [router]);

  return (
    <OnbWebFrame>
      {/* ── Top nav (logo only — no CTA on loading screen) ──────────────── */}
      <header
        style={{
          padding: '46px 64px 0',
          maxWidth: 1440,
          marginInline: 'auto',
        }}
      >
        <Mage pose="logo-color" size={132} alt="NoteMage" priority />
      </header>

      {/* ── Center column ───────────────────────────────────────────────── */}
      <div
        style={{
          maxWidth: 760,
          marginInline: 'auto',
          padding: '60px 64px 80px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {/* ── Illustration cluster ────────────────────────────────────────── */}
        <div style={{ position: 'relative', width: 500, height: 420, flexShrink: 0 }}>
          {/* Lavender halos — centered within the 500-wide box */}
          <div
            style={{
              position: 'absolute',
              left: 100,
              top: 60,
              width: 300,
              height: 300,
              borderRadius: 90,
              background: ONB.lavender,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 140,
              top: 100,
              width: 220,
              height: 220,
              borderRadius: 68,
              background: ONB.lavender2,
              opacity: 0.7,
            }}
          />

          {/* Paper cards */}
          <PaperCard scale={1.29} rotate={11} style={{ position: 'absolute', left: 7, top: 120 }} />
          <PaperCard scale={1.29} rotate={-12} style={{ position: 'absolute', left: 388, top: 100 }} />

          {/* Mascot — wand pose */}
          <div style={{ position: 'absolute', left: 125, top: 60 }}>
            <Mage pose="wand" size={250} alt="Mage casting" priority />
          </div>

          {/* Sparkles */}
          <Sparkle size={28} color={ONB.gold} rotate={-15} style={{ position: 'absolute', left: 400, top: 20 }} />
          <Sparkle size={18} color={ONB.gold} rotate={-10} style={{ position: 'absolute', left: 20, top: 50 }} />
          <Sparkle size={20} color={ONB.gold} rotate={-20} style={{ position: 'absolute', left: 410, top: 273 }} />
          <Sparkle size={14} color={ONB.primary} style={{ position: 'absolute', left: 40, top: 280 }} />
          <Sparkle size={18} color={ONB.primary} rotate={-10} style={{ position: 'absolute', left: 236, top: -16 }} />
        </div>

        {/* ── Step dots ────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 8 }}>
          <span style={{ width: 20, height: 20, borderRadius: 10, background: ONB.primary }} />
          <span style={{ width: 54, height: 2, borderRadius: 1, background: ONB.paperLine }} />
          <span
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              border: `1.5px solid ${ONB.paperLine}`,
              background: 'transparent',
            }}
          />
          <span style={{ width: 54, height: 2, borderRadius: 1, background: ONB.paperLine }} />
          <span
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              border: `1.5px solid ${ONB.paperLine}`,
              background: 'transparent',
            }}
          />
        </div>

        {/* ── Headline ──────────────────────────────────────────────────── */}
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
          }}
        >
          Building your path…
        </h1>

        {/* ── Subtitle ──────────────────────────────────────────────────── */}
        <p
          style={{
            margin: '12px 0 0',
            maxWidth: 560,
            textAlign: 'center',
            color: ONB.muted,
            fontFamily: ONB.font,
            fontSize: 19,
            lineHeight: 1.3,
          }}
        >
          Mage is turning your material into small study steps.
        </p>

        {/* ── Checklist card ──────────────────────────────────────────────── */}
        <div
          style={{
            marginTop: 28,
            width: '100%',
            maxWidth: 600,
            background: ONB.white,
            border: `1.2px solid ${ONB.line}`,
            borderRadius: 24,
            boxShadow: '0px 8px 24px 0px rgba(58,46,102,0.08)',
            padding: '0 0 16px',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {/* Vertical connector line */}
          <div
            style={{
              position: 'absolute',
              left: 39.8,
              top: 50.8,
              width: 2,
              height: 232,
              borderRadius: 1,
              background: ONB.paperLine,
            }}
          />

          {STEPS.map((label, i) => {
            const isDone = i < doneCount;
            const isActive = i === doneCount && doneCount < STEPS.length;
            const isPending = !isDone && !isActive;

            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '0 0 0 26.8px',
                  /* Figma: row tops 22.8/80.8/138.8/196.8/254.8 → 58px apart */
                  height: 58,
                  marginTop: i === 0 ? 4 : 0,
                }}
              >
                {/* Step indicator */}
                {isDone ? (
                  <div
                    style={{
                      flexShrink: 0,
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      background: '#2fa968',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                      zIndex: 1,
                    }}
                  >
                    <span
                      style={{
                        color: ONB.white,
                        fontFamily: ONB.font,
                        fontWeight: 700,
                        fontSize: 14,
                        lineHeight: 1,
                      }}
                    >
                      ✓
                    </span>
                  </div>
                ) : isActive ? (
                  /* Purple radio-ring (Figma static: filled purple outer, white inner — pulse in code) */
                  <div
                    style={{
                      flexShrink: 0,
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      background: ONB.primary,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                      zIndex: 1,
                    }}
                    className={onb.pulse}
                  >
                    <span
                      style={{
                        width: 13,
                        height: 13,
                        borderRadius: 7,
                        background: ONB.white,
                      }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      flexShrink: 0,
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      border: `1.5px solid ${ONB.paperLine}`,
                      background: ONB.white,
                      position: 'relative',
                      zIndex: 1,
                    }}
                  />
                )}

                <span
                  style={{
                    fontFamily: ONB.font,
                    fontWeight: isDone || isActive ? 600 : 500,
                    fontSize: 17,
                    lineHeight: 1.3,
                    color: isPending ? '#a1a7b3' : ONB.ink,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {/* ── Hint text ───────────────────────────────────────────────────── */}
        <p
          style={{
            margin: '20px 0 0',
            textAlign: 'center',
            color: '#a1a7b3',
            fontFamily: ONB.font,
            fontWeight: 500,
            fontSize: 15,
            lineHeight: 1.3,
          }}
        >
          This usually takes less than a minute
        </p>

        {/* ── Progress bar ────────────────────────────────────────────────── */}
        <div
          style={{
            width: '100%',
            maxWidth: 600,
            position: 'relative',
            height: 8,
            borderRadius: 4,
            marginTop: 12,
          }}
        >
          {/* Track */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 4,
              background: ONB.line,
            }}
          />
          {/* Fill */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${progress}%`,
              borderRadius: 4,
              background: ONB.primary,
              transition: 'width 0.04s linear',
            }}
          />
        </div>
      </div>
    </OnbWebFrame>
  );
}
