'use client';

/**
 * _bridge.tsx — shared layout for the Link Bridge (B1, node 62:4) and
 * Upload Bridge (B2, node 62:6) screens.
 *
 * ~90 % of the two screens is identical; only the detected-content card,
 * chat-bubble copy, default goal chip, and ghost-button label differ.
 * This module exports `BridgeWeb` and `BridgeMobile` that accept those
 * per-screen differences as props.  The four thin wrappers in this folder
 * (LinkBridge.web/mobile + UploadBridge.web/mobile) default-export a
 * zero-prop component that forwards the right props here.
 *
 * Figma parity: 1440×1024 cream canvas. See screenshots 62:4 / 62:6.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mage } from '@/figma/kit';
import {
  ONB,
  OnbMobileFrame,
  Sparkle,
  MKTC,
  MktWebFrame,
  MktLogoBar,
  mkt,
} from './shell';

/* ─── Shared types ────────────────────────────────────────────────────────── */

export type BridgeKind = 'video' | 'file';

export interface BridgeProps {
  kind: BridgeKind;
  /** Small chat-bubble line from the Mage avatar. */
  bubbleLine: string;
  /** Default selected goal chip. */
  defaultGoal: GoalId;
  /** Label for the ghost (secondary) CTA button. */
  ghostLabel: string;
}

/* ─── Goal + session chip data ───────────────────────────────────────────── */

type GoalId = 'Exam' | 'Test prep' | 'Understand' | 'Memorize' | 'Weak points' | 'Homework';
type LengthId = '5 min' | '10 min' | '15 min' | '30 min';

const GOALS: GoalId[] = ['Exam', 'Test prep', 'Understand', 'Memorize', 'Weak points', 'Homework'];
const LENGTHS: LengthId[] = ['5 min', '10 min', '15 min', '30 min'];

const GOAL_WORD: Record<GoalId, string> = {
  'Exam': 'exam-focused',
  'Test prep': 'test-prep',
  'Understand': 'deeper-understanding',
  'Memorize': 'memorization',
  'Weak points': 'weak-point',
  'Homework': 'homework',
};

function bannerText(goal: GoalId, length: LengthId, kind: BridgeKind) {
  const src = kind === 'video' ? 'from this video' : 'from your PDF';
  const word = GOAL_WORD[goal];
  const article = /^[aeiou]/i.test(word) ? 'an' : 'a';
  const dur = length.replace(' min', '-minute'); // Figma: "15-minute sessions"
  return `Mage will build ${article} ${word} path in ${dur} sessions ${src}.`;
}

/* ─── Chip components ────────────────────────────────────────────────────── */

function GoalChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={mkt.tapPill}
      style={{
        height: 40,
        padding: '0 18px',
        borderRadius: 999,
        border: selected ? `1.6px solid ${ONB.primary}` : `1.4px solid ${ONB.line}`,
        background: selected ? ONB.lavender : ONB.white,
        color: selected ? ONB.primaryInk : ONB.ink,
        fontFamily: ONB.font,
        fontSize: 15,
        fontWeight: selected ? 600 : 500,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

function LengthChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={mkt.tapPill}
      style={{
        height: 40,
        padding: '0 20px',
        borderRadius: 999,
        border: selected ? `1.6px solid ${ONB.primary}` : `1.4px solid ${ONB.line}`,
        background: selected ? ONB.lavender : ONB.white,
        color: selected ? ONB.primaryInk : ONB.ink,
        fontFamily: ONB.font,
        fontSize: 15,
        fontWeight: selected ? 600 : 500,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

/* ─── Detected-content card — video variant ──────────────────────────────── */

function VideoCard() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
      {/* Thumbnail — navy with play button */}
      <div
        style={{
          position: 'relative',
          width: 210,
          height: 118,
          borderRadius: 12,
          background: MKTC.videoBg,
          flexShrink: 0,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Faint sparkles in thumbnail */}
        <Sparkle size={18} color="rgba(255,255,255,0.18)" style={{ position: 'absolute', left: 20, top: 18 }} />
        <Sparkle size={12} color="rgba(255,255,255,0.12)" style={{ position: 'absolute', right: 22, bottom: 20 }} />

        {/* Play circle */}
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            background: 'rgba(255,255,255,0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 22, color: MKTC.videoBg, marginLeft: 3 }}
          >
            play_arrow
          </span>
        </div>

        {/* Duration chip — bottom right */}
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            background: 'rgba(0,0,0,0.72)',
            borderRadius: 6,
            padding: '3px 7px',
            fontFamily: ONB.font,
            fontWeight: 600,
            fontSize: 12,
            color: '#fff',
            letterSpacing: '0.2px',
          }}
        >
          12:30
        </div>
      </div>

      {/* Text content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Green "Detected" chip */}
        <span
          style={{
            display: 'inline-block',
            background: ONB.greenSoft,
            color: ONB.green,
            borderRadius: 999,
            padding: '4px 12px',
            fontFamily: ONB.font,
            fontWeight: 600,
            fontSize: 12.5,
            marginBottom: 10,
          }}
        >
          Detected from your link
        </span>

        <h2
          style={{
            margin: 0,
            fontFamily: ONB.font,
            fontWeight: 700,
            fontSize: 22,
            color: ONB.ink,
            lineHeight: 1.25,
          }}
        >
          Databases for Beginners: SQL Basics
        </h2>

        <p
          style={{
            margin: '6px 0 0',
            fontFamily: ONB.font,
            fontSize: 14.5,
            color: ONB.muted,
            lineHeight: 1.4,
          }}
        >
          freeCodeCamp · 12:30 · YouTube
        </p>

        <p
          style={{
            margin: '8px 0 0',
            fontFamily: ONB.font,
            fontSize: 13.5,
            color: ONB.muted2,
            lineHeight: 1.4,
          }}
        >
          Mage will use the transcript and key moments to build your path.
        </p>
      </div>
    </div>
  );
}

/* ─── Detected-content card — file variant ───────────────────────────────── */

function FileCard() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
      {/* PDF icon tile */}
      <div
        style={{
          position: 'relative',
          width: 96,
          height: 96,
          borderRadius: 16,
          background: ONB.lavender,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Document glyph */}
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 42, color: ONB.primaryInk, opacity: 0.75 }}
        >
          description
        </span>

        {/* Red "PDF" tag bottom-left */}
        <div
          style={{
            position: 'absolute',
            bottom: 6,
            left: 6,
            background: ONB.red,
            borderRadius: 5,
            padding: '2px 6px',
            fontFamily: ONB.font,
            fontWeight: 700,
            fontSize: 10,
            color: '#fff',
            letterSpacing: '0.4px',
          }}
        >
          PDF
        </div>
      </div>

      {/* Text content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Green "Detected" chip */}
        <span
          style={{
            display: 'inline-block',
            background: ONB.greenSoft,
            color: ONB.green,
            borderRadius: 999,
            padding: '4px 12px',
            fontFamily: ONB.font,
            fontWeight: 600,
            fontSize: 12.5,
            marginBottom: 10,
          }}
        >
          Detected from your upload
        </span>

        <h2
          style={{
            margin: 0,
            fontFamily: ONB.font,
            fontWeight: 700,
            fontSize: 22,
            color: ONB.ink,
            lineHeight: 1.25,
          }}
        >
          biology_notes.pdf
        </h2>

        <p
          style={{
            margin: '6px 0 0',
            fontFamily: ONB.font,
            fontSize: 14.5,
            color: ONB.muted,
            lineHeight: 1.4,
          }}
        >
          24 pages · 3.2 MB · PDF
        </p>

        <p
          style={{
            margin: '8px 0 0',
            fontFamily: ONB.font,
            fontSize: 13.5,
            color: ONB.muted2,
            lineHeight: 1.4,
          }}
        >
          Mage will read all 24 pages to pull out the key ideas.
        </p>
      </div>
    </div>
  );
}

/* ─── Mage chat bubble row ───────────────────────────────────────────────── */

function ChatBubbleRow({
  line,
  isMobile,
}: {
  line: string;
  isMobile?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: isMobile ? 10 : 12,
        position: 'relative',
      }}
    >
      {/* Left ornament sparkle */}
      <Sparkle
        size={14}
        color={ONB.primary}
        style={{ position: 'absolute', left: isMobile ? -28 : -48, top: -4 }}
      />

      {/* Avatar — Mage in a lavender circle */}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          background: ONB.lavender,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        <Mage pose="default" size={44} alt="Mage" />
      </div>

      {/* Bubble */}
      <div
        style={{
          background: ONB.white,
          border: `1px solid ${ONB.line}`,
          borderRadius: 24,
          padding: '12px 20px',
          fontFamily: ONB.font,
          fontWeight: 500,
          fontSize: isMobile ? 14 : 15.5,
          color: ONB.ink,
          lineHeight: 1.4,
          boxShadow: '0 3px 10px rgba(58,46,102,0.08)',
          flexShrink: 1,
        }}
      >
        {line}
      </div>

      {/* Right gold sparkle */}
      <Sparkle
        size={22}
        color={ONB.gold}
        style={{ flexShrink: 0, marginLeft: isMobile ? 2 : 4 }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * BridgeWeb — 1440×1024 cream canvas
 * ──────────────────────────────────────────────────────────────────────── */

export function BridgeWeb({ kind, bubbleLine, defaultGoal, ghostLabel }: BridgeProps) {
  const router = useRouter();
  const [goal, setGoal] = useState<GoalId>(defaultGoal);
  const [length, setLength] = useState<LengthId>('15 min');

  return (
    <MktWebFrame style={{ minHeight: 1024 }}>
      {/* Logo bar */}
      <MktLogoBar />

      {/* Main centered column */}
      <div
        style={{
          maxWidth: 760,
          marginInline: 'auto',
          padding: '48px 0 64px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 0,
        }}
      >
        {/* ── Chat bubble ── */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 36, paddingInline: 40 }}>
          <ChatBubbleRow line={bubbleLine} />
        </div>

        {/* ── Detail card ── */}
        <div
          style={{
            background: ONB.white,
            borderRadius: 24,
            border: `1px solid ${ONB.line}`,
            boxShadow: '0px 4px 16px rgba(58,46,102,0.08), 0px 1px 4px rgba(58,46,102,0.04)',
            padding: '28px 32px',
            marginBottom: 36,
          }}
        >
          {kind === 'video' ? <VideoCard /> : <FileCard />}
        </div>

        {/* ── Goal chips ── */}
        <div style={{ marginBottom: 28 }}>
          <p
            style={{
              margin: '0 0 14px',
              fontFamily: ONB.font,
              fontWeight: 700,
              fontSize: 18,
              color: ONB.ink,
            }}
          >
            What are you preparing for?
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {GOALS.map((g) => (
              <GoalChip
                key={g}
                label={g}
                selected={goal === g}
                onClick={() => setGoal(g)}
              />
            ))}
          </div>
        </div>

        {/* ── Session length chips ── */}
        <div style={{ marginBottom: 28 }}>
          <p
            style={{
              margin: '0 0 14px',
              fontFamily: ONB.font,
              fontWeight: 700,
              fontSize: 18,
              color: ONB.ink,
            }}
          >
            Session length
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            {LENGTHS.map((l) => (
              <LengthChip
                key={l}
                label={l}
                selected={length === l}
                onClick={() => setLength(l)}
              />
            ))}
          </div>
        </div>

        {/* ── Lavender info banner ── */}
        <div
          style={{
            background: ONB.lavender,
            borderRadius: 16,
            padding: '16px 22px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 36,
          }}
        >
          <span
            style={{
              fontFamily: ONB.font,
              fontSize: 18,
              color: ONB.primaryInk,
              flexShrink: 0,
              lineHeight: 1,
            }}
          >
            ✦
          </span>
          <span
            style={{
              fontFamily: ONB.font,
              fontSize: 15,
              fontWeight: 500,
              color: ONB.primaryInk,
              lineHeight: 1.5,
            }}
          >
            {bannerText(goal, length, kind)}
          </span>
        </div>

        {/* ── CTA row ── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 16,
            marginBottom: 20,
          }}
        >
          {/* Primary — Build my path */}
          <button
            type="button"
            className={mkt.tapPill}
            onClick={() => router.push('/figma/onboarding/06-generating')}
            style={{
              height: 60,
              padding: '0 40px',
              borderRadius: 18,
              border: 'none',
              background: ONB.primary,
              color: ONB.white,
              fontFamily: ONB.font,
              fontSize: 17,
              fontWeight: 700,
              boxShadow: ONB.btnShadow,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            Build my path
            <span style={{ fontSize: 18, fontWeight: 400 }}>→</span>
          </button>

          {/* Ghost — Use a different link / Choose a different file */}
          <button
            type="button"
            className={mkt.tapPill}
            onClick={() => router.push('/figma/marketing/landing')}
            style={{
              height: 60,
              padding: '0 32px',
              borderRadius: 18,
              border: `1.6px solid ${ONB.line}`,
              background: ONB.white,
              color: ONB.primary,
              fontFamily: ONB.font,
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(58,46,102,0.07)',
            }}
          >
            {ghostLabel}
          </button>
        </div>

        {/* ── Helper text ── */}
        <p
          style={{
            margin: 0,
            textAlign: 'center',
            fontFamily: ONB.font,
            fontSize: 14,
            color: ONB.muted2,
            lineHeight: 1.5,
          }}
        >
          No account needed yet — save your progress after.
        </p>
      </div>
    </MktWebFrame>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * BridgeMobile — 393px derived single-column reflow
 * ──────────────────────────────────────────────────────────────────────── */

/** Compact video thumbnail for the mobile card */
function VideoCardMobile() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Thumbnail */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 160,
          borderRadius: 12,
          background: MKTC.videoBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <Sparkle size={16} color="rgba(255,255,255,0.16)" style={{ position: 'absolute', left: 16, top: 14 }} />
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            background: 'rgba(255,255,255,0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: MKTC.videoBg, marginLeft: 3 }}>
            play_arrow
          </span>
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            background: 'rgba(0,0,0,0.72)',
            borderRadius: 6,
            padding: '3px 7px',
            fontFamily: ONB.font,
            fontWeight: 600,
            fontSize: 11,
            color: '#fff',
          }}
        >
          12:30
        </div>
      </div>

      {/* Text */}
      <div>
        <span
          style={{
            display: 'inline-block',
            background: ONB.greenSoft,
            color: ONB.green,
            borderRadius: 999,
            padding: '4px 12px',
            fontFamily: ONB.font,
            fontWeight: 600,
            fontSize: 11.5,
            marginBottom: 8,
          }}
        >
          Detected from your link
        </span>
        <p style={{ margin: '0 0 4px', fontFamily: ONB.font, fontWeight: 700, fontSize: 17, color: ONB.ink, lineHeight: 1.25 }}>
          Databases for Beginners: SQL Basics
        </p>
        <p style={{ margin: '0 0 4px', fontFamily: ONB.font, fontSize: 13.5, color: ONB.muted }}>
          freeCodeCamp · 12:30 · YouTube
        </p>
        <p style={{ margin: 0, fontFamily: ONB.font, fontSize: 12.5, color: ONB.muted2, lineHeight: 1.4 }}>
          Mage will use the transcript and key moments to build your path.
        </p>
      </div>
    </div>
  );
}

function FileCardMobile() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Icon */}
      <div
        style={{
          position: 'relative',
          width: 72,
          height: 72,
          borderRadius: 14,
          background: ONB.lavender,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 36, color: ONB.primaryInk, opacity: 0.75 }}>
          description
        </span>
        <div
          style={{
            position: 'absolute',
            bottom: 4,
            left: 4,
            background: ONB.red,
            borderRadius: 4,
            padding: '1px 5px',
            fontFamily: ONB.font,
            fontWeight: 700,
            fontSize: 9,
            color: '#fff',
            letterSpacing: '0.3px',
          }}
        >
          PDF
        </div>
      </div>

      {/* Text */}
      <div>
        <span
          style={{
            display: 'inline-block',
            background: ONB.greenSoft,
            color: ONB.green,
            borderRadius: 999,
            padding: '4px 12px',
            fontFamily: ONB.font,
            fontWeight: 600,
            fontSize: 11.5,
            marginBottom: 8,
          }}
        >
          Detected from your upload
        </span>
        <p style={{ margin: '0 0 4px', fontFamily: ONB.font, fontWeight: 700, fontSize: 17, color: ONB.ink, lineHeight: 1.25 }}>
          biology_notes.pdf
        </p>
        <p style={{ margin: '0 0 4px', fontFamily: ONB.font, fontSize: 13.5, color: ONB.muted }}>
          24 pages · 3.2 MB · PDF
        </p>
        <p style={{ margin: 0, fontFamily: ONB.font, fontSize: 12.5, color: ONB.muted2, lineHeight: 1.4 }}>
          Mage will read all 24 pages to pull out the key ideas.
        </p>
      </div>
    </div>
  );
}

export function BridgeMobile({ kind, bubbleLine, defaultGoal, ghostLabel }: BridgeProps) {
  const router = useRouter();
  const [goal, setGoal] = useState<GoalId>(defaultGoal);
  const [length, setLength] = useState<LengthId>('15 min');

  return (
    <OnbMobileFrame>
      {/* Logo */}
      <div style={{ padding: '20px 24px 0' }}>
        <Mage pose="logo-color" size={120} alt="NoteMage" priority />
      </div>

      <div style={{ padding: '20px 24px 32px', display: 'flex', flexDirection: 'column', gap: 0 }}>
        {/* Chat bubble */}
        <div style={{ marginBottom: 24 }}>
          <ChatBubbleRow line={bubbleLine} isMobile />
        </div>

        {/* Detail card */}
        <div
          style={{
            background: ONB.white,
            borderRadius: 18,
            border: `1px solid ${ONB.line}`,
            boxShadow: '0px 3px 12px rgba(58,46,102,0.07)',
            padding: '18px 20px',
            marginBottom: 24,
          }}
        >
          {kind === 'video' ? <VideoCardMobile /> : <FileCardMobile />}
        </div>

        {/* Goal chips */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ margin: '0 0 10px', fontFamily: ONB.font, fontWeight: 700, fontSize: 15, color: ONB.ink }}>
            What are you preparing for?
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {GOALS.map((g) => (
              <GoalChip key={g} label={g} selected={goal === g} onClick={() => setGoal(g)} />
            ))}
          </div>
        </div>

        {/* Session length */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ margin: '0 0 10px', fontFamily: ONB.font, fontWeight: 700, fontSize: 15, color: ONB.ink }}>
            Session length
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {LENGTHS.map((l) => (
              <LengthChip key={l} label={l} selected={length === l} onClick={() => setLength(l)} />
            ))}
          </div>
        </div>

        {/* Banner */}
        <div
          style={{
            background: ONB.lavender,
            borderRadius: 14,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            marginBottom: 24,
          }}
        >
          <span style={{ fontFamily: ONB.font, fontSize: 15, color: ONB.primaryInk, flexShrink: 0, lineHeight: 1.4 }}>✦</span>
          <span style={{ fontFamily: ONB.font, fontSize: 13.5, fontWeight: 500, color: ONB.primaryInk, lineHeight: 1.5 }}>
            {bannerText(goal, length, kind)}
          </span>
        </div>

        {/* CTAs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          <button
            type="button"
            className={mkt.tapPill}
            onClick={() => router.push('/figma/onboarding/06-generating')}
            style={{
              height: 56,
              borderRadius: 16,
              border: 'none',
              background: ONB.primary,
              color: ONB.white,
              fontFamily: ONB.font,
              fontSize: 16,
              fontWeight: 700,
              boxShadow: ONB.btnShadow,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            Build my path <span style={{ fontSize: 16, fontWeight: 400 }}>→</span>
          </button>
          <button
            type="button"
            className={mkt.tapPill}
            onClick={() => router.push('/figma/marketing/landing')}
            style={{
              height: 52,
              borderRadius: 16,
              border: `1.6px solid ${ONB.line}`,
              background: ONB.white,
              color: ONB.primary,
              fontFamily: ONB.font,
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {ghostLabel}
          </button>
        </div>

        {/* Helper */}
        <p style={{ margin: 0, textAlign: 'center', fontFamily: ONB.font, fontSize: 13, color: ONB.muted2, lineHeight: 1.5 }}>
          No account needed yet — save your progress after.
        </p>
      </div>
    </OnbMobileFrame>
  );
}
