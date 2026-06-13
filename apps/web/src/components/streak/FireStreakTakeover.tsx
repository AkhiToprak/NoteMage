'use client';

/**
 * Full-screen "5 in a row!" takeover. The screen briefly catches fire — a wall
 * of flame surges up from the bottom edge — and the wizard-book mascot rises out
 * of the flames as they recede, then "5 in a row!" slams in over a Continue
 * button.
 *
 * The mascot (/streak/fire-hero.png) is a luminance-matted PNG (true-black
 * background → transparent, flame tips fade softly), so it composites cleanly
 * over the scene fire AND over the app-background stage. The stage is the app's
 * #0c0a1a (matching the 3-in-a-row takeover) — the orange-fire-tints-purple
 * gotcha was about *baking* the mascot onto #0c0a1a, not the stage colour; the
 * matte avoids it and the CSS flames are opaque on top (see the .module.css).
 *
 * Authored on a fixed design canvas (1920x1080 landscape / 1080x1920 portrait)
 * and scaled to *contain* the viewport, centred with translate-scale — the same
 * pattern the 3-in-a-row takeover uses, so the 9:16 phone case can't blank out.
 * Flames are solid-colour layered shapes (no gradients); all motion is derived
 * from one rAF clock (transforms/opacity only). Reduced-motion jumps to the
 * settled frame.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { haptics } from '@/lib/haptics';
import styles from './fire-streak-takeover.module.css';

const DUR = 4.8;

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (x: number) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);
const fadeWin = (t: number, a: number, b: number, f: number) => (t <= a || t >= b ? 0 : clamp(Math.min((t - a) / f, (b - t) / f), 0, 1));
const backOut = (x: number) => { const c1 = 1.70158, c3 = c1 + 1; x = clamp(x, 0, 1); return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const outCubic = (x: number) => { x = clamp(x, 0, 1); return 1 - Math.pow(1 - x, 3); };
// Deterministic per-index pseudo-random (no Math.random → video-render safe).
const frac = (x: number) => x - Math.floor(x);
const hash = (i: number, s: number) => frac(Math.sin((i + 1) * 127.1 + s * 311.7) * 43758.5453);

// Beats: ignite flash, fire surge → recede, mascot rises out of the fire,
// headline impact, button. Haptics + any SFX are timed to these.
const B = { surge: [0.0, 0.6], recede: [0.95, 2.0], emerge: [0.55, 1.4], impact: 1.7, btnIn: [2.7, 3.25] };

// smooth flame silhouette (point at top, bulbous waisted body) reused at four
// sizes per tongue for a layered red→orange→gold→core look
const FLAME_PATH = 'M50 2 C61 32 55 50 67 73 C76 91 73 121 50 150 C27 121 24 91 33 73 C45 50 39 32 50 2 Z';
const FLAME_LAYERS = [
  { w: '100%', h: '100%', c: 'var(--ft-red)', b: 20 },
  { w: '72%', h: '86%', c: 'var(--ft-orange)', b: 11 },
  { w: '42%', h: '62%', c: 'var(--ft-gold)', b: 6 },
  { w: '18%', h: '38%', c: 'var(--ft-core)', b: 3 },
];
const WALL_LAYERS = [
  { w: '100%', h: '100%', c: 'var(--ft-red)', b: 34 },
  { w: '78%', h: '82%', c: 'var(--ft-orange)', b: 22 },
  { w: '50%', h: '62%', c: 'var(--ft-gold)', b: 15 },
  { w: '26%', h: '40%', c: 'var(--ft-core)', b: 10 },
];

// molten wall (continuous body of fire along the bottom edge)
const WALL = Array.from({ length: 13 }, (_, i) => ({
  left: (i / 12) * 100,
  w: 380 + hash(i, 21) * 280,
  h: 240 + hash(i, 22) * 200,
  amp: 1.5 + hash(i, 23) * 0.7,
  fy: 4.5 + hash(i, 24) * 3.5,
  phase: hash(i, 25) * Math.PI * 2,
  sway: 6 + hash(i, 26) * 14,
  op: 0.85 + hash(i, 27) * 0.15,
}));
// flame tongues licking up off the wall
const FLAMES = Array.from({ length: 22 }, (_, i) => ({
  left: 1 + (i / 21) * 98 + (hash(i, 1) - 0.5) * 4,
  w: 200 + hash(i, 2) * 200,
  h: 300 + hash(i, 3) * 240,
  amp: 1.5 + hash(i, 4) * 0.9,
  fy: 6 + hash(i, 5) * 5,
  fx: 5 + hash(i, 6) * 4,
  phase: hash(i, 7) * Math.PI * 2,
  sway: 9 + hash(i, 8) * 22,
  op: 0.8 + hash(i, 9) * 0.2,
  back: i % 2 === 0,
  flip: hash(i, 10) > 0.5,
}));
// rising embers, gated by the fire envelope so they only fly while it burns
const EMBERS = Array.from({ length: 18 }, (_, i) => ({
  left: 4 + hash(i, 11) * 92,
  size: 5 + hash(i, 12) * 9,
  rise: 520 + hash(i, 13) * 820,
  drift: (hash(i, 14) - 0.5) * 240,
  speed: 0.32 + hash(i, 15) * 0.3,
  phase: hash(i, 16),
  wig: 1 + Math.floor(hash(i, 17) * 3),
}));

// Haptic pulses (ms → style), timed to the fire beats so the phone "feels" the
// takeover: a heavy ignition, a rolling rumble through the burning surge (medium
// taps ~150 ms apart — kept above the helper's 40 ms coalesce so each registers),
// a heavy punch as the mascot bursts out of the fire, a heavy slam on "5 in a
// row!", then a light tap when Continue appears. Native-shell only (the central
// helper no-ops on desktop web) and respects the device on/off pref.
const HAPTICS: { at: number; style: 'light' | 'medium' | 'heavy' }[] = [
  { at: 0, style: 'heavy' }, // ignition
  { at: 130, style: 'medium' }, // ┐
  { at: 280, style: 'medium' }, // │
  { at: 430, style: 'medium' }, // │ rolling rumble through the burn
  { at: 590, style: 'medium' }, // │
  { at: 760, style: 'medium' }, // │
  { at: 950, style: 'medium' }, // ┘
  { at: 1180, style: 'heavy' }, // mascot bursts out of the fire
  { at: 1700, style: 'heavy' }, // "5 in a row!" slams in
  { at: 2720, style: 'light' }, // Continue appears
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

export function FireStreakTakeover({
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
    // how far below its resting spot the mascot starts (rises up out of the fire)
    const heroRise = orient === 'portrait' ? 360 : 300;
    return { W, H, heroRise };
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

  // Mount guard — defer the real-viewport layout to the client so SSR/hydration
  // can't blank the stage (the welcome-back fix). Intentional set-state-on-mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  // haptics — buzz through the ignition + mascot burst. Best-effort; timers
  // cleared if dismissed early.
  useEffect(() => {
    const timers = HAPTICS.map(({ at, style }) =>
      window.setTimeout(() => {
        haptics.impact(style);
      }, at),
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, []);

  // best-effort sound (fire whoosh + boom + chime); gated by the quiz setting.
  useEffect(() => {
    if (!audioEnabled) return;
    try {
      const el = new Audio('/sounds/streak-5.mp3');
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
    const wallEls = Array.from(stage.querySelectorAll<HTMLElement>('[data-wall]'));
    const flameEls = Array.from(stage.querySelectorAll<HTMLElement>('[data-flame]'));
    const emberEls = Array.from(stage.querySelectorAll<HTMLElement>('[data-ember]'));
    const els = {
      flash: q('[data-el="flash"]'),
      heroMove: q('[data-el="heroMove"]'),
      headline: q('[data-el="headline"]'),
      btn: q('[data-el="btn"]'),
    };
    const { heroRise } = dims;

    const renderFrame = (t: number) => {
      // macro fire envelope: erupts up, then recedes to a low burning base
      const rise = smooth(seg(t, B.surge[0], B.surge[1]));
      const fall = smooth(seg(t, B.recede[0], B.recede[1]));
      // flames start at ZERO and rise up from the bottom (no fire at t=0), surge
      // to full, then recede to a low burning base
      const env = lerp(0, 1, rise) * lerp(1, 0.42, fall);
      const appear = smooth(seg(t, 0.0, 0.16));

      for (let i = 0; i < wallEls.length; i++) {
        const w = WALL[i];
        const el = wallEls[i];
        const flickY = 1 + 0.12 * Math.sin(t * w.fy + w.phase) + 0.05 * Math.sin(t * w.fy * 2.1 + w.phase * 1.5);
        const sy = env * w.amp * flickY;
        const swayX = Math.sin(t * w.fy * 0.7 + w.phase) * w.sway * env;
        el.style.transform = `translateX(${swayX.toFixed(1)}px) scale(1, ${sy.toFixed(3)})`;
        el.style.opacity = (clamp(env * 1.3, 0, 1) * w.op * appear).toFixed(3);
      }

      for (let i = 0; i < flameEls.length; i++) {
        const f = FLAMES[i];
        const el = flameEls[i];
        const flickY = 1 + 0.2 * Math.sin(t * f.fy + f.phase) + 0.09 * Math.sin(t * f.fy * 2.3 + f.phase * 1.7);
        const flickX = (f.flip ? -1 : 1) * (1 + 0.08 * Math.sin(t * f.fx + f.phase * 0.6));
        const sy = env * f.amp * flickY;
        const swayX = Math.sin(t * f.fx * 0.8 + f.phase) * f.sway * env;
        el.style.transform = `translateX(${swayX.toFixed(1)}px) scale(${flickX.toFixed(3)}, ${sy.toFixed(3)})`;
        el.style.opacity = (clamp(env * 1.25, 0, 1) * f.op * appear).toFixed(3);
      }

      for (let i = 0; i < emberEls.length; i++) {
        const e = EMBERS[i];
        const el = emberEls[i];
        const tt = frac(t * e.speed + e.phase);
        const ey = -tt * e.rise;
        const ex = Math.sin(tt * Math.PI * e.wig) * e.drift;
        el.style.transform = `translate(${ex.toFixed(1)}px, ${ey.toFixed(1)}px)`;
        el.style.opacity = (Math.sin(tt * Math.PI) * env * appear).toFixed(3);
      }

      if (els.flash) {
        // a warm heat-bloom as the flames rise (not a pre-fire flash), plus a
        // small flare as the mascot emerges
        const fO = fadeWin(t, 0.1, 0.5, 0.16) * 0.38 + fadeWin(t, 1.0, 1.4, 0.08) * 0.4;
        els.flash.style.opacity = clamp(fO, 0, 1).toFixed(3);
      }

      if (els.heroMove) {
        const emRise = outCubic(seg(t, B.emerge[0], 1.25));
        const emPop = backOut(smooth(seg(t, B.emerge[0], B.emerge[1])));
        const heroY = lerp(heroRise, 0, emRise);
        const heroScale = lerp(0.5, 1, emPop);
        const bob = t > B.emerge[1] ? Math.sin((t - B.emerge[1]) * 2.2) * 8 : 0;
        const kick = Math.sin(Math.PI * seg(t, 1.25, 1.45)) * -14;
        els.heroMove.style.opacity = smooth(seg(t, B.emerge[0], 0.82)).toFixed(3);
        els.heroMove.style.transform = `translate(0px, ${(heroY + bob + kick).toFixed(1)}px) scale(${heroScale.toFixed(3)})`;
      }

      if (els.headline) {
        const hO = smooth(seg(t, B.impact, B.impact + 0.16));
        const hScale = lerp(1.7, 1, backOut(smooth(seg(t, B.impact, B.impact + 0.3))));
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
    // The clock runs unbounded — past the intro (DUR) the macro beats are all
    // clamped segs that settle, but the per-element flicker/embers/bob/pulse are
    // sin/frac of t, so the fire keeps burning and never freezes to a static
    // frame. It stops only when the takeover unmounts (Continue / Esc / scrim).
    const tick = (ts: number) => {
      if (start == null) start = ts;
      renderFrame((ts - start) / 1000);
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
      aria-label="Five in a row"
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
          {/* wall of fire + tongues + embers */}
          <div className={styles.fireField}>
            {WALL.map((w, i) => (
              <div
                key={`w${i}`}
                data-wall={i}
                className={styles.wall}
                style={{ left: `${w.left}%`, width: w.w, height: w.h, marginLeft: -w.w / 2, zIndex: 4, opacity: 0 }}
              >
                {WALL_LAYERS.map((L, j) => (
                  <div key={j} className={styles.wallLayer} style={{ width: L.w, height: L.h, background: L.c, filter: `blur(${L.b}px)` }} />
                ))}
              </div>
            ))}
            {FLAMES.map((f, i) => (
              <div
                key={`f${i}`}
                data-flame={i}
                className={styles.flame}
                style={{ left: `${f.left}%`, width: f.w, height: f.h, marginLeft: -f.w / 2, zIndex: f.back ? 5 : 7, opacity: 0 }}
              >
                {FLAME_LAYERS.map((L, j) => (
                  <svg
                    key={j}
                    className={styles.flameSvg}
                    viewBox="0 0 100 152"
                    preserveAspectRatio="none"
                    style={{ width: L.w, height: L.h, filter: `blur(${L.b}px)` }}
                  >
                    <path d={FLAME_PATH} fill={L.c} />
                  </svg>
                ))}
              </div>
            ))}
            {EMBERS.map((e, i) => (
              <div
                key={`e${i}`}
                data-ember={i}
                className={styles.ember}
                style={{ left: `${e.left}%`, width: e.size, height: e.size, opacity: 0 }}
              />
            ))}
          </div>

          {/* ignition flash */}
          <div className={styles.flash} data-el="flash" />

          {/* mascot rising out of the fire */}
          <div className={styles.hero}>
            <div className={styles.heroMove} data-el="heroMove" style={{ opacity: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/streak/fire-hero.png" alt="" />
            </div>
          </div>

          <div className={styles.headline} data-el="headline" style={{ opacity: 0 }}>5 in a row!</div>

          <button type="button" className={styles.btn} data-el="btn" style={{ opacity: 0, pointerEvents: 'none' }} onClick={dismiss}>
            <span className="material-symbols-outlined">local_fire_department</span>Continue
          </button>
        </div>
      )}
    </div>
  );

  return createPortal(overlay, document.body);
}

export default FireStreakTakeover;
