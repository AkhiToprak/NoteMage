'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mage } from '@/figma/kit';
import { ONB, OnbMobileFrame, PaperCard, Sparkle, onb } from './shell';

/**
 * 06 Generating — mobile (Figma 1:27). 393×852, warm/cream.
 *
 * Shows the Mage casting while a 5-step checklist animates: steps 0–1 start
 * green (done), step 2 is the active spinner, steps 3–4 are pending. Each step
 * ticks green over time. A progress bar fills from ~25 % → 100 % over ~3 s, then
 * the screen auto-advances to 07-path-reveal.
 */

const STEPS = [
  'Reading Sample SQL Notes',
  'Finding main topics',
  'Extracting key concepts',
  'Preparing questions',
  'Creating your first session',
];

/** Milliseconds at which each step becomes "done" (0-indexed). Step 0+1 start done. */
const STEP_TICK_MS = [0, 0, 900, 1800, 2600];
/** Total auto-advance delay. */
const ADVANCE_MS = 3000;
/** Initial progress bar fill (62 % matches Figma). Animates to 100. */
const PROGRESS_START = 62;

export default function GeneratingMobile() {
  const router = useRouter();
  // How many steps are "done" (green check)
  const [doneCount, setDoneCount] = useState(2);
  // 0–100 progress value
  const [progress, setProgress] = useState(PROGRESS_START);

  useEffect(() => {
    // Tick each remaining step
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 2; i < STEPS.length; i++) {
      timers.push(
        setTimeout(() => setDoneCount((c) => Math.max(c, i + 1)), STEP_TICK_MS[i]),
      );
    }

    // Smooth progress bar from start → 100
    const INTERVAL_MS = 40;
    const totalSteps = Math.ceil((ADVANCE_MS - 200) / INTERVAL_MS);
    const increment = (100 - PROGRESS_START) / totalSteps;
    let step = 0;
    const interval = setInterval(() => {
      step++;
      setProgress((p) => Math.min(100, p + increment));
      if (step >= totalSteps) clearInterval(interval);
    }, INTERVAL_MS);

    // Auto-advance
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
    <OnbMobileFrame>
      {/* ── Hero cluster ─────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', width: '100%', height: 264, marginTop: 22 }}>
        {/* Lavender halos */}
        <div
          style={{
            position: 'absolute',
            left: 80.5,
            top: 0,
            width: 232,
            height: 232,
            borderRadius: 68,
            background: ONB.lavender,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 112.5,
            top: 32,
            width: 168,
            height: 168,
            borderRadius: 52,
            background: ONB.lavender2,
            opacity: 0.7,
          }}
        />

        {/* Tilted paper cards */}
        <PaperCard scale={0.93} rotate={11} style={{ position: 'absolute', left: 47, top: 84 }} />
        <PaperCard scale={0.93} rotate={-12} style={{ position: 'absolute', left: 286, top: 71 }} />

        {/* Mascot — wand pose, casting magic */}
        <div style={{ position: 'absolute', left: 103.5, top: 0 }}>
          <Mage pose="wand" size={186} alt="Mage casting" priority />
        </div>

        {/* Sparkles */}
        <Sparkle size={20} color={ONB.gold} rotate={-15} style={{ position: 'absolute', left: 296, top: 25 }} />
        <Sparkle size={13} color={ONB.gold} rotate={-10} style={{ position: 'absolute', left: 74, top: 42 }} />
        <Sparkle size={12} color={ONB.gold} rotate={-20} style={{ position: 'absolute', left: 300, top: 166 }} />
        <Sparkle size={10} color={ONB.primary} style={{ position: 'absolute', left: 86, top: 172 }} />
        <Sparkle size={15} color={ONB.primary} rotate={-10} style={{ position: 'absolute', left: 196, top: 3 }} />
      </div>

      {/* ── Step dots ──────────────────────────────────────────────────────── */}
      {/* The Figma shows 3 dots (active · inactive · inactive) positioned below
          the mascot halo, representing onboarding step 6 of ~8 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6 }}>
        {/* dot 1 — active (filled purple) */}
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            background: ONB.primary,
          }}
        />
        {/* connector */}
        <span style={{ width: 34, height: 2, borderRadius: 1, background: ONB.paperLine }} />
        {/* dot 2 — inactive (outline) */}
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            border: `1.5px solid ${ONB.paperLine}`,
            background: 'transparent',
          }}
        />
        {/* connector */}
        <span style={{ width: 34, height: 2, borderRadius: 1, background: ONB.paperLine }} />
        {/* dot 3 — inactive (outline) */}
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            border: `1.5px solid ${ONB.paperLine}`,
            background: 'transparent',
          }}
        />
      </div>

      {/* ── Headline ──────────────────────────────────────────────────────── */}
      <h1
        style={{
          margin: '24px auto 0',
          maxWidth: 345,
          padding: '0 24px',
          textAlign: 'center',
          color: ONB.ink,
          fontFamily: ONB.font,
          fontWeight: 700,
          fontSize: 28,
          lineHeight: 1.14,
          letterSpacing: '-0.42px',
        }}
      >
        Building your path…
      </h1>

      {/* ── Subtitle ─────────────────────────────────────────────────────── */}
      <p
        style={{
          margin: '10px auto 0',
          maxWidth: 300,
          padding: '0 24px',
          textAlign: 'center',
          color: ONB.muted,
          fontFamily: ONB.font,
          fontSize: 15.5,
          lineHeight: 1.42,
        }}
      >
        Mage is turning your material into small study steps.
      </p>

      {/* ── Checklist card ───────────────────────────────────────────────── */}
      <div
        style={{
          margin: '24px 24px 0',
          background: ONB.white,
          border: `1.2px solid ${ONB.line}`,
          borderRadius: 22,
          boxShadow: '0px 5px 16px 0px rgba(58,46,102,0.07)',
          padding: '0 0 16px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Vertical connector line — Figma: left=28.8, top=42.8, h=216 */}
        <div
          style={{
            position: 'absolute',
            left: 28.8,
            top: 42.8,
            width: 2,
            height: 216,
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
                gap: 12,
                padding: '0 0 0 16.8px',
                /* Figma step rows: top positions 16.8 / 70.8 / 124.8 / 178.8 / 232.8 → 54px apart.
                   Row height = 54 with 16.8px top offset for first. */
                height: 54,
                marginTop: i === 0 ? 4 : 0,
              }}
            >
              {/* Step indicator */}
              {isDone ? (
                /* Green check circle */
                <div
                  style={{
                    flexShrink: 0,
                    width: 26,
                    height: 26,
                    borderRadius: 13,
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
                      fontSize: 13,
                      lineHeight: 1,
                    }}
                  >
                    ✓
                  </span>
                </div>
              ) : isActive ? (
                /* Purple radio-ring (Figma: filled purple outer, white inner circle, pulsing) */
                <div
                  style={{
                    flexShrink: 0,
                    width: 26,
                    height: 26,
                    borderRadius: 13,
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
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      background: ONB.white,
                    }}
                  />
                </div>
              ) : (
                /* Empty pending circle */
                <div
                  style={{
                    flexShrink: 0,
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    border: `1.5px solid ${ONB.paperLine}`,
                    background: ONB.white,
                    position: 'relative',
                    zIndex: 1,
                  }}
                />
              )}

              {/* Label */}
              <span
                style={{
                  fontFamily: ONB.font,
                  fontWeight: isDone || isActive ? 600 : 500,
                  fontSize: 15.5,
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

      {/* ── Hint text ────────────────────────────────────────────────────── */}
      <p
        style={{
          margin: '16px auto 0',
          maxWidth: 345,
          textAlign: 'center',
          color: '#a1a7b3',
          fontFamily: ONB.font,
          fontWeight: 500,
          fontSize: 13.5,
          lineHeight: 1.3,
        }}
      >
        This usually takes less than a minute
      </p>

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      <div style={{ margin: '12px 24px 0', position: 'relative', height: 6, borderRadius: 3 }}>
        {/* Track */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 3,
            background: ONB.line,
          }}
        />
        {/* Fill — animated */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${progress}%`,
            borderRadius: 3,
            background: ONB.primary,
            transition: 'width 0.04s linear',
          }}
        />
      </div>
    </OnbMobileFrame>
  );
}
