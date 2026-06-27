/* eslint-disable @next/next/no-img-element */
'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isInsideNativeShell } from '@/lib/native-bridge';
import { setPendingUpload, patchOnboardingDraft } from '@/lib/onboarding-handoff';
import { extractCappedCorpus } from '@/lib/onboarding-corpus';
import { putPendingFile, putPendingCorpus } from '@/lib/onboarding-file-store';
import { uploadTooLarge, MAX_UPLOAD_LABEL } from '@/lib/onboarding-preview-constants';
import MageNav from './MageNav';
import MageFooter from './MageFooter';
import styles from './PathLanding.module.css';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ─────────  checkpoint data (matches the Figma "Notemage Landing New" frame)  ─────────
   START → 5 alternating cards → Finish. `side` is the card's rail, `mascotSide` the
   opposite rail, `nudge` shifts the node toward its card (the gentle ±30 zig-zag in
   the Figma). One card is `active` — the "aha moment". `mascot` keys a book-wizard
   pose in /public/landing. */
type Checkpoint = {
  id: string;
  kind?: 'start' | 'finish';
  icon: string;
  bubble?: string;
  nudge: number;
  side?: 'left' | 'right';
  mascotSide?: 'left' | 'right';
  mascot?: string;
  active?: boolean;
  eyebrow?: string;
  title?: ReactNode;
  body?: string[];
  bullets?: string[];
};

const CP: Checkpoint[] = [
  { id: 'start', kind: 'start', icon: 'flag', bubble: 'START', nudge: 0 },
  {
    id: 'upload', icon: 'upload', nudge: -30, side: 'left', mascotSide: 'right', mascot: 'writing',
    eyebrow: 'BRING ANYTHING',
    title: 'Upload your material',
    body: ['Drop a PDF, slides, notes, or images — or paste a YouTube link. Mage works straight from your own material.'],
    bullets: ['PDFs, slides & images', 'Paste notes or a video link', 'No messy reformatting'],
  },
  {
    id: 'path', icon: 'account_tree', nudge: 30, side: 'right', mascotSide: 'left', mascot: 'grad',
    active: true,
    eyebrow: 'THE AHA MOMENT',
    title: <>Get your <span className="pl-g-deepgold">learning path</span></>,
    body: ['Mage turns your material into a multi-phase path — theory, quizzes, and checkpoints, all grounded in your sources.'],
    bullets: ['Phased units & sections', 'Source-cited lessons', 'Built around your goal'],
  },
  {
    id: 'study', icon: 'auto_awesome', nudge: -30, side: 'left', mascotSide: 'right', mascot: 'plain',
    eyebrow: 'GUIDED SESSIONS',
    title: 'Study with Mage',
    body: ['Short, focused sessions: read a little, then Mage checks your understanding and explains every answer.'],
    bullets: ['Bite-size lessons', 'Source-grounded answers', 'Ask Mage anything'],
  },
  {
    id: 'practise', icon: 'fitness_center', nudge: 30, side: 'right', mascotSide: 'left', mascot: 'cards',
    eyebrow: 'WEAK-POINT TRAINING',
    title: 'Practise what you miss',
    body: ['Mage spots your weak points and brings them back at the right time — so you fix what actually trips you up.'],
    bullets: ['Automatic weak-point tracking', 'A smart review queue', 'Flashcards & quizzes'],
  },
  {
    id: 'consistent', icon: 'local_fire_department', nudge: -30, side: 'left', mascotSide: 'right', mascot: 'sparkle',
    eyebrow: 'STAY CONSISTENT',
    title: 'Stay on track until exam day',
    body: ['Daily goals, streaks, and an exam countdown keep you moving — right up to the day it counts.'],
    bullets: ['Daily goals & streaks', 'Exam countdown', 'Gentle reminders'],
  },
  { id: 'finish', kind: 'finish', icon: 'emoji_events', bubble: 'Finish', nudge: 0 },
];

/* vertical span of the connector BETWEEN node i and node i+1 (Figma node spacing ≈ 400px) */
const SEG_H = [400, 400, 400, 400, 400, 380];

/* the file-type pills under the hero card */
const CHIPS = ['YouTube', 'PDF', 'Slides', 'Notes', 'Images'];

/* nav + footer chrome now live in the shared MageNav / MageFooter components */

/* the two brand sparkles (user-supplied SVGs): gold 4-point twinkle + purple 4-point.
   String forms feed the imperative "magic" burst; the component is for JSX placement. */
const SPARK_GOLD =
  '<svg viewBox="0 0 29 29" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10.6066 0L17.1889 9.81239L28.9778 10.6066L19.1654 17.1889L18.3712 28.9778L11.7889 19.1655L0 18.3712L9.81237 11.7889L10.6066 0Z" fill="#FFC83D"/></svg>';
const SPARK_PURPLE =
  '<svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 0L11.291 6.70897L18 9L11.291 11.291L9 18L6.70897 11.291L0 9L6.70897 6.70897L9 0Z" fill="#7C5CFF"/></svg>';

function Spark({ variant }: { variant: 'gold' | 'purple' }) {
  return variant === 'gold' ? (
    <svg viewBox="0 0 29 29" fill="none" aria-hidden focusable="false">
      <path d="M10.6066 0L17.1889 9.81239L28.9778 10.6066L19.1654 17.1889L18.3712 28.9778L11.7889 19.1655L0 18.3712L9.81237 11.7889L10.6066 0Z" fill="#FFC83D" />
    </svg>
  ) : (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden focusable="false">
      <path d="M9 0L11.291 6.70897L18 9L11.291 11.291L9 18L6.70897 11.291L0 9L6.70897 6.70897L9 0Z" fill="#7C5CFF" />
    </svg>
  );
}

function Mascot({ pose }: { pose: string }) {
  return (
    <img
      className="pl-mascot pl-floaty"
      src={`/landing/mage-${pose}.png`}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
    />
  );
}

export default function PathLanding() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [linkValue, setLinkValue] = useState('');
  const [uploadError, setUploadError] = useState('');

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
    // In the stacked (phone) layout the mascots flow in-document, so their
    // lazy-loaded images grow the track as they decode mid-scroll — pushing
    // nodes down out from under the already-built trail, which then lags behind
    // the checkpoints. (On desktop the mascots are absolutely positioned, so
    // the track never reflows and this can't happen.) Rebuild whenever the
    // track's measured height changes so the line stays pinned to the nodes.
    // The spine is position:absolute, so build() never feeds its own resize.
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        clearTimeout(rt);
        rt = setTimeout(build, 120);
      });
      ro.observe(track);
    }

    return () => {
      cancelled = true;
      if (rafId != null) cancelAnimationFrame(rafId);
      clearTimeout(rt);
      ro?.disconnect();
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

  /* "The magic" → spray sparkles down both screen edges, then scroll to START.
     The layer is fixed so the burst stays visible through the smooth-scroll. */
  const onMagicClick = () => {
    const reduce = prefersReducedMotion();
    const host = rootRef.current;
    if (host && !reduce) {
      const layer = document.createElement('div');
      layer.className = 'pl-magic-burst';
      layer.setAttribute('aria-hidden', 'true');
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const band = Math.min(vw * 0.22, 260); // side band width — keep the center clear
      const COUNT = 8;
      for (let i = 0; i < COUNT; i++) {
        const spark = document.createElement('span');
        spark.className = 'pl-magic-spark';
        spark.innerHTML = i % 2 === 0 ? SPARK_GOLD : SPARK_PURPLE;
        const onLeft = i % 2 === 0;
        const x = onLeft ? Math.random() * band : vw - Math.random() * band;
        spark.style.left = `${x.toFixed(0)}px`;
        spark.style.top = `${(Math.random() * vh).toFixed(0)}px`;
        spark.style.setProperty('--rot', `${((onLeft ? -1 : 1) * (60 + Math.random() * 170)).toFixed(0)}deg`);
        spark.style.setProperty('--sz', `${(14 + Math.random() * 18).toFixed(0)}px`);
        spark.style.setProperty('--drift', `${(-12 - Math.random() * 40).toFixed(0)}px`);
        spark.style.animationDelay = `${Math.floor(Math.random() * 300)}ms`;
        layer.appendChild(spark);
      }
      host.appendChild(layer);
      window.setTimeout(() => layer.remove(), 3400); // 3s anim + max stagger, then clean up
    }
    const startNode = host?.querySelector('.pl-node-wrap[data-cp="0"]');
    startNode?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  /* The two import affordances open their onboarding bridge — a pre-sign-up
     "here's what I detected, what's your goal?" step. The pasted link rides the
     URL so the bridge can resolve the real video; a picked file's metadata is
     stashed for the bridge to show. The real importer still lives past sign-up. */
  const goLinkBridge = (e?: { preventDefault: () => void }) => {
    e?.preventDefault();
    const url = linkValue.trim();
    router.push(url ? `/start/link?url=${encodeURIComponent(url)}` : '/start/link');
  };
  const openFilePicker = () => fileInputRef.current?.click();
  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be re-picked later
    if (!file) return;
    // Client reject (P5): the preview only reads a capped slice, so refuse a file
    // too large to stash in IndexedDB rather than choke the device on it.
    if (uploadTooLarge(file.size)) {
      setUploadError(`That file is over ${MAX_UPLOAD_LABEL}. Try a smaller PDF, slides, or notes.`);
      return;
    }
    setUploadError('');
    setPendingUpload({ name: file.name, size: file.size, mime: file.type });
    patchOnboardingDraft({ source: 'upload', sourceKind: 'upload' });
    // Keep the heavy bytes client-side (IndexedDB) — they're uploaded only after
    // auth (D2). Extract the capped text slice now so the building step can POST
    // it for the preview without re-reading the file. Both are fire-and-forget;
    // the SPA context survives the navigation below, so they finish off-thread.
    void putPendingFile(file);
    void extractCappedCorpus(file).then((corpus) => {
      if (corpus.text) void putPendingCorpus(corpus);
    });
    router.push('/start/upload');
  };

  return (
    <div className={styles.root} ref={rootRef}>
      {/* Enhancement-safety: without JS the reveal/lit classes never toggle, so
          force every reveal target visible. The CSS-only hero entrance is
          unaffected; this only defeats the JS-gated opacity:0 start states. */}
      <noscript>
        <style>{`.nm-landing .pl-reveal,.nm-landing .pl-node-wrap .pl-gutter{opacity:1!important;transform:none!important}`}</style>
      </noscript>

      {/* ─────────────  NAV  ───────────── */}
      <MageNav />

      <div className="pl-page">
        {/* ─────────────  HERO  ───────────── */}
        <div className="pl-hero">
          <div className="pl-hero-title">
            {/* decorative golden sparkles orbiting the headline (purely ornamental) */}
            <span className="pl-hspark pl-hspark--lg pl-hspark-a pl-spk-gold" aria-hidden><Spark variant="gold" /></span>
            <span className="pl-hspark pl-hspark-b pl-spk-purple" aria-hidden><Spark variant="purple" /></span>
            <span className="pl-hspark pl-hspark--sm pl-hspark-c pl-spk-purple" aria-hidden><Spark variant="purple" /></span>
            <span className="pl-hspark pl-hspark--sm pl-hspark-d pl-spk-gold" aria-hidden><Spark variant="gold" /></span>
            <span className="pl-hspark pl-hspark-e pl-spk-purple" aria-hidden><Spark variant="purple" /></span>
            <span className="pl-hspark pl-hspark--lg pl-hspark-f pl-spk-gold" aria-hidden><Spark variant="gold" /></span>
            <h1>Turn anything into a learning path.</h1>
          </div>
          <p className="pl-hero-sub">
            Paste a YouTube link or drop your PDF, slides, or notes. Mage builds your personal study path in minutes.
          </p>
        </div>

        {/* ─────────────  HERO INPUT CARD  ─────────────
            Visual only for now — link-paste isn't wired, so submitting or browsing
            routes into sign-up where the real importer lives. */}
        <section className="pl-hero-stage">
          <img className="pl-hero-mage pl-floaty" src="/landing/mage-wand.png" alt="" aria-hidden loading="lazy" decoding="async" />
          <span className="pl-paper pl-paper-1" aria-hidden />
          <span className="pl-paper pl-paper-2" aria-hidden />

          <form className="pl-hero-card" onSubmit={goLinkBridge}>
            <div className="pl-hc-top">
              <div className="pl-hc-field">
                <span className="pl-hc-field-icon" aria-hidden>
                  <span className="material-symbols-outlined filled">play_arrow</span>
                </span>
                <input
                  className="pl-hc-input"
                  type="text"
                  placeholder="Paste a YouTube link…"
                  aria-label="Paste a YouTube link"
                  value={linkValue}
                  onChange={(e) => setLinkValue(e.target.value)}
                  inputMode="url"
                  autoComplete="off"
                />
              </div>
              <button type="submit" className="pl-hc-create">Create my path</button>
            </div>

            <div className="pl-hc-or" aria-hidden>
              <span className="pl-hc-rule" />
              <span className="pl-hc-or-text">or</span>
              <span className="pl-hc-rule" />
            </div>

            <button type="button" className="pl-hc-drop" onClick={openFilePicker}>
              <span className="pl-hc-drop-icon" aria-hidden>
                <span className="material-symbols-outlined">upload</span>
              </span>
              <span className="pl-hc-drop-text">
                <strong>Drop a PDF, slides, or image</strong>
                <span>or click to browse your files</span>
              </span>
              <span className="pl-hc-browse">Browse files</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.md,.rtf,.odt,image/*"
              hidden
              onChange={onFilePicked}
            />
            {uploadError && (
              <p
                role="alert"
                style={{ marginTop: 10, color: 'var(--error)', fontSize: 13, lineHeight: 1.4 }}
              >
                {uploadError}
              </p>
            )}
          </form>

          <p className="pl-hero-note">No sign-up needed to try · See a 2-minute demo</p>

          <div className="pl-chips" aria-hidden>
            {CHIPS.map((c) => (
              <span key={c} className="pl-chip">{c}</span>
            ))}
          </div>
        </section>

        {/* ─────────────  "The magic"  ───────────── */}
        <div className="pl-magic-wrap">
          <button className="pl-magic pl-reveal" type="button" onClick={onMagicClick}>
            <span className="pl-magic-star" aria-hidden><Spark variant="gold" /></span>
            The magic
            <span className="material-symbols-outlined pl-magic-chev" aria-hidden>expand_more</span>
          </button>
        </div>

        {/* ─────────────  PATH  ───────────── */}
        <main className="pl-path" id="how-it-works">
          <h2 className="pl-sr-only">How NoteMage works</h2>
          <div className="pl-track" ref={trackRef}>
            {CP.map((cp, i) => {
              const cls =
                cp.kind === 'start' ? 'pl-start' : cp.kind === 'finish' ? 'pl-finish' : cp.active ? 'pl-active' : '';
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
                        <div className={`pl-gutter pl-${cp.mascotSide} pl-lone`}>
                          <Mascot pose={cp.mascot!} />
                          <span
                            className={`pl-mascot-spark pl-mascot-spark--${cp.mascotSide} pl-spk-${i % 2 === 0 ? 'gold' : 'purple'}`}
                            aria-hidden
                          >
                            <Spark variant={i % 2 === 0 ? 'gold' : 'purple'} />
                          </span>
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
                        </div>
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
          <div className="pl-cta-title">
            {/* decorative golden sparkles around the closing CTA (purely ornamental) */}
            <span className="pl-hspark pl-hspark--lg pl-hspark-g pl-spk-gold" aria-hidden><Spark variant="gold" /></span>
            <span className="pl-hspark pl-hspark-h pl-spk-purple" aria-hidden><Spark variant="purple" /></span>
            <span className="pl-hspark pl-hspark--sm pl-hspark-i pl-spk-purple" aria-hidden><Spark variant="purple" /></span>
            <span className="pl-hspark pl-hspark--sm pl-hspark-j pl-spk-gold" aria-hidden><Spark variant="gold" /></span>
            <span className="pl-hspark pl-hspark-k pl-spk-purple" aria-hidden><Spark variant="purple" /></span>
            <h2 className="pl-reveal">
              Try it out for <span className="pl-g-gold">FREE</span>
            </h2>
          </div>
          <div className="pl-cta-row pl-reveal" ref={ctaRef}>
            <Link className="pl-btn-gold pl-lg" href="/start/welcome">
              Start free <span aria-hidden>→</span>
            </Link>
            <Link className="pl-btn-ghost pl-lg" href="/pricing">See pricing</Link>
          </div>
        </section>

        {/* ─────────────  FOOTER  ───────────── */}
        <MageFooter />
      </div>
    </div>
  );
}
