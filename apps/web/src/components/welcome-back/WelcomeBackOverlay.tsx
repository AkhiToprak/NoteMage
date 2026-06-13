'use client';

/**
 * Full-screen "welcome back" takeover. The NoteMage mascot examines a MISSING
 * poster, recoils in shock when it realises the missing person is *you*, then
 * presents it and waves as a "FOUND!" stamp lands and the CTA appears.
 *
 * Authored on a fixed design canvas (1920x1080 landscape / 1080x1920 portrait)
 * and scaled to contain the viewport — the scrim shares the stage background so
 * the letterbox bars are invisible on any aspect ratio. Motion runs from one
 * deterministic clock (the same timeline used by the rendered brand videos).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import styles from './welcome-back-overlay.module.css';

const DUR = 9.0;

// --- timing helpers (shared with the rendered brand-video timeline) ---
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (x: number) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a), 0, 1);
const fadeWin = (t: number, a: number, b: number, f: number) => (t <= a || t >= b ? 0 : clamp(Math.min((t - a) / f, (b - t) / f), 0, 1));
const backOut = (x: number) => { const c1 = 1.70158, c3 = c1 + 1; x = clamp(x, 0, 1); return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const outCubic = (x: number) => { x = clamp(x, 0, 1); return 1 - Math.pow(1 - x, 3); };

// --- beat windows (seconds) ---
const B = {
  examIn: [0.30, 1.30], posterIn: [0.20, 1.15], lean: [1.15, 2.10], think: [1.05, 2.15],
  shock: 2.20, present: 3.50, welcome: 4.90,
  headIn: [5.00, 5.55], subIn: [5.45, 5.95], btnIn: [5.75, 6.35],
};

type Orient = 'landscape' | 'portrait';

const POSTER_STARS = Array.from({ length: 9 }, (_, i) => ({
  ang: (i / 9) * Math.PI * 2 + 0.3,
  size: 18 + (i % 4) * 9,
  color: i % 3 === 0 ? '#ae89ff' : '#ffde59',
}));

const TWINKLES: Record<Orient, { x: number; y: number; s: number; ph: number }[]> = {
  landscape: [
    { x: 150, y: 760, s: 30, ph: 0.0 }, { x: 560, y: 250, s: 24, ph: 1.3 }, { x: 1150, y: 150, s: 30, ph: 2.2 },
    { x: 1660, y: 300, s: 26, ph: 3.0 }, { x: 1720, y: 820, s: 34, ph: 4.1 }, { x: 300, y: 980, s: 22, ph: 5.0 }, { x: 1000, y: 980, s: 26, ph: 2.7 },
  ],
  portrait: [
    { x: 120, y: 300, s: 30, ph: 0.0 }, { x: 930, y: 240, s: 26, ph: 1.3 }, { x: 120, y: 780, s: 24, ph: 2.2 },
    { x: 950, y: 700, s: 30, ph: 3.0 }, { x: 160, y: 1250, s: 28, ph: 4.1 }, { x: 150, y: 1470, s: 22, ph: 5.0 }, { x: 520, y: 96, s: 26, ph: 2.7 },
  ],
};

function Star({ size, color }: { size: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0 L14.6 9.4 L24 12 L14.6 14.6 L12 24 L9.4 14.6 L0 12 L9.4 9.4 Z" fill={color || '#ffde59'} />
    </svg>
  );
}

function computeLayout(): { orient: Orient; scale: number } {
  if (typeof window === 'undefined') return { orient: 'landscape', scale: 1 };
  const vw = window.innerWidth, vh = window.innerHeight;
  const orient: Orient = vw >= vh ? 'landscape' : 'portrait';
  const W = orient === 'portrait' ? 1080 : 1920;
  const H = orient === 'portrait' ? 1920 : 1080;
  return { orient, scale: Math.min(vw / W, vh / H) };
}

export function WelcomeBackOverlay({ onDismiss }: { onDismiss: () => void }) {
  const scrimRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [{ orient, scale }, setLayout] = useState(computeLayout);
  const [leaving, setLeaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const reduced = useRef(false);

  // orientation + contain-scale, recomputed on resize
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

  // lock background scroll while the takeover is up
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // render the animated stage only after mount — keeps SSR to the bare dark
  // scrim (instant cover, no dashboard flash) and avoids an orientation
  // hydration mismatch since computeLayout needs the real viewport.
  useEffect(() => { setMounted(true); }, []);

  const dismiss = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onDismiss, 420);
  }, [leaving, onDismiss]);

  // close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismiss]);

  // ---- the animation clock ----
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const q = (sel: string) => stage.querySelector<HTMLElement>(sel);
    const qa = (sel: string) => Array.from(stage.querySelectorAll<HTMLElement>(sel));
    const els = {
      posterWrap: q('[data-el="posterWrap"]'), frame: q('[data-el="frame"]'),
      pBig: q('[data-el="pBig"]'), pName: q('[data-el="pName"]'), stamp: q('[data-el="stamp"]'),
      mascot: q('[data-el="mascot"]'), mExam: q('[data-el="mExam"]'), mHide: q('[data-el="mHide"]'),
      mPoint: q('[data-el="mPoint"]'), mWave: q('[data-el="mWave"]'),
      thoughtQ: q('[data-el="thoughtQ"]'), sweat: q('[data-el="sweat"]'), bang: q('[data-el="bang"]'),
      wbHead: q('[data-el="wbHead"]'), wbSub: q('[data-el="wbSub"]'), wbBtn: q('[data-el="wbBtn"]'),
      ml: qa('[data-ml]'), pstars: qa('[data-pstar]'), tw: qa('[data-tw]'),
    };
    const TW = TWINKLES[orient];

    const renderFrame = (t: number) => {
      // poster pins in + swings, shock shake
      const pin = smooth(seg(t, B.posterIn[0], B.posterIn[1]));
      const swing = t < B.posterIn[1] + 0.9 ? Math.sin((t - B.posterIn[0]) * 7.5) * 7 * (1 - smooth(seg(t, B.posterIn[0], B.posterIn[1] + 0.9))) : 0;
      const psh = fadeWin(t, B.shock, B.shock + 0.9, 0.18);
      const shakeR = psh * Math.sin(t * 46) * 2.4;
      if (els.posterWrap) {
        els.posterWrap.style.opacity = pin.toFixed(3);
        els.posterWrap.style.transform = `translateY(${lerp(-26, 0, pin).toFixed(1)}px) rotate(${(lerp(-7, -2, backOut(pin)) + swing + shakeR).toFixed(2)}deg)`;
      }
      const flash = Math.sin(Math.PI * seg(t, B.shock, B.shock + 0.55));
      if (els.frame) els.frame.style.borderColor = flash > 0.05 ? `rgba(140,82,255,${(0.45 + 0.55 * flash).toFixed(2)})` : 'var(--wb-paper-ink)';
      if (els.pBig) els.pBig.style.transform = `scale(${(1 + 0.10 * Math.sin(Math.PI * seg(t, B.shock + 0.05, B.shock + 0.5))).toFixed(3)})`;
      if (els.pName) {
        els.pName.style.transform = `scale(${(1 + 0.12 * Math.sin(Math.PI * seg(t, B.present, B.present + 0.5))).toFixed(3)})`;
        els.pName.style.color = seg(t, B.present, B.present + 0.3) > 0 ? '#6d39dd' : 'var(--wb-paper-ink)';
      }
      // "FOUND!" stamp slams on at the welcome beat
      if (els.stamp) {
        const stO = smooth(seg(t, B.welcome + 0.05, B.welcome + 0.28));
        const stSettle = backOut(smooth(seg(t, B.welcome + 0.05, B.welcome + 0.42)));
        const stJit = Math.sin(t * 42) * 1.3 * fadeWin(t, B.welcome + 0.22, B.welcome + 0.7, 0.14);
        els.stamp.style.opacity = stO.toFixed(3);
        els.stamp.style.transform = `translate(-50%,-50%) rotate(${(-13 + stJit).toFixed(2)}deg) scale(${lerp(1.55, 1, stSettle).toFixed(3)})`;
      }
      // poster sparkles ring it on present
      const sp = seg(t, B.present + 0.05, B.present + 0.85);
      els.pstars.forEach((el, i) => {
        const s = POSTER_STARS[i]; const f = outCubic(sp);
        const rx = lerp(30, 300, f), ry = lerp(30, 408, f);
        el.style.opacity = (sp <= 0 || sp >= 1 ? 0 : 0.2 + 0.8 * Math.sin(Math.PI * sp)).toFixed(3);
        el.style.transform = `translate(${(Math.cos(s.ang) * rx - s.size / 2).toFixed(1)}px,${(Math.sin(s.ang) * ry - s.size / 2).toFixed(1)}px) rotate(${(120 * sp).toFixed(1)}deg) scale(${lerp(0.4, 1, Math.sin(Math.PI * sp)).toFixed(3)})`;
      });

      // mascot pose cross-fades
      const examOp = smooth(seg(t, B.examIn[0], B.examIn[1]));
      const toHide = smooth(seg(t, B.shock, B.shock + 0.22));
      const toPoint = smooth(seg(t, B.present, B.present + 0.24));
      const toWave = smooth(seg(t, B.welcome, B.welcome + 0.26));
      if (els.mExam) els.mExam.style.opacity = (examOp * (1 - toHide)).toFixed(3);
      if (els.mHide) els.mHide.style.opacity = (toHide * (1 - toPoint)).toFixed(3);
      if (els.mPoint) els.mPoint.style.opacity = (toPoint * (1 - toWave)).toFixed(3);
      if (els.mWave) els.mWave.style.opacity = toWave.toFixed(3);

      // mascot container motion
      const rise = lerp(420, 0, backOut(examOp));
      const lean = smooth(seg(t, B.lean[0], B.lean[1])) * (1 - toHide);
      const recoil = fadeWin(t, B.shock, B.present + 0.4, 0.18);
      const recoilX = Math.sin(Math.PI * seg(t, B.shock, B.shock + 0.55)) * 70 + recoil * 18;
      const recoilY = -Math.sin(Math.PI * seg(t, B.shock, B.shock + 0.5)) * 40;
      const sh = fadeWin(t, B.shock, B.shock + 0.85, 0.16);
      const shakeX = sh * Math.sin(t * 44) * 7;
      const bob = t > B.welcome ? 7 * Math.sin(t * 2.2) : 0;
      const idleR = t > B.welcome + 0.3 ? 2.4 * Math.sin(t * 2.0 + 0.5) : 0;
      const tx = lerp(0, -26, lean) + recoilX + shakeX;
      const ty = rise + recoilY + bob;
      let sx = 1, sy = 1;
      const land = Math.sin(Math.PI * seg(t, B.examIn[1] - 0.12, B.examIn[1] + 0.12));
      sy *= 1 - 0.07 * land; sx *= 1 + 0.05 * land;
      const crouch = Math.sin(Math.PI * seg(t, B.shock, B.shock + 0.4));
      sy *= 1 - 0.06 * crouch; sx *= 1 + 0.05 * crouch;
      const rot = lerp(0, -4, lean) + idleR + sh * Math.sin(t * 40) * 1.4;
      if (els.mascot) {
        els.mascot.style.opacity = examOp.toFixed(3);
        els.mascot.style.transform = `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${sx.toFixed(3)},${sy.toFixed(3)})`;
      }

      // thought "?" while examining
      if (els.thoughtQ) {
        const th = fadeWin(t, B.think[0], B.think[1], 0.4);
        els.thoughtQ.style.opacity = (th * (1 - toHide)).toFixed(3);
        els.thoughtQ.style.transform = `translateY(${lerp(14, -10, smooth(seg(t, B.think[0], B.think[1]))).toFixed(1)}px) scale(${lerp(0.6, 1, backOut(smooth(seg(t, B.think[0], B.think[0] + 0.4)))).toFixed(3)})`;
      }
      // "!" burst + motion lines + sweat on shock
      if (els.bang) {
        const bp = smooth(seg(t, B.shock, B.shock + 0.2));
        const bOut = smooth(seg(t, B.shock + 0.85, B.shock + 1.15));
        const bjig = Math.sin(t * 30) * 4 * fadeWin(t, B.shock, B.shock + 0.9, 0.2);
        els.bang.style.opacity = clamp(bp - bOut, 0, 1).toFixed(3);
        els.bang.style.transform = `translate(${bjig.toFixed(1)}px,${lerp(20, 0, backOut(bp)).toFixed(1)}px) scale(${lerp(0.2, 1, backOut(bp)).toFixed(3)})`;
      }
      const lp = seg(t, B.shock + 0.02, B.shock + 0.5);
      els.ml.forEach((e, i) => {
        const ang = (-50 + i * 42) * Math.PI / 180;
        const len = lerp(10, 64, outCubic(lp));
        e.style.opacity = (lp <= 0 || lp >= 1 ? 0 : 1 - lp).toFixed(3);
        e.style.width = `${len.toFixed(0)}px`;
        e.style.left = `${(300 + Math.cos(ang) * 26).toFixed(0)}px`;
        e.style.top = `${(20 + Math.sin(ang) * 26).toFixed(0)}px`;
        e.style.transform = `rotate(${(ang * 180 / Math.PI).toFixed(1)}deg)`;
      });
      if (els.sweat) {
        const swp = fadeWin(t, B.shock + 0.15, B.shock + 0.95, 0.2);
        els.sweat.style.opacity = swp.toFixed(3);
        els.sweat.style.transform = `translateY(${lerp(-6, 34, smooth(seg(t, B.shock + 0.15, B.shock + 0.8))).toFixed(1)}px)`;
      }

      // copy + CTA
      if (els.wbHead) {
        const hp = smooth(seg(t, B.headIn[0], B.headIn[1]));
        els.wbHead.style.opacity = hp.toFixed(3);
        els.wbHead.style.transform = `translateY(${lerp(30, 0, backOut(hp)).toFixed(1)}px)`;
      }
      if (els.wbSub) {
        const sp2 = smooth(seg(t, B.subIn[0], B.subIn[1]));
        els.wbSub.style.opacity = sp2.toFixed(3);
        els.wbSub.style.transform = `translateY(${lerp(18, 0, backOut(sp2)).toFixed(1)}px)`;
      }
      if (els.wbBtn) {
        const btp = smooth(seg(t, B.btnIn[0], B.btnIn[1]));
        const pulse = t > B.btnIn[1] + 0.15 ? 0.5 + 0.5 * Math.sin((t - B.btnIn[1] - 0.15) * 3.0) : 0;
        els.wbBtn.style.opacity = btp.toFixed(3);
        els.wbBtn.style.transform = `translateY(${lerp(20, 0, backOut(btp)).toFixed(1)}px) scale(${(1 + 0.035 * pulse).toFixed(3)})`;
        els.wbBtn.style.pointerEvents = btp > 0.6 ? 'auto' : 'none';
      }

      // twinkles
      const twv = smooth(seg(t, B.welcome + 0.2, B.welcome + 1.0));
      els.tw.forEach((d, i) => {
        const s = TW[i]; if (!s) return;
        const twi = Math.max(0, Math.sin(t * 2.6 + s.ph));
        d.style.opacity = (twv * (0.25 + 0.75 * twi)).toFixed(3);
        d.style.transform = `scale(${(0.7 + 0.35 * twi).toFixed(3)}) rotate(${(18 * Math.sin(t * 1.2 + s.ph)).toFixed(1)}deg)`;
      });
    };

    if (reduced.current) { renderFrame(DUR); return; }

    let raf = 0;
    const tick = (ts: number) => {
      if (startRef.current == null) startRef.current = ts;
      renderFrame((ts - startRef.current) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [orient, mounted]);

  const W = orient === 'portrait' ? 1080 : 1920;
  const H = orient === 'portrait' ? 1920 : 1080;

  return (
    <div
      ref={scrimRef}
      className={styles.scrim}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome back"
      style={{ opacity: leaving ? 0 : 1, transition: 'opacity .4s ease' }}
    >
      <div className={styles.dots} aria-hidden />
      {mounted && (
      <div ref={stageRef} className={styles.stage} data-orient={orient} style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})` }}>
        {/* poster */}
        <div className={styles.posterWrap} data-el="posterWrap" style={{ opacity: 0 }}>
          <div className={styles.pin} />
          <div className={styles.poster}>
            <div className={`${styles.tape} ${styles.tapeTl}`} />
            <div className={`${styles.tape} ${styles.tapeBr}`} />
            <div className={styles.frame} data-el="frame" />
            <div className={styles.pInner}>
              <div className={styles.pKick}>Have you seen</div>
              <div className={styles.pBig} data-el="pBig">MISSING</div>
              <div className={styles.pRule} />
              <div className={styles.portrait}>
                <span className={`material-symbols-outlined ${styles.sil}`} style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
                <span className={styles.q}>?</span>
              </div>
              <div className={styles.nameplate} data-el="pName">USER</div>
              <div className={styles.rows}>
                <div className={styles.prow}><span className={styles.k}>Last seen</span><span className={styles.v}>Ages ago</span></div>
                <div className={styles.prow}><span className={styles.k}>Reward</span><span className={styles.v}>Your streak</span></div>
                <div className={styles.pFine}>If found, return at once to your notes, flashcards &amp; paths.</div>
              </div>
              <div className={styles.foundStamp} data-el="stamp"><b>Found!</b></div>
            </div>
            <div className={styles.pstars}>
              {POSTER_STARS.map((s, i) => (
                <span key={i} className={styles.pstar} data-pstar style={{ left: 0, top: 0, opacity: 0 }}><Star size={s.size} color={s.color} /></span>
              ))}
            </div>
          </div>
        </div>

        {/* mascot */}
        <div className={styles.mascotWrap} data-el="mascot" style={{ opacity: 0 }}>
          <img className={styles.mFlip} data-el="mExam" src="/welcome-back/mascot-examine.svg" alt="" />
          <img data-el="mHide" src="/welcome-back/mascot-shock.svg" alt="" style={{ opacity: 0 }} />
          <img data-el="mPoint" src="/welcome-back/mascot-present.svg" alt="" style={{ opacity: 0 }} />
          <img data-el="mWave" src="/welcome-back/mascot-welcome.svg" alt="" style={{ opacity: 0 }} />
          <div className={styles.thoughtQ} data-el="thoughtQ">?</div>
          <div className={styles.sweat} data-el="sweat" />
          <div className={styles.bangBubble} data-el="bang"><b>!</b></div>
          <div className={styles.mline} data-ml /><div className={styles.mline} data-ml /><div className={styles.mline} data-ml />
        </div>

        {/* copy + CTA */}
        <div className={styles.copy}>
          <div className={styles.wbHead} data-el="wbHead" style={{ opacity: 0 }}>Found <span className={styles.g}>you.</span></div>
          <button type="button" className={styles.wbBtn} data-el="wbBtn" style={{ opacity: 0, pointerEvents: 'none' }} onClick={dismiss}>
            <span className={`material-symbols-outlined ${styles.ic}`} style={{ fontVariationSettings: "'FILL' 1" }}>waving_hand</span>Welcome back
          </button>
        </div>

        {/* twinkles */}
        <div className={styles.twinkles}>
          {TWINKLES[orient].map((s, i) => (
            <span key={`${orient}-${i}`} className={styles.tw} data-tw style={{ left: s.x, top: s.y, opacity: 0 }}><Star size={s.s} /></span>
          ))}
        </div>
        </div>
      )}
    </div>
  );
}

export default WelcomeBackOverlay;
