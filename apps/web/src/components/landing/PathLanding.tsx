/* eslint-disable @next/next/no-img-element */
'use client';

import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isInsideNativeShell } from '@/lib/native-bridge';
import LandingNavbar from './LandingNavbar';
import styles from './PathLanding.module.css';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ─────────  checkpoint data (matches the Figma "Path Concept" frame)  ───────── */
type Checkpoint = {
  id: string;
  kind?: 'start' | 'finish';
  icon: string;
  bubble?: string;
  nudge: number;
  side?: 'left' | 'right';
  mascotSide?: 'left' | 'right';
  mascot?: string[];
  active?: boolean;
  eyebrow?: ReactNode;
  title?: ReactNode;
  body?: ReactNode[];
  bullets?: ReactNode[];
  grade?: string;
  stars?: number;
};

const CP: Checkpoint[] = [
  { id: 'start', kind: 'start', icon: 'flag', bubble: 'START', nudge: 0 },
  {
    id: 'notes', icon: 'edit_note', nudge: -28, side: 'left', mascotSide: 'right', mascot: ['writing'],
    eyebrow: 'NOTES & CANVAS',
    title: <>Take <span className="pl-g-purple">Notes</span></>,
    body: [
      'Either as a Text editor with Inline AI features, or draw on a canvas using your pen.',
      'You already have Notes on another app? No worries, import them with a single click!',
    ],
    bullets: ['Slash menu & markdown shortcuts', 'Easy Import', 'Inline AI rewrite · Pro'],
  },
  {
    id: 'mage', icon: 'auto_awesome', nudge: 28, side: 'right', mascotSide: 'left', mascot: ['wave'],
    eyebrow: 'AI TUTOR',
    title: <>Meet your personal <span className="pl-g-gold">Mage</span></>,
    body: ['Ask about anything inside your Notes or study material, and get real-time answers!'],
    bullets: [<>Personalize your <span className="pl-g-gold">Mage</span></>, 'Feed him your material', 'And ask away!'],
  },
  {
    id: 'cards', icon: 'content_copy', nudge: -24, side: 'left', mascotSide: 'right', mascot: ['holding-flashcards'],
    eyebrow: 'SPACED REPETITION',
    title: <>Flashcards &amp; quizzes</>,
    body: ['Feed Mage your material, and watch him build flashcards and quizzes in seconds.'],
    bullets: ['No more hour-long flashcard creation', 'Test your knowledge in quizzes based on your material', 'Track your performance'],
  },
  {
    id: 'paths', icon: 'account_tree', nudge: 28, side: 'right', mascotSide: 'left', mascot: ['graduation'],
    active: true,
    eyebrow: 'THE MAIN EVENT',
    title: <><span className="pl-g-gold">Learning Paths</span> based on your material</>,
    body: ['An entire, multiphase learning path with theory modules, graded exams, and more from your study material!'],
    bullets: ['Phased units & sections', 'Graded checkpoint exams', 'Resume where you left off'],
  },
  {
    id: 'study', icon: 'group', nudge: -26, side: 'left', mascotSide: 'right', mascot: ['holding-scroll', 'default', 'writing', 'thinking'],
    eyebrow: 'CO-WORK',
    title: <>Study <span className="pl-g-purple">Together</span>.</>,
    body: ['Create study groups, share your files, and work on them together in live sessions!'],
    bullets: ['Live edits', 'Live chat', 'No time limits'],
  },
  {
    id: 'habit', icon: 'local_fire_department', nudge: 24, side: 'right', mascotSide: 'left', mascot: ['graduation'],
    grade: 'A', stars: 3,
    eyebrow: 'HABIT BUILDING',
    title: <>Make studying into a habit</>,
    body: ['Give yourself a daily goal, and compete against yourself!'],
    bullets: ['Streaks & achievements', 'Exam countdown', 'Reminders'],
  },
  { id: 'finish', kind: 'finish', icon: 'trophy', bubble: 'Finish', nudge: 0 },
];

/* vertical span of the connector BETWEEN node i and node i+1 */
const SEG_H = [240, 480, 480, 480, 480, 520, 320];

/* ─────────  hero preview carousel data  ───────── */
type SectionSlide = { eyebrow: string; title: ReactNode; grade: string; desc: ReactNode; nodes: string[] };
type VideoSlide = { video: string; label: string };
type Slide = SectionSlide | VideoSlide;
const SLIDES: Slide[] = [
  {
    // Intro explainer — the first object in the carousel. Source of truth lives
    // in brand_assets/videos/; this served copy is in apps/web/public/videos/.
    video: '/videos/learning_path_landing_video.mp4',
    label: 'See how NoteMage turns your material into a guided learning path',
  },
  {
    video: '/videos/notemage-flashcards-16x9.mp4',
    label: 'See how NoteMage turns your notes into flashcards',
  },
  {
    eyebrow: 'Section 1', title: 'Section 1: How Python Works', grade: 'C',
    desc: 'Understand what Python is, how it runs code, and the mental model behind it…',
    nodes: ['What is Python?', 'How Python Runs Code', 'Your First Python Program'],
  },
  {
    eyebrow: 'Section 2', title: 'Section 2: Data & Types', grade: 'B',
    desc: 'Numbers, strings, booleans, and how Python keeps your values in memory.',
    nodes: ['Variables & Assignment', 'Strings & Numbers', 'Lists & Dictionaries'],
  },
  {
    eyebrow: 'Section 3', title: 'Section 3: Control Flow', grade: 'A',
    desc: 'Make decisions and repeat work with conditionals, loops, and clean logic.',
    nodes: ['If / Else Logic', 'Loops & Iteration', 'Writing Functions'],
  },
];
const SLOTS = ['left', 'center', 'right'];
const CONN = ['M 80 6 C 80 40, 240 26, 240 58', 'M 240 6 C 240 40, 400 26, 400 58'];

/* footer links — paths verified against the existing LandingFooter */
const FOOTER_LINKS = [
  { label: 'Pricing', href: '/pricing' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
  { label: 'Docs', href: '/docs' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'Refunds', href: '/refund' },
  { label: 'Legal Notice', href: '/legal' },
];

function CarouselSlide({ s, idx, total, clone }: { s: Slide; idx: number; total: number; clone?: boolean }) {
  return (
    <div
      className="pl-car-slide"
      role="group"
      aria-roledescription="slide"
      aria-label={`${idx + 1} of ${total}`}
      {...(clone ? { 'data-clone': '', 'aria-hidden': true } : {})}
    >
      {'video' in s ? (
        <div className="pl-car-video-frame">
          <video
            className="pl-car-video"
            src={s.video}
            muted
            loop
            playsInline
            preload="auto"
            aria-label={s.label}
          />
        </div>
      ) : (
        <>
          <div className="pl-mini-banner">
            <div className="pl-mb-text">
              <div className="pl-mb-eyebrow">{s.eyebrow}</div>
              <div className="pl-mb-title">{s.title}</div>
              <div className="pl-mb-desc">{s.desc}</div>
            </div>
            <span className="pl-grade-pill"><strong>{s.grade}</strong> AVG</span>
            <span className="pl-mb-icon-btn"><span className="material-symbols-outlined">menu_book</span></span>
          </div>
          <div className="pl-mini-path">
            {s.nodes.map((label, i) => (
              <Fragment key={i}>
                <div className="pl-mini-row">
                  <div className={`pl-mini-slot pl-${SLOTS[i]}`}>
                    <div className="pl-mini-node">
                      <span className="material-symbols-outlined">menu_book</span>
                      <span className="pl-mini-check"><span className="material-symbols-outlined">check</span></span>
                    </div>
                    <div className="pl-mini-label">{label}</div>
                  </div>
                </div>
                {i < s.nodes.length - 1 && (
                  <svg className="pl-mini-conn" viewBox="0 0 480 64" preserveAspectRatio="none" aria-hidden>
                    <path d={CONN[i]} stroke="var(--node)" strokeWidth="5" fill="none" strokeLinecap="round" />
                  </svg>
                )}
              </Fragment>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Mascot({ cp }: { cp: Checkpoint }) {
  const mascots = cp.mascot ?? [];
  if (mascots.length > 1) {
    return (
      <div className="pl-mascot-grid" aria-hidden>
        {mascots.map((m, idx) => (
          <img key={idx} className={`pl-floaty pl-d${idx}`} src={`/mascot/${m}-v2.png`} alt="" loading="lazy" decoding="async" />
        ))}
      </div>
    );
  }
  return <img className="pl-mascot pl-floaty" src={`/mascot/${mascots[0]}-v2.png`} alt="" aria-hidden loading="lazy" decoding="async" />;
}

export default function PathLanding() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const carTrackRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  // Native shells (iOS WebView, Electron) boot into the app, never the marketing
  // landing. Catch deep links / errant navs that drop a native user back at /.
  useEffect(() => {
    if (isInsideNativeShell()) router.replace('/auth/login');
  }, [router]);

  /* ─────────  reveal-on-scroll for magic / CTA  ─────────
     Enhancement only: the reveal targets default to VISIBLE (a <noscript>
     fallback below + the `.pl-in`-on-failure paths here guarantee content is
     never gated on a transition that might not fire — headless render, an
     observer throw, or JS disabled). The hero is revealed by pure CSS so the
     LCP element paints immediately, independent of this effect. */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const revealAll = () => root.querySelectorAll('.pl-reveal').forEach((el) => el.classList.add('pl-in'));
    const reduce = prefersReducedMotion();
    if (reduce || typeof IntersectionObserver === 'undefined') {
      revealAll();
      return;
    }
    let io: IntersectionObserver;
    try {
      root.querySelectorAll<HTMLElement>('.pl-node-wrap .pl-gutter').forEach((g) => {
        g.style.transitionDelay = g.querySelector('.pl-card') ? '.08s' : '.2s';
      });
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (!e.isIntersecting) return;
            e.target.classList.add('pl-in');
            io.unobserve(e.target);
          });
        },
        { threshold: 0.18, rootMargin: '0px 0px -8% 0px' },
      );
      root.querySelectorAll('.pl-reveal').forEach((el) => io.observe(el));
    } catch {
      revealAll();
      return;
    }
    return () => io.disconnect();
  }, []);

  /* ─────────  ONE continuous trail line, bound to scroll position  ───────── */
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const reduce = prefersReducedMotion();
    const NS = 'http://www.w3.org/2000/svg';
    const spine = document.createElementNS(NS, 'svg');
    spine.setAttribute('class', 'pl-spine');
    spine.setAttribute('aria-hidden', 'true');
    const mk = (cls: string) => {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('class', cls);
      return p;
    };
    const base = mk('pl-base');
    const fill = mk('pl-fill');
    const tip = document.createElementNS(NS, 'g');
    tip.setAttribute('class', 'pl-tip');
    const halo = document.createElementNS(NS, 'circle');
    halo.setAttribute('class', 'pl-tip-halo');
    halo.setAttribute('r', '6.5');
    const ball = document.createElementNS(NS, 'circle');
    ball.setAttribute('class', 'pl-tip-ball');
    ball.setAttribute('r', '6.5');
    tip.append(halo, ball);
    spine.append(base, fill, tip);
    track.prepend(spine);

    const REF = 0.6; // the tip tracks this fraction down the viewport
    const EASE = 0.16; // momentum — the trail eases toward scroll
    let len = 0;
    let lut: number[] = []; // flat [y0,s0, y1,s1, …] mapping y → arc-length
    let curS = 0;
    let targetS = 0;
    let rafId: number | null = null;
    let nodeWraps: HTMLElement[] = [];
    let nodeS: number[] = [];
    let litState: boolean[] = [];
    let cancelled = false;

    function yToS(y: number) {
      if (y <= lut[0]) return 0;
      if (y >= lut[lut.length - 2]) return len;
      let lo = 0;
      let hi = lut.length / 2 - 1;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if (lut[m * 2] < y) lo = m + 1;
        else hi = m;
      }
      const y0 = lut[(lo - 1) * 2];
      const s0 = lut[(lo - 1) * 2 + 1];
      const y1 = lut[lo * 2];
      const s1 = lut[lo * 2 + 1];
      return s0 + ((y - y0) / ((y1 - y0) || 1)) * (s1 - s0);
    }

    function measure() {
      if (!len || !track) return 0;
      const refY = window.innerHeight * REF - track.getBoundingClientRect().top;
      const s = yToS(refY);
      return s < 0 ? 0 : s > len ? len : s;
    }

    function render() {
      fill.style.strokeDashoffset = String(len - curS);
      const p = fill.getPointAtLength(curS);
      tip.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
      tip.style.opacity = curS > 2 && curS < len - 2 ? '1' : '0';
      // The finish node (last) is lit by the "Start free" CTA observer below,
      // not the trail tip — otherwise it only lights at the very bottom of the
      // page. Skip it here so the trail never touches its lit state.
      for (let i = 0; i < nodeS.length - 1; i++) {
        const lit = curS >= nodeS[i];
        if (lit !== litState[i]) {
          litState[i] = lit;
          if (nodeWraps[i]) nodeWraps[i].classList.toggle('pl-lit', lit);
        }
      }
    }

    function failSafe() {
      // If the SVG trail can't be measured (headless render, a layout race, a
      // getPointAtLength throw), light every checkpoint so the cards/mascots are
      // never stranded at opacity:0. The decorative trail is lost; content lives.
      if (!track) return;
      track.querySelectorAll<HTMLElement>('.pl-node-wrap').forEach((w) => w.classList.add('pl-lit'));
    }

    function build() {
      if (cancelled || !track) return;
      try {
        const nodes = Array.from(track.querySelectorAll<SVGGElement | HTMLElement>('.pl-node'));
        if (nodes.length < 2) {
          failSafe();
          return;
        }
        const tr = track.getBoundingClientRect();
        const W = track.offsetWidth;
        const H = track.offsetHeight;
        const pts = nodes.map((n) => {
          const r = n.getBoundingClientRect();
          return { x: r.left + r.width / 2 - tr.left, y: r.top + r.height / 2 - tr.top };
        });
        let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1];
          const b = pts[i];
          const dy = b.y - a.y;
          d += ` C ${a.x.toFixed(1)} ${(a.y + dy * 0.4).toFixed(1)} ${b.x.toFixed(1)} ${(a.y + dy * 0.6).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
        }
        spine.setAttribute('viewBox', `0 0 ${W} ${H}`);
        spine.setAttribute('width', String(W));
        spine.setAttribute('height', String(H));
        base.setAttribute('d', d);
        fill.setAttribute('d', d);
        len = fill.getTotalLength();
        fill.style.strokeDasharray = String(len);
        lut = [];
        const N = 260;
        for (let i = 0; i <= N; i++) {
          const p = fill.getPointAtLength((len * i) / N);
          lut.push(p.y, (len * i) / N);
        }
        nodeWraps = Array.from(track.querySelectorAll<HTMLElement>('.pl-node-wrap'));
        nodeS = pts.map((p) => yToS(p.y));
        litState = nodeWraps.map(() => false);
        // preserve the finish (last) node's lit state — it's owned by the CTA observer
        nodeWraps.forEach((w, i) => { if (i < nodeWraps.length - 1) w.classList.remove('pl-lit'); });
        targetS = curS = measure();
        render();
      } catch {
        failSafe();
      }
    }

    function tick() {
      rafId = null;
      targetS = measure();
      const d = targetS - curS;
      if (Math.abs(d) < 0.4) {
        curS = targetS;
        render();
        return;
      }
      curS += d * EASE;
      render();
      rafId = requestAnimationFrame(tick);
    }
    const onScroll = () => {
      if (rafId == null) rafId = requestAnimationFrame(tick);
    };

    if (reduce) {
      build();
      fill.style.strokeDashoffset = '0';
      tip.style.display = 'none';
      nodeWraps.forEach((w) => w.classList.add('pl-lit'));
      return () => {
        cancelled = true;
        spine.remove();
      };
    }

    build();
    let rt: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(rt);
      rt = setTimeout(build, 150);
    };
    const onLoad = () => setTimeout(build, 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('load', onLoad);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (!cancelled) setTimeout(build, 60);
      });
    }

    return () => {
      cancelled = true;
      if (rafId != null) cancelAnimationFrame(rafId);
      clearTimeout(rt);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('load', onLoad);
      spine.remove();
    };
  }, []);

  /* ─────────  finish trophy lights when the "Start free" CTA is in view  ─────────
     The finish node sits above the CTA, but the trail tip only reaches it near
     the page bottom — so light it the moment the "Start free" button appears. */
  useEffect(() => {
    const track = trackRef.current;
    const cta = ctaRef.current;
    if (!track || !cta) return;
    const wraps = track.querySelectorAll<HTMLElement>('.pl-node-wrap');
    const finish = wraps[wraps.length - 1];
    if (!finish) return;
    if (typeof IntersectionObserver === 'undefined') {
      finish.classList.add('pl-lit');
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          finish.classList.add('pl-lit');
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(cta);
    return () => io.disconnect();
  }, []);

  /* "The magic" → scroll down to the START checkpoint */
  const onMagicClick = () => {
    const startNode = rootRef.current?.querySelector('.pl-node-wrap[data-cp="0"]');
    startNode?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  };

  /* ─────────  hero preview carousel  ───────── */
  useEffect(() => {
    const root = carouselRef.current;
    const track = carTrackRef.current;
    const dotsWrap = dotsRef.current;
    if (!root || !track || !dotsWrap) return;

    const N = SLIDES.length;
    const cells = Array.from(track.children) as HTMLElement[]; // N + 2 (clones at both ends)
    const dots = Array.from(dotsWrap.children) as HTMLElement[];
    const reduce = prefersReducedMotion();
    const vp = root.querySelector<HTMLElement>('.pl-car-viewport');
    const playPauseBtn = root.querySelector<HTMLButtonElement>('.pl-car-playpause');
    // Each video slide (and the loop clone) renders a <video>. Only the current
    // slide's clip plays — the rest stay paused so the hero never decodes more
    // than one at a time. Playback is JS-gated, so reduced-motion users get a
    // paused first frame (no autoplay attribute on the elements).
    const videos = Array.from(track.querySelectorAll<HTMLVideoElement>('video.pl-car-video'));
    let cur = 1; // cells[1] = first real slide
    let userPaused = false; // manual pause of the current slide's video

    const currentVideo = (): HTMLVideoElement | null =>
      videos.find((v) => cells[cur].contains(v)) ?? null;

    // The play/pause control governs the current slide's video — the pause
    // affordance WCAG 2.2.2 wants for the looping clips. Hidden on slides with
    // no video (and under reduced motion, via CSS).
    const syncPlayPause = () => {
      if (!playPauseBtn) return;
      const cv = currentVideo();
      playPauseBtn.style.display = cv ? '' : 'none';
      if (!cv) return;
      const icon = playPauseBtn.querySelector('.material-symbols-outlined');
      if (icon) icon.textContent = cv.paused ? 'play_arrow' : 'pause';
      playPauseBtn.setAttribute('aria-label', cv.paused ? 'Play video' : 'Pause video');
    };
    const syncVideos = () => {
      const cv = currentVideo();
      videos.forEach((v) => {
        if (v === cv && !userPaused && !reduce) void v.play().catch(() => {});
        else v.pause();
      });
      syncPlayPause();
    };

    function paint(animate: boolean) {
      track!.style.transition = animate ? '' : 'none';
      if (vp) vp.style.transition = animate ? '' : 'none';
      track!.style.transform = `translateX(${-cells[cur].offsetLeft}px)`;
      // Viewport hugs the current slide's own height, so each 16:9 video and the
      // taller section previews fill the window without letterboxing.
      if (vp) vp.style.height = `${cells[cur].offsetHeight}px`;
      cells.forEach((c, i) => c.classList.toggle('pl-is-current', i === cur));
      const logical = (((cur - 1) % N) + N) % N;
      dots.forEach((d, i) => {
        if (i === logical) d.setAttribute('aria-current', 'true');
        else d.removeAttribute('aria-current');
      });
      syncVideos();
      if (!animate) {
        void track!.offsetWidth; // commit, then re-enable transitions
        track!.style.transition = '';
        if (vp) vp.style.transition = '';
      }
    }
    function step(dir: number) {
      userPaused = false;
      if (cur > N) {
        cur = 1;
        paint(false);
      } else if (cur < 1) {
        cur = N;
        paint(false);
      }
      cur += dir;
      paint(true);
    }
    function toLogical(L: number) {
      userPaused = false;
      cur = L + 1;
      paint(true);
    }

    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.target !== track || e.propertyName !== 'transform') return;
      if (cur > N) {
        cur = 1;
        paint(false);
      } else if (cur < 1) {
        cur = N;
        paint(false);
      }
    };
    track.addEventListener('transitionend', onTransitionEnd);

    // Manual navigation only — the carousel never advances on its own.
    const dotHandlers = dots.map((d) => {
      const h = () => toLogical(Number(d.dataset.i));
      d.addEventListener('click', h);
      return h;
    });

    const prevBtn = root.querySelector<HTMLButtonElement>('.pl-car-arrow.pl-prev');
    const nextBtn = root.querySelector<HTMLButtonElement>('.pl-car-arrow.pl-next');
    const onPrev = () => step(-1);
    const onNext = () => step(1);
    prevBtn?.addEventListener('click', onPrev);
    nextBtn?.addEventListener('click', onNext);

    const onPlayPause = () => {
      const cv = currentVideo();
      if (!cv) return;
      if (cv.paused) {
        userPaused = false;
        void cv.play().catch(() => {});
      } else {
        userPaused = true;
        cv.pause();
      }
      syncPlayPause();
    };
    playPauseBtn?.addEventListener('click', onPlayPause);
    videos.forEach((v) => {
      v.addEventListener('play', syncPlayPause);
      v.addEventListener('pause', syncPlayPause);
    });

    // swipe / drag
    let x0: number | null = null;
    const onPointerDown = (e: PointerEvent) => {
      x0 = e.clientX;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (x0 == null) return;
      const dx = e.clientX - x0;
      if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
      x0 = null;
    };
    vp?.addEventListener('pointerdown', onPointerDown);
    vp?.addEventListener('pointerup', onPointerUp);

    paint(false);
    let rt: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(rt);
      rt = setTimeout(() => paint(false), 120);
    };
    window.addEventListener('resize', onResize);

    return () => {
      clearTimeout(rt);
      track.removeEventListener('transitionend', onTransitionEnd);
      dots.forEach((d, i) => d.removeEventListener('click', dotHandlers[i]));
      prevBtn?.removeEventListener('click', onPrev);
      nextBtn?.removeEventListener('click', onNext);
      playPauseBtn?.removeEventListener('click', onPlayPause);
      videos.forEach((v) => {
        v.removeEventListener('play', syncPlayPause);
        v.removeEventListener('pause', syncPlayPause);
      });
      vp?.removeEventListener('pointerdown', onPointerDown);
      vp?.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // [cloneOf(last), s0 … s(N-1), cloneOf(first)] — a real next slide always peeks on
  // the right and the loop is seamless (animate onto a clone, snap to its real twin).
  const N = SLIDES.length;

  return (
    <div className={styles.root} ref={rootRef}>
      {/* Enhancement-safety: without JS the reveal/lit classes never toggle, so
          force every reveal target visible. The CSS-only hero entrance is
          unaffected; this only defeats the JS-gated opacity:0 start states. */}
      <noscript>
        <style>{`.nm-landing .pl-reveal,.nm-landing .pl-node-wrap .pl-gutter{opacity:1!important;transform:none!important}`}</style>
      </noscript>
      {/* ─────────────  NAV  ─────────────
          Shared marketing pill, identical across every signed-out page. */}
      <LandingNavbar />

      <div className="pl-page">
        {/* ─────────────  HERO  ───────────── */}
        <div className="pl-hero">
          <h1>
            Your <span className="pl-g-gold">Path</span> to academic success
          </h1>
        </div>

        <section className="pl-hero-stage">
          <div className="pl-hero-card">
            <div className="pl-carousel" ref={carouselRef} aria-roledescription="carousel" aria-label="NoteMage videos and example learning sections">
              <div className="pl-car-viewport">
                <div className="pl-car-track" ref={carTrackRef}>
                  <CarouselSlide s={SLIDES[N - 1]} idx={N - 1} total={N} clone />
                  {SLIDES.map((s, i) => (
                    <CarouselSlide key={i} s={s} idx={i} total={N} />
                  ))}
                  <CarouselSlide s={SLIDES[0]} idx={0} total={N} clone />
                </div>
              </div>
              <button className="pl-car-arrow pl-prev" type="button" aria-label="Previous section">
                <span className="material-symbols-outlined" aria-hidden>chevron_left</span>
              </button>
              <button className="pl-car-arrow pl-next" type="button" aria-label="Next section">
                <span className="material-symbols-outlined" aria-hidden>chevron_right</span>
              </button>
              <div className="pl-car-controls">
                <div className="pl-car-dots" ref={dotsRef} role="group" aria-label="Choose a section">
                  {SLIDES.map((s, i) => {
                    const isVideo = 'video' in s;
                    const n = SLIDES.slice(0, i + 1).filter((x) => 'video' in x === isVideo).length;
                    return (
                      <button
                        key={i}
                        className="pl-car-dot"
                        type="button"
                        aria-label={isVideo ? `Go to video ${n}` : `Go to section ${n}`}
                        data-i={i}
                      />
                    );
                  })}
                </div>
                <button className="pl-car-playpause" type="button" aria-label="Pause video">
                  <span className="material-symbols-outlined" aria-hidden>pause</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────  "The magic"  ───────────── */}
        <div className="pl-magic-wrap">
          <button className="pl-magic pl-reveal" type="button" onClick={onMagicClick}>
            <span className="material-symbols-outlined" aria-hidden>arrow_drop_down</span>
            The magic
          </button>
        </div>

        {/* ─────────────  PATH  ───────────── */}
        <main className="pl-path" id="how-it-works">
          <h2 className="pl-sr-only">How NoteMage works</h2>
          <div className="pl-track" ref={trackRef}>
            {CP.map((cp, i) => {
              const cls =
                cp.kind === 'start' ? 'pl-start' : cp.kind === 'finish' ? 'pl-finish' : cp.active ? 'pl-active' : '';
              const lone = (cp.mascot?.length ?? 0) > 1 ? '' : ' pl-lone';
              return (
                <Fragment key={cp.id}>
                  <div className="pl-node-wrap" data-cp={i}>
                    {cp.title && (
                      <>
                        <div className={`pl-gutter pl-${cp.side} pl-from-${cp.side}`}>
                          <div className={`pl-card ${cp.active ? 'pl-active' : ''}`}>
                            <span className="pl-eyebrow">{cp.eyebrow}</span>
                            <h3>{cp.title}</h3>
                            {cp.body?.map((p, bi) => <p key={bi}>{p}</p>)}
                            <ul className="pl-bullets">
                              {cp.bullets?.map((b, bi) => (
                                <li key={bi}>
                                  <span className="pl-spark" aria-hidden>✦</span>
                                  <span>{b}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                        <div className={`pl-gutter pl-${cp.mascotSide}${lone}`}>
                          <Mascot cp={cp} />
                        </div>
                      </>
                    )}
                    <div className="pl-node-col">
                      {cp.bubble && (
                        <span className={`pl-node-bubble pl-${cp.kind} ${cp.kind === 'finish' ? 'pl-bob' : ''}`}>
                          {cp.bubble}
                        </span>
                      )}
                      <div className="pl-node-shift" style={cp.nudge ? { transform: `translateX(${cp.nudge}px)` } : undefined}>
                        <div className={`pl-node ${cls}`} {...(cp.active ? { 'aria-current': 'page' as const } : {})}>
                          <span className="material-symbols-outlined" aria-hidden>{cp.icon}</span>
                          {cp.grade && <span className="pl-node-grade">{cp.grade}</span>}
                        </div>
                        {cp.stars ? (
                          <div className="pl-node-stars" aria-hidden>
                            {Array.from({ length: cp.stars }).map((_, si) => (
                              <span key={si} className="material-symbols-outlined filled">star</span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {i < CP.length - 1 && <div className="pl-seg" style={{ height: SEG_H[i] }} />}
                </Fragment>
              );
            })}
          </div>
        </main>

        {/* ─────────────  CTA  ───────────── */}
        <section className="pl-cta">
          <h2 className="pl-reveal">
            Try it out for <span className="pl-g-gold">FREE</span>
          </h2>
          <div className="pl-cta-row pl-reveal" ref={ctaRef}>
            <Link className="pl-btn-gold pl-lg" href="/auth/register">
              Start free <span aria-hidden>→</span>
            </Link>
            <Link className="pl-btn-ghost pl-lg" href="/pricing">See pricing</Link>
          </div>
        </section>

        {/* ─────────────  FOOTER  ───────────── */}
        <footer className="pl-footer">
          <div className="pl-footer-top">
            <div className="pl-brand">
              <img src="/logo_trimmed.png" alt="Notemage" width={75} height={28} loading="lazy" decoding="async" />
            </div>
            <a
              className="pl-footer-orb"
              href="https://www.tiktok.com/@notemage"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Notemage on TikTok"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M19.321 5.562a5.124 5.124 0 0 1-3.414-1.267 5.124 5.124 0 0 1-1.537-2.723 5.105 5.105 0 0 1-.08-.898h-3.29v13.4a3.022 3.022 0 0 1-5.436 1.817 3.02 3.02 0 0 1-.604-1.817 3.022 3.022 0 0 1 3.022-3.022c.324 0 .634.051.926.145V8.045a6.353 6.353 0 0 0-.926-.067 6.318 6.318 0 0 0-6.318 6.318 6.318 6.318 0 0 0 6.318 6.318 6.318 6.318 0 0 0 6.318-6.318V8.871a8.399 8.399 0 0 0 5.021 1.647V7.226a5.124 5.124 0 0 1-.001-1.664z" />
              </svg>
            </a>
          </div>
          <nav className="pl-footer-links" aria-label="Footer">
            {FOOTER_LINKS.map((l) => (
              <Link key={l.href} href={l.href}>{l.label}</Link>
            ))}
          </nav>
          <div className="pl-footer-copy">© 2026{'  '}Notemage</div>
        </footer>
      </div>
    </div>
  );
}
