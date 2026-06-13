'use client';

/**
 * Full-screen "3 in a row!" takeover. The NoteMage mascot dashes in like the
 * Flash — wizard hat flying off, purple speed trail, sparkles — then "3 in a row!"
 * slams in over a Continue button.
 *
 * The mascot is the baked hero artwork (/streak/streak-hero.png) on a pure-black
 * stage, so the artwork's own black background is seamless and no cut-out matting
 * is needed; only the bright art shows as it streaks in.
 *
 * Authored on a fixed design canvas (1920x1080 landscape / 1080x1920 portrait) and
 * scaled to *contain* the viewport. The stage is centred with
 * `position:absolute; left/top:50%; transform:translate(-50%,-50%) scale()` — NOT a
 * grid — the exact fix for the welcome-back "blank phone" bug, so the 9:16 mobile
 * case can't blank out. Motion runs from one rAF clock; reduced-motion jumps to the
 * final frame.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { haptics } from '@/lib/haptics';
import styles from './streak-takeover.module.css';

const DUR = 4.6;

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (x: number) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);
const fadeWin = (t: number, a: number, b: number, f: number) => (t <= a || t >= b ? 0 : clamp(Math.min((t - a) / f, (b - t) / f), 0, 1));
const backOut = (x: number) => { const c1 = 1.70158, c3 = c1 + 1; x = clamp(x, 0, 1); return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const outCubic = (x: number) => { x = clamp(x, 0, 1); return 1 - Math.pow(1 - x, 3); };

const B = { fly: [0.0, 0.72], settle: [0.85, 1.4], impact: 1.46, btnIn: [2.5, 3.05] };

// Haptic pulses (ms → style) — the phone buzzes through the dash, punches on the
// "3 in a row!" impact, then a light tap when Continue appears. Routes to native
// haptics in the iOS/Android shell and navigator.vibrate on the web.
const HAPTICS: { at: number; style: 'light' | 'medium' | 'heavy' }[] = [
  { at: 0, style: 'heavy' },
  { at: 280, style: 'medium' },
  { at: 560, style: 'medium' },
  { at: 840, style: 'medium' },
  { at: 1120, style: 'medium' },
  { at: 1460, style: 'heavy' },
  { at: 2520, style: 'light' },
];

type Orient = 'landscape' | 'portrait';

function computeLayout(): { orient: Orient; scale: number } {
  if (typeof window === 'undefined') return { orient: 'landscape', scale: 1 };
  const vw = window.innerWidth, vh = window.innerHeight;
  const orient: Orient = vw >= vh ? 'landscape' : 'portrait';
  const W = orient === 'portrait' ? 1080 : 1920;
  const H = orient === 'portrait' ? 1920 : 1080;
  return { orient, scale: Math.min(vw / W, vh / H) };
}

export function StreakTakeover({
  onDismiss,
  audioEnabled = false,
}: {
  onDismiss: () => void;
  audioEnabled?: boolean;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [{ orient, scale }, setLayout] = useState(computeLayout);
  const [leaving, setLeaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const reduced = useRef(false);

  const dims = useMemo(() => {
    const W = orient === 'portrait' ? 1080 : 1920;
    const H = orient === 'portrait' ? 1920 : 1080;
    const heroW = orient === 'portrait' ? 1040 : 965;
    return { W, H, heroW };
  }, [orient]);

  useLayoutEffect(() => {
    reduced.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const onResize = () => setLayout(computeLayout());
    onResize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => { setMounted(true); }, []);

  // haptics — buzz through the dash + impact while the takeover plays. Best-effort
  // (no-op where unsupported); scheduled timers are cleared if it's dismissed early.
  useEffect(() => {
    const timers = HAPTICS.map(({ at, style }) =>
      window.setTimeout(() => {
        haptics.impact(style);
      }, at),
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, []);

  // best-effort sound (matches the muxed video SFX); gated by the quiz setting
  useEffect(() => {
    if (!audioEnabled) return;
    try {
      const el = new Audio('/sounds/streak-3.mp3');
      el.volume = 0.7;
      void el.play().catch(() => undefined);
    } catch {
      // audio is best-effort; a missing/blocked asset must not break the takeover
    }
  }, [audioEnabled]);

  const dismiss = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onDismiss, 420);
  }, [leaving, onDismiss]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter') dismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismiss]);

  useEffect(() => {
    if (!mounted) return;
    const stage = stageRef.current;
    if (!stage) return;
    const q = (s: string) => stage.querySelector<HTMLElement>(s);
    const els = {
      heroMove: q('[data-el="heroMove"]'),
      shake: q('[data-el="shake"]'),
      headline: q('[data-el="headline"]'),
      btn: q('[data-el="btn"]'),
    };
    const { W, heroW } = dims;

    const renderFrame = (t: number) => {
      const flyP = outCubic(seg(t, B.fly[0], B.fly[1]));

      // hero dashes in from the left, skids to a stop, then gently bobs
      const baseX = lerp(-(W * 0.7 + heroW), 0, flyP);
      const skid = Math.sin(Math.PI * seg(t, B.fly[1] - 0.12, B.fly[1] + 0.16)) * 30;
      const bob = t > B.settle[0] ? Math.sin((t - B.settle[0]) * 2.4) * 10 : 0;
      const kick = Math.sin(Math.PI * seg(t, B.impact, B.impact + 0.18)) * -16;
      const land = Math.sin(Math.PI * seg(t, B.fly[1] - 0.08, B.fly[1] + 0.12));
      const sc = 1 + 0.05 * land;
      if (els.heroMove) els.heroMove.style.transform = `translate(${(baseX + skid + kick).toFixed(1)}px,${bob.toFixed(1)}px) scale(${sc.toFixed(3)})`;

      if (els.shake) {
        const shk = fadeWin(t, B.impact, B.impact + 0.34, 0.06);
        els.shake.style.transform = `translate(${(shk * Math.sin(t * 84) * 12).toFixed(1)}px,${(shk * Math.sin(t * 73) * 7).toFixed(1)}px)`;
      }

      if (els.headline) {
        const hO = smooth(seg(t, B.impact, B.impact + 0.16));
        const hScale = lerp(1.75, 1, backOut(smooth(seg(t, B.impact, B.impact + 0.34))));
        const hJit = fadeWin(t, B.impact, B.impact + 0.5, 0.1) * Math.sin(t * 52) * 2.2;
        const hPulse = t > B.impact + 0.5 ? 1 + 0.02 * Math.sin((t - B.impact - 0.5) * 3.4) : 1;
        els.headline.style.opacity = hO.toFixed(3);
        els.headline.style.transform = `translateX(-50%) rotate(${(-3 + hJit).toFixed(2)}deg) scale(${(hScale * hPulse).toFixed(3)})`;
      }

      if (els.btn) {
        const bO = smooth(seg(t, B.btnIn[0], B.btnIn[0] + 0.2));
        const bPop = backOut(smooth(seg(t, B.btnIn[0], B.btnIn[1])));
        const bPulse = t > B.btnIn[1] + 0.1 ? 1 + 0.035 * (0.5 + 0.5 * Math.sin((t - B.btnIn[1]) * 3.0)) : 1;
        els.btn.style.opacity = bO.toFixed(3);
        els.btn.style.transform = `translateX(-50%) translateY(${lerp(22, 0, bPop).toFixed(1)}px) scale(${(bPop * bPulse).toFixed(3)})`;
        els.btn.style.pointerEvents = bO > 0.6 ? 'auto' : 'none';
      }
    };

    if (reduced.current) { renderFrame(DUR); return; }
    let raf = 0;
    let start: number | null = null;
    const tick = (ts: number) => {
      if (start == null) start = ts;
      let e = (ts - start) / 1000;
      if (e > DUR) e = DUR;
      renderFrame(e);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mounted, dims]);

  if (typeof document === 'undefined') return null;

  const overlay = (
    <div
      className={styles.scrim}
      role="dialog"
      aria-modal="true"
      aria-label="Three in a row"
      onClick={dismiss}
      style={{ opacity: leaving ? 0 : 1, transition: 'opacity .4s ease' }}
    >
      {mounted && (
        <div
          ref={stageRef}
          className={styles.stage}
          data-orient={orient}
          style={{ width: dims.W, height: dims.H, transform: `translate(-50%, -50%) scale(${scale})` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div data-el="shake" style={{ position: 'absolute', inset: 0 }}>
            <div className={styles.hero}>
              <div className={styles.heroMove} data-el="heroMove">
                <img src="/streak/streak-hero.png" alt="" />
              </div>
            </div>

            <div className={styles.headline} data-el="headline" style={{ opacity: 0 }}>3 in a row!</div>

            <button type="button" className={styles.btn} data-el="btn" style={{ opacity: 0, pointerEvents: 'none' }} onClick={dismiss}>
              <span className="material-symbols-outlined">bolt</span>Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(overlay, document.body);
}

export default StreakTakeover;
