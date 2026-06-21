'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Mage } from '@/figma/kit';
import {
  ONB,
  MktWebFrame,
  MktTopNav,
  MarketingFooterBar,
  Sparkle,
  PaperCard,
  mkt,
} from './shell';

/**
 * Landing — web (Figma 62:2, 1440×4080 cream canvas).
 * Phase 2 marketing reproduction. Hero card: input + dropzone. Trail: SVG
 * path with 5 alternating feature cards (trail images are raster in Figma;
 * we reproduce with SVG + animated stroke). Final CTA + footer.
 * Mobile reflow → Landing.mobile.tsx.
 *
 * Key Figma fidelity notes:
 *  - "FREE" text in CTA is amber (#7a5200), NOT purple
 *  - "Start free" button is gold (#ffc83d) with amber ink
 *  - START bubble = lavender #ede9ff chip; FINISH = gold circle + #fff3d6 label
 *  - Feature card #2 (AHA MOMENT) has lavender bg + purple border
 *  - Trail nodes alternate filled-purple (checkmark) ↔ white+purple-border (upload/star)
 */
export default function LandingWeb() {
  const router = useRouter();
  const [link, setLink] = useState('');
  const [trailReady, setTrailReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setTrailReady(true), 200);
    return () => clearTimeout(t);
  }, []);

  const goCreate = () => router.push('/figma/marketing/link-bridge');
  const goBrowse = () => router.push('/figma/marketing/link-bridge');

  return (
    <MktWebFrame>
      {/* ── Top nav ──────────────────────────────────────────────────────── */}
      <MktTopNav active="how" />

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section
        style={{
          position: 'relative',
          maxWidth: 1440,
          marginInline: 'auto',
          padding: '56px 64px 0',
          textAlign: 'center',
        }}
      >
        {/* Decorative sparkles — exact Figma positions (scaled from 1440 canvas) */}
        <Sparkle size={30} color={ONB.gold} rotate={-15} style={{ position: 'absolute', left: 296, top: 4 }} />
        <Sparkle size={18} color={ONB.primary} style={{ position: 'absolute', left: 236, top: 112 }} />
        <Sparkle size={22} color={ONB.gold} rotate={-20} style={{ position: 'absolute', right: 296, top: 4 }} />
        <Sparkle size={15} color={ONB.primary} style={{ position: 'absolute', right: 266, top: 112 }} />
        <Sparkle size={26} color={ONB.gold} rotate={-10} style={{ position: 'absolute', left: 456, top: -22 }} />
        <Sparkle size={15} color={ONB.primary} style={{ position: 'absolute', right: 436, top: -20 }} />

        {/* Floating paper cards — left gutter beside the hero card (Figma 64:16/64:21 ≈ y420/600) */}
        <div
          className={mkt.bob}
          style={{ position: 'absolute', left: 36, top: 300 }}
        >
          <PaperCard scale={1.6} rotate={12} />
        </div>
        <div
          className={mkt.bob}
          style={{ position: 'absolute', left: 92, top: 470 }}
        >
          <PaperCard scale={1.6} rotate={-10} />
        </div>

        {/* Lavender rounded square — right gutter beside the hero card (Figma 64:26: x1100/y400) */}
        <div
          style={{
            position: 'absolute',
            right: 52,
            top: 300,
            width: 220,
            height: 220,
            borderRadius: 40,
            background: ONB.lavender,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          className={mkt.bob}
        >
          <Sparkle size={20} color={ONB.gold} rotate={-12} style={{ position: 'absolute', top: 12, right: 14 }} />
          <Sparkle size={14} color={ONB.primary} style={{ position: 'absolute', bottom: 12, left: 16 }} />
          <Mage pose="wand" size={160} alt="Mage casting a spell" />
        </div>

        {/* Hero headline */}
        <h1
          style={{
            margin: '0 auto',
            maxWidth: 1000,
            color: ONB.ink,
            fontFamily: ONB.font,
            fontWeight: 700,
            fontSize: 56,
            lineHeight: 1.06,
            letterSpacing: '-1.4px',
            textAlign: 'center',
          }}
        >
          Turn anything into a learning path.
        </h1>

        {/* Hero subtitle */}
        <p
          style={{
            margin: '22px auto 0',
            maxWidth: 680,
            color: ONB.muted,
            fontFamily: ONB.font,
            fontSize: 19,
            lineHeight: 1.48,
            textAlign: 'center',
          }}
        >
          Paste a YouTube link or drop your PDF, slides, or notes. Mage builds your personal study path in minutes.
        </p>

        {/* Hero card — exact Figma 64:29: w=760, h=292, left=340 in 1440 frame */}
        <HeroCard link={link} setLink={setLink} onCreate={goCreate} onBrowse={goBrowse} />

        {/* Helper text (Figma: 64:49) */}
        <p
          style={{
            margin: '18px 0 0',
            color: '#a1a7b3',
            fontFamily: ONB.font,
            fontSize: 14.5,
            fontWeight: 500,
            textAlign: 'center',
          }}
        >
          No sign-up needed to try &nbsp;·&nbsp;{' '}
          <span
            style={{ color: ONB.primary, fontWeight: 600, cursor: 'pointer' }}
          >
            See a 2-minute demo
          </span>
        </p>

        {/* Source chips (Figma: 64:51–59 row, top:712 in frame) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 9,
            marginTop: 20,
            flexWrap: 'wrap',
          }}
        >
          {['YouTube', 'PDF', 'Slides', 'Notes', 'Images'].map((chip) => (
            <span
              key={chip}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 34,
                padding: '0 12px',
                borderRadius: 17,
                border: `1.2px solid ${ONB.line}`,
                background: ONB.white,
                color: ONB.muted,
                fontFamily: ONB.font,
                fontSize: 13.5,
                fontWeight: 600,
              }}
            >
              {chip}
            </span>
          ))}
        </div>

        {/* "The magic" scroll hint pill (Figma 79:2, top:824 in frame → below chips) */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 40,
            height: 52,
            padding: '0 20px',
            borderRadius: 26,
            border: `1.2px solid ${ONB.line}`,
            background: ONB.white,
            boxShadow: '0px 6px 8px rgba(58,46,102,0.08)',
            color: ONB.ink,
            fontFamily: ONB.font,
            fontSize: 16,
            fontWeight: 600,
          }}
        >
          <Sparkle size={14} color={ONB.gold} />
          The magic
          <span style={{ color: ONB.muted, fontSize: 18, fontWeight: 700 }}>⌄</span>
        </div>
      </section>

      {/* ── TRAIL + FEATURE CARDS ─────────────────────────────────────────── */}
      <TrailSection trailReady={trailReady} />

      {/* ── FINAL CTA (Figma 66:*) ───────────────────────────────────────── */}
      <section
        style={{
          position: 'relative',
          textAlign: 'center',
          padding: '108px 64px 100px',
          maxWidth: 1440,
          marginInline: 'auto',
        }}
      >
        {/* Sparkles around CTA (Figma 66:2–5) */}
        <Sparkle size={30} color={ONB.gold} rotate={-15} style={{ position: 'absolute', left: '32%', top: 60 }} />
        <Sparkle size={18} color={ONB.primary} style={{ position: 'absolute', left: '28%', top: 128 }} />
        <Sparkle size={22} color={ONB.gold} rotate={-20} style={{ position: 'absolute', right: '30%', top: 60 }} />
        <Sparkle size={15} color={ONB.primary} style={{ position: 'absolute', right: '26%', top: 133 }} />

        {/* "Try it out for FREE" — "FREE" is amber #7a5200, not purple */}
        <h2
          style={{
            margin: 0,
            color: ONB.ink,
            fontFamily: ONB.font,
            fontWeight: 700,
            fontSize: 44,
            letterSpacing: '-0.88px',
            lineHeight: 1.3,
          }}
        >
          Try it out for{' '}
          <span style={{ color: '#7a5200' }}>FREE</span>
        </h2>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            marginTop: 40,
          }}
        >
          {/* "Start free" — GOLD button (Figma 66:8: bg #ffc83d, text #7a5200) */}
          <button
            type="button"
            onClick={goCreate}
            className={mkt.tapPill}
            style={{
              height: 60,
              width: 175,
              borderRadius: 16,
              border: 'none',
              background: ONB.gold,
              color: '#7a5200',
              fontFamily: ONB.font,
              fontSize: 17,
              fontWeight: 600,
              boxShadow: '0px 12px 28px 0px rgba(255,200,61,0.34)',
              cursor: 'pointer',
            }}
          >
            Start free  →
          </button>
          {/* "See pricing" — ghost, beige border, ink text (Figma 66:10) */}
          <button
            type="button"
            onClick={() => router.push('/figma/marketing/pricing')}
            className={mkt.tapPill}
            style={{
              height: 60,
              width: 165,
              borderRadius: 16,
              border: `1.6px solid ${ONB.paperLine}`,
              background: 'transparent',
              color: ONB.ink,
              fontFamily: ONB.font,
              fontSize: 17,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            See pricing
          </button>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <MarketingFooterBar />
    </MktWebFrame>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Hero Card (Figma 64:29) — 760×292, white, radius 28, layered shadow
 * ──────────────────────────────────────────────────────────────────────── */

function HeroCard({
  link,
  setLink,
  onCreate,
  onBrowse,
}: {
  link: string;
  setLink: (v: string) => void;
  onCreate: () => void;
  onBrowse: () => void;
}) {
  return (
    <div
      style={{
        position: 'relative',
        width: 760,
        height: 292,
        borderRadius: 28,
        border: `1.4px solid ${ONB.line}`,
        background: ONB.white,
        boxShadow: '0px 4px 14px 0px rgba(26,19,48,0.06), 0px 18px 48px 0px rgba(124,92,255,0.16)',
        marginInline: 'auto',
        marginTop: 56,
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* Input field (Figma 64:30: left=34.6, top=34.6, w=484, h=60, radius=15) */}
      <div
        style={{
          position: 'absolute',
          left: 34,
          top: 34,
          width: 484,
          height: 60,
          borderRadius: 15,
          border: `1.2px solid ${ONB.line}`,
          background: '#f6f2ea',
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          boxSizing: 'border-box',
        }}
      >
        <span
          className="material-symbols-outlined filled"
          style={{ fontSize: 20, color: ONB.primaryInk, flexShrink: 0, marginLeft: 10, marginRight: 4 }}
        >
          play_circle
        </span>
        <input
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="Paste a YouTube link…"
          style={{
            flex: 1,
            border: 'none',
            background: 'transparent',
            color: '#a1a7b3',
            fontFamily: ONB.font,
            fontSize: 16,
            fontWeight: 500,
            outline: 'none',
            paddingLeft: 4,
          }}
        />
      </div>

      {/* "Create my path" button (Figma 64:35: left=532.6, top=34.6, w=190, h=60) */}
      <button
        type="button"
        onClick={onCreate}
        className={mkt.tapPill}
        style={{
          position: 'absolute',
          left: 532,
          top: 34,
          width: 190,
          height: 60,
          borderRadius: 15,
          border: 'none',
          background: ONB.primary,
          color: ONB.white,
          fontFamily: ONB.font,
          fontSize: 16.5,
          fontWeight: 600,
          boxShadow: '0px 12px 28px 0px rgba(124,92,255,0.34)',
          cursor: 'pointer',
        }}
      >
        Create my path
      </button>

      {/* "or" divider (Figma 64:36–38: two lines + centered "or" text) */}
      <div
        style={{
          position: 'absolute',
          left: 34,
          top: 125,
          width: 319,
          height: 1.4,
          background: ONB.paperLine,
        }}
      />
      <span
        style={{
          position: 'absolute',
          left: 371,
          top: 117,
          color: '#a1a7b3',
          fontFamily: ONB.font,
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        or
      </span>
      <div
        style={{
          position: 'absolute',
          left: 403,
          top: 125,
          width: 319,
          height: 1.4,
          background: ONB.paperLine,
        }}
      />

      {/* Dropzone (Figma 64:39: left=34.6, top=158.6, w=688, h=96, dashed) */}
      <div
        style={{
          position: 'absolute',
          left: 34,
          top: 158,
          width: 688,
          height: 96,
          borderRadius: 18,
          border: `1.8px dashed ${ONB.paperLine}`,
          background: '#fbf9f4',
          boxSizing: 'border-box',
        }}
      />

      {/* Upload icon (Figma 64:40: left=58.6, top=192.6, w=26, h=26) */}
      <span
        className="material-symbols-outlined"
        style={{
          position: 'absolute',
          left: 58,
          top: 190,
          fontSize: 26,
          color: ONB.primaryInk,
        }}
      >
        upload_file
      </span>

      {/* "Drop a PDF..." text (Figma 64:45: left=96.6, top=182.6) */}
      <p
        style={{
          position: 'absolute',
          left: 96,
          top: 183,
          margin: 0,
          color: ONB.ink,
          fontFamily: ONB.font,
          fontSize: 16,
          fontWeight: 600,
          lineHeight: 1.3,
          whiteSpace: 'nowrap',
        }}
      >
        Drop a PDF, slides, or image
      </p>

      {/* "or click to browse..." (Figma 64:46: left=96.6, top=208.6) */}
      <p
        style={{
          position: 'absolute',
          left: 96,
          top: 208,
          margin: 0,
          color: ONB.muted,
          fontFamily: ONB.font,
          fontSize: 13.5,
          fontWeight: 500,
          lineHeight: 1.3,
          whiteSpace: 'nowrap',
        }}
      >
        or click to browse your files
      </p>

      {/* "Browse files" button (Figma 64:48: left=548.6, top=183.6, w=150, h=46) */}
      <button
        type="button"
        onClick={onBrowse}
        className={mkt.tapPill}
        style={{
          position: 'absolute',
          left: 548,
          top: 183,
          width: 150,
          height: 46,
          borderRadius: 15,
          border: `1.6px solid ${ONB.paperLine}`,
          background: 'transparent',
          color: ONB.primary,
          fontFamily: ONB.font,
          fontSize: 16.5,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Browse files
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Trail Section — SVG path + 5 feature cards alternating L/R
 *
 * Figma uses raster trail images (79:6 / 79:8). We reproduce with an SVG
 * cubic bezier path + animated stroke-dashoffset. Node positions from Figma
 * absolute coords (nodes sit at CX=720 in 1440; card tops from Figma).
 * ──────────────────────────────────────────────────────────────────────── */

// Each trail node: { y: Figma absolute y, style: 'filled' | 'ring', icon: material symbol name }
const TRAIL_NODES = [
  { y: 962,  style: 'start'  as const },
  { y: 1038, style: 'filled' as const, icon: 'check' },
  { y: 1438, style: 'ring'   as const, icon: 'upload' },
  { y: 1838, style: 'filled' as const, icon: 'check' },
  { y: 2238, style: 'ring'   as const, icon: 'star' },
  { y: 2638, style: 'ring'   as const, icon: 'star' },
  { y: 3038, style: 'ring'   as const, icon: 'star' },
  { y: 3342, style: 'finish' as const },
];

// Feature card data (Figma absolute y for card top).
// titleParts: array of {text, amber?} — amber=true renders #7a5200 like "learning path"/"Mage" in Figma
const FEATURE_CARDS = [
  {
    side: 'left'  as const,
    cardY: 1248,
    tileX: 1030,
    eyebrow: 'BRING ANYTHING',
    titleParts: [{ text: 'Upload your material' }],
    body: 'Drop a PDF, slides, notes, or images — or paste a YouTube link. Mage works straight from your own material.',
    bullets: ['PDFs, slides & images', 'Paste notes or a video link', 'No messy reformatting'],
    pose: 'default' as const,
    highlight: false,
  },
  {
    side: 'right' as const,
    cardY: 1648,
    tileX: 210,
    eyebrow: 'THE AHA MOMENT',
    titleParts: [{ text: 'Get your ' }, { text: 'learning path', amber: true }],
    body: 'Mage turns your material into a multi-phase path — theory, quizzes, and checkpoints, all grounded in your sources.',
    bullets: ['Phased units & sections', 'Source-cited lessons', 'Built around your goal'],
    pose: 'thinking' as const,
    highlight: true, // lavender bg + purple border (Figma 79:42)
  },
  {
    side: 'left'  as const,
    cardY: 2048,
    tileX: 1030,
    eyebrow: 'GUIDED SESSIONS',
    titleParts: [{ text: 'Study with ' }, { text: 'Mage', amber: true }],
    body: 'Short, focused sessions: read a little, then Mage checks your understanding and explains every answer.',
    bullets: ['Bite-size lessons', 'Source-grounded answers', 'Ask Mage anything'],
    pose: 'flashcards' as const,
    highlight: false,
  },
  {
    side: 'right' as const,
    cardY: 2448,
    tileX: 210,
    eyebrow: 'WEAK-POINT TRAINING',
    titleParts: [{ text: 'Practise what you miss' }],
    body: 'Mage spots your weak points and brings them back at the right time — so you fix what actually trips you up.',
    bullets: ['Automatic weak-point tracking', 'A smart review queue', 'Flashcards & quizzes'],
    pose: 'wink' as const,
    highlight: false,
  },
  {
    side: 'left'  as const,
    cardY: 2859,
    tileX: 1030,
    eyebrow: 'STAY CONSISTENT',
    titleParts: [{ text: 'Stay on track until exam day' }],
    body: 'Daily goals, streaks, and an exam countdown keep you moving — right up to the day it counts.',
    bullets: ['Daily goals & streaks', 'Exam countdown', 'Gentle reminders'],
    pose: 'graduation' as const,
    highlight: false,
  },
] as const;

function TrailSection({ trailReady }: { trailReady: boolean }) {
  // Trail canvas in the 1440 frame: from y=922 (START) to y=3342 (FINISH)
  // We render this as a fixed 1440-wide SVG (absolute inside a relative container)
  const SVG_W = 1440;
  const TRAIL_START_Y = 922;
  const TRAIL_END_Y   = 3342;
  const TRAIL_H       = TRAIL_END_Y - TRAIL_START_Y;
  const CX = 720;

  // Node y values relative to start
  const nodeYRel = [0, 116, 516, 916, 1316, 1716, 2116, TRAIL_H];

  // Build winding cubic bezier path through all nodes
  const buildPath = () => {
    const pts = nodeYRel.map((y, i) => ({
      x: CX,
      y,
      swing: i % 2 === 0 ? -80 : 80,
    }));
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const midY = (prev.y + curr.y) / 2;
      const sw = prev.swing;
      d += ` C ${prev.x + sw} ${midY}, ${curr.x - sw} ${midY}, ${curr.x} ${curr.y}`;
    }
    return d;
  };

  const pathD = buildPath();
  const approxLen = 2700;

  // Container height = from hero bottom (relative to section start) to finish
  const CONTAINER_H = TRAIL_H + 200;
  const TOP_OFFSET  = 80; // gap below scroll-hint pill

  return (
    <div
      style={{
        position: 'relative',
        maxWidth: 1440,
        marginInline: 'auto',
        height: CONTAINER_H + TOP_OFFSET,
        overflow: 'visible',
      }}
    >
      {/* START label (Figma 79:15: left=685, top=922 → top relative to section) */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: TOP_OFFSET,
          transform: 'translateX(-50%)',
          zIndex: 4,
          display: 'inline-flex',
          alignItems: 'center',
          height: 30,
          padding: '0 12px',
          borderRadius: 15,
          background: ONB.lavender,
          color: ONB.primaryInk,
          fontFamily: ONB.font,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.52px',
        }}
      >
        START
      </div>

      {/* SVG trail */}
      <svg
        viewBox={`0 0 ${SVG_W} ${TRAIL_H}`}
        width={SVG_W}
        height={TRAIL_H}
        style={{
          position: 'absolute',
          left: 0,
          top: TOP_OFFSET + 40,
          overflow: 'visible',
          pointerEvents: 'none',
        }}
        aria-hidden
      >
        {/* base dim track */}
        <path
          d={pathD}
          fill="none"
          stroke={ONB.lavender2}
          strokeWidth={6}
          strokeLinecap="round"
        />
        {/* animated lit segment */}
        <path
          d={pathD}
          fill="none"
          stroke={ONB.primary}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={approxLen}
          strokeDashoffset={trailReady ? 0 : approxLen}
          style={{
            transition: `stroke-dashoffset 2s cubic-bezier(0.22,1,0.36,1)`,
          }}
        />

        {/* Trail nodes 1–6 (skip 0=start, 7=finish — drawn separately) */}
        {nodeYRel.slice(1, -1).map((relY, idx) => {
          const node = TRAIL_NODES[idx + 1];
          const isFilled = node?.style === 'filled';
          return (
            <g key={idx} transform={`translate(${CX}, ${relY})`}>
              {isFilled ? (
                <>
                  {/* Filled purple node (Figma: bg #7c5cff, drop-shadow, radius=38) */}
                  <circle r={38} fill={ONB.primary} filter="url(#nodeShadow)" />
                  <text
                    x={0}
                    y={6}
                    textAnchor="middle"
                    fontFamily="'Material Symbols Outlined'"
                    fontSize={22}
                    fill={ONB.white}
                    style={{ userSelect: 'none' }}
                  >
                    check
                  </text>
                </>
              ) : (
                <>
                  {/* Ring node (Figma: white bg, 3px #7c5cff border, radius=38) */}
                  <circle r={38} fill={ONB.white} stroke={ONB.primary} strokeWidth={3} />
                  <text
                    x={0}
                    y={6}
                    textAnchor="middle"
                    fontFamily="'Material Symbols Outlined'"
                    fontSize={20}
                    fill={ONB.primary}
                    style={{ userSelect: 'none' }}
                  >
                    {node?.icon === 'upload' ? 'upload_file' : 'star'}
                  </text>
                </>
              )}
            </g>
          );
        })}

        <defs>
          <filter id="nodeShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx={0} dy={8} stdDeviation={5.5} floodColor="rgba(124,92,255,0.5)" />
          </filter>
        </defs>
      </svg>

      {/* FINISH label + gold circle (Figma 79:103 + 79:111) */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: TOP_OFFSET + 40 + TRAIL_H - 38,
          transform: 'translateX(-50%)',
          zIndex: 4,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <div
          style={{
            width: 76,
            height: 76,
            borderRadius: 38,
            background: ONB.gold,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 11px rgba(255,200,61,0.5)',
          }}
        >
          <span className="material-symbols-outlined filled" style={{ fontSize: 28, color: '#7a5200' }}>
            star
          </span>
        </div>
        <div
          style={{
            height: 30,
            padding: '0 12px',
            borderRadius: 15,
            background: '#fff3d6',
            display: 'inline-flex',
            alignItems: 'center',
            color: '#7a5200',
            fontFamily: ONB.font,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.52px',
          }}
        >
          Finish
        </div>
      </div>

      {/* Feature cards + lavender illustration tiles */}
      {FEATURE_CARDS.map((card, i) => {
        const isLeft = card.side === 'left';
        // cardY is Figma absolute y in frame; our section starts at y=922 offset by TOP_OFFSET+40
        const cardTopInSection = card.cardY - TRAIL_START_Y + TOP_OFFSET + 40;
        const tileTopInSection = cardTopInSection + 20;

        return (
          <div key={i}>
            {/* Feature card (left or right of center) */}
            <div
              style={{
                position: 'absolute',
                top: cardTopInSection,
                left: isLeft ? 130 : 'auto',
                right: !isLeft ? 64 : 'auto',
                width: 440,
                zIndex: 3,
              }}
            >
              <FeatureCard card={card} />
            </div>

            {/* Lavender illustration tile (opposite side) */}
            <div
              style={{
                position: 'absolute',
                top: tileTopInSection,
                left: isLeft ? 1030 : 'auto',
                right: !isLeft ? (1440 - card.tileX - 210) : 'auto',
                width: 210,
                height: 210,
                borderRadius: 32,
                background: ONB.lavender,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2,
              }}
              className={mkt.bob}
            >
              <Sparkle size={16} color={ONB.gold} rotate={-12} style={{ position: 'absolute', top: 10, right: 12 }} />
              <Mage pose={card.pose} size={155} alt={card.eyebrow} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Single feature card — white or lavender-highlight variant */
function FeatureCard({
  card,
}: {
  card: (typeof FEATURE_CARDS)[number];
}) {
  const isHighlight = card.highlight;
  return (
    <div
      style={{
        background: isHighlight ? ONB.lavender : ONB.white,
        borderRadius: 22,
        border: isHighlight
          ? `2px solid ${ONB.primary}`
          : `1.4px solid ${ONB.line}`,
        boxShadow: isHighlight
          ? '0px 12px 32px 0px rgba(124,92,255,0.18)'
          : '0px 8px 24px 0px rgba(58,46,102,0.07)',
        padding: '26px 26px 28px',
      }}
    >
      {/* Eyebrow */}
      <p
        style={{
          margin: 0,
          color: ONB.primaryInk,
          fontFamily: ONB.font,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '1.04px',
          lineHeight: 1.3,
          whiteSpace: 'nowrap',
        }}
      >
        {card.eyebrow}
      </p>
      {/* Title — may contain amber-colored segments (e.g. "learning path", "Mage") */}
      <p
        style={{
          margin: '8px 0 0',
          color: ONB.ink,
          fontFamily: ONB.font,
          fontSize: 24,
          fontWeight: 700,
          lineHeight: 1.16,
          maxWidth: 384,
        }}
      >
        {(card.titleParts as ReadonlyArray<{ text: string; amber?: boolean }>).map((part, pi) => (
          <span key={pi} style={part.amber ? { color: '#7a5200' } : undefined}>
            {part.text}
          </span>
        ))}
      </p>
      {/* Body */}
      <p
        style={{
          margin: '10px 0 0',
          color: ONB.muted,
          fontFamily: ONB.font,
          fontSize: 15,
          fontWeight: 400,
          lineHeight: 1.5,
          maxWidth: 384,
        }}
      >
        {card.body}
      </p>
      {/* Bullets */}
      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {card.bullets.map((bullet, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span
              style={{
                color: ONB.gold,
                fontFamily: ONB.font,
                fontSize: 13,
                fontWeight: 700,
                lineHeight: 1.3,
                flexShrink: 0,
                marginTop: 1,
              }}
            >
              ✦
            </span>
            <span
              style={{
                color: ONB.ink,
                fontFamily: ONB.font,
                fontSize: 14.5,
                fontWeight: 500,
                lineHeight: 1.3,
              }}
            >
              {bullet}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
