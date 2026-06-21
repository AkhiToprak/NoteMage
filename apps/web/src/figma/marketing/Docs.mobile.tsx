'use client';

import { useState } from 'react';
import { ONB, OnbMobileFrame, mkt } from './shell';

/**
 * Docs — mobile reflow (derived; no Figma parity required).
 * Single 393px column inside OnbMobileFrame.
 * Layout: top bar with logo text → search → main content (breadcrumb, h1, subtitle,
 * banner, sections, numbered steps, NEXT card).
 * Left sidebar + right TOC are collapsed to a compact section selector above the content.
 */

const SECTIONS = [
  { id: 'getting-started', label: 'Getting started' },
  { id: 'learning-paths', label: 'Learning paths' },
  { id: 'community-library', label: 'Community library' },
  { id: 'mage-chat', label: 'Mage Chat' },
  { id: 'flashcards', label: 'Flashcards' },
  { id: 'mind-maps', label: 'Mind maps' },
  { id: 'presentations', label: 'Presentations' },
  { id: 'plans-limits', label: 'Plans & limits' },
];

export default function DocsMobile() {
  const [search, setSearch] = useState('');
  const [activeSection, setActiveSection] = useState('learning-paths');

  return (
    <OnbMobileFrame>
      {/* ── Mobile top bar ────────────────────────────────────────────── */}
      <div
        style={{
          padding: '20px 20px 12px',
          borderBottom: `1px solid ${ONB.line}`,
          background: ONB.cream,
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: ONB.font,
            fontSize: 18,
            fontWeight: 700,
            color: ONB.ink,
            letterSpacing: '-0.2px',
          }}
        >
          Docs
        </p>
      </div>

      {/* ── Search ────────────────────────────────────────────────────── */}
      <div style={{ padding: '14px 20px 0', background: ONB.cream }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: ONB.white,
            border: `1.4px solid ${ONB.line}`,
            borderRadius: 12,
            padding: '0 14px',
            height: 44,
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 18, color: ONB.muted2, flexShrink: 0 }}
          >
            search
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search docs…"
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontFamily: ONB.font,
              fontSize: 15,
              color: ONB.ink,
            }}
          />
        </div>
      </div>

      {/* ── Section selector — horizontal scroll ─────────────────────── */}
      <div
        style={{
          padding: '14px 0 0',
          borderBottom: `1px solid ${ONB.line}`,
          background: ONB.cream,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '0 20px 14px',
            whiteSpace: 'nowrap',
          }}
        >
          {SECTIONS.map((sec) => {
            const isActive = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                className={mkt.tapPill}
                onClick={() => setActiveSection(sec.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: ONB.font,
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? ONB.primaryInk : ONB.muted,
                  background: isActive ? ONB.lavender : 'transparent',
                  borderRadius: 20,
                  padding: '6px 14px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {sec.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '28px 20px 48px',
        }}
      >
        {/* Breadcrumb */}
        <p
          style={{
            margin: '0 0 14px',
            fontFamily: ONB.font,
            fontSize: 13,
            color: ONB.muted,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <span>Docs</span>
          <span style={{ color: ONB.muted2 }}>›</span>
          <span>Learning paths</span>
        </p>

        {/* H1 */}
        <h1
          style={{
            margin: '0 0 12px',
            fontFamily: ONB.font,
            fontSize: 30,
            fontWeight: 700,
            color: ONB.ink,
            letterSpacing: '-0.4px',
            lineHeight: 1.2,
          }}
        >
          Learning paths
        </h1>

        {/* Subtitle */}
        <p
          style={{
            margin: '0 0 22px',
            fontFamily: ONB.font,
            fontSize: 16,
            color: ONB.muted,
            lineHeight: 1.6,
          }}
        >
          AI-built, Duolingo-style courses that turn your material into a guided sequence of
          lessons, drills, and checkpoints.
        </p>

        {/* Info banner */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            background: ONB.lavender,
            borderRadius: 14,
            padding: '14px 16px',
            marginBottom: 32,
          }}
        >
          <span style={{ fontSize: 16, color: ONB.primary, flexShrink: 0, lineHeight: 1.6, fontFamily: 'serif' }}>✦</span>
          <p
            style={{
              margin: 0,
              fontFamily: ONB.font,
              fontSize: 14,
              color: ONB.ink,
              lineHeight: 1.6,
              fontWeight: 500,
            }}
          >
            Learning paths are the heart of Notemage — every path is generated from your own
            material and cites its sources.
          </p>
        </div>

        {/* Section 1 */}
        <h2
          style={{
            margin: '0 0 10px',
            fontFamily: ONB.font,
            fontSize: 20,
            fontWeight: 700,
            color: ONB.ink,
            letterSpacing: '-0.15px',
          }}
        >
          What is a learning path?
        </h2>
        <p
          style={{
            margin: '0 0 28px',
            fontFamily: ONB.font,
            fontSize: 15,
            color: ONB.muted,
            lineHeight: 1.7,
          }}
        >
          A path is a multi-phase course: short theory lessons, flashcard drills, quizzes,
          weak-point reviews, and a final graded exam — laid out on a trail you follow top to
          bottom.
        </p>

        {/* Section 2 */}
        <h2
          style={{
            margin: '0 0 18px',
            fontFamily: ONB.font,
            fontSize: 20,
            fontWeight: 700,
            color: ONB.ink,
            letterSpacing: '-0.15px',
          }}
        >
          How Mage builds one
        </h2>

        {/* Numbered steps */}
        <ol style={{ margin: '0 0 36px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            'You add material — a PDF, slides, notes, or a YouTube link.',
            'Mage reads it, finds the main topics, and pulls out the key ideas.',
            'It assembles a phased path with lessons, quizzes, and checkpoints — grounded in your sources.',
          ].map((text, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span
                style={{
                  flexShrink: 0,
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: ONB.primary,
                  color: ONB.white,
                  fontFamily: ONB.font,
                  fontSize: 13,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {i + 1}
              </span>
              <p
                style={{
                  margin: '3px 0 0',
                  fontFamily: ONB.font,
                  fontSize: 15,
                  color: ONB.ink,
                  lineHeight: 1.6,
                }}
              >
                {text}
              </p>
            </li>
          ))}
        </ol>

        {/* NEXT card */}
        <button
          type="button"
          className={mkt.tap}
          onClick={() => setActiveSection('community-library')}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            background: ONB.white,
            border: `1.4px solid ${ONB.line}`,
            borderRadius: 14,
            padding: '16px 20px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}
        >
          <p
            style={{
              margin: '0 0 4px',
              fontFamily: ONB.font,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: ONB.muted2,
            }}
          >
            NEXT
          </p>
          <p
            style={{
              margin: 0,
              fontFamily: ONB.font,
              fontSize: 16,
              fontWeight: 700,
              color: ONB.primary,
            }}
          >
            Community library →
          </p>
        </button>
      </div>
    </OnbMobileFrame>
  );
}
