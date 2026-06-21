'use client';

import { useState } from 'react';
import { ONB, MktWebFrame, MktTopNav, mkt } from './shell';

/**
 * Docs — web (Figma 72:6, 1440×1100).
 * Three-column layout: left sidebar (~260px) · main content (~720px max) · right TOC (~200px).
 * Active nav item: "Log in" (confirmed from Figma screenshot).
 * No footer (Figma frame ends at content area).
 */

/* ── types ─────────────────────────────────────────────────────────────── */
type SidebarItem =
  | { kind: 'group'; label: string }
  | { kind: 'item'; label: string; id: string };

const SIDEBAR_ITEMS: SidebarItem[] = [
  { kind: 'group', label: 'START HERE' },
  { kind: 'item', label: 'Getting started', id: 'getting-started' },
  { kind: 'group', label: 'LEARNING PATHS' },
  { kind: 'item', label: 'Learning paths', id: 'learning-paths' },
  { kind: 'item', label: 'Community library', id: 'community-library' },
  { kind: 'group', label: 'AI FEATURES' },
  { kind: 'item', label: 'Mage Chat', id: 'mage-chat' },
  { kind: 'group', label: 'STUDY TOOLS' },
  { kind: 'item', label: 'Flashcards', id: 'flashcards' },
  { kind: 'item', label: 'Mind maps', id: 'mind-maps' },
  { kind: 'item', label: 'Presentations', id: 'presentations' },
  { kind: 'group', label: 'ACCOUNT' },
  { kind: 'item', label: 'Plans & limits', id: 'plans-limits' },
];

const TOC_ITEMS = [
  { id: 'what-is', label: 'What is a learning path?' },
  { id: 'how-mage', label: 'How Mage builds one' },
  { id: 'next-steps', label: 'Next steps' },
];

export default function DocsWeb() {
  const [activeNav, setActiveNav] = useState<string>('learning-paths');
  const [activeToc, setActiveToc] = useState<string>('what-is');
  const [search, setSearch] = useState('');

  return (
    <MktWebFrame style={{ minHeight: 1100 }}>
      <MktTopNav active="login" />

      {/* ── Sidebar divider line ──────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          maxWidth: 1440,
          marginInline: 'auto',
          paddingInline: 0,
          minHeight: 1016, /* 1100 - 84px nav */
          borderTop: `1px solid ${ONB.line}`,
        }}
      >
        {/* ── LEFT SIDEBAR ──────────────────────────────────────────────── */}
        <aside
          style={{
            flex: '0 0 260px',
            width: 260,
            borderRight: `1px solid ${ONB.line}`,
            padding: '28px 20px 40px',
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
            background: ONB.white,
          }}
        >
          {/* Search input */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: ONB.white,
              border: `1.4px solid ${ONB.line}`,
              borderRadius: 12,
              padding: '0 14px',
              height: 42,
              marginBottom: 28,
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
                fontSize: 14,
                color: ONB.ink,
                lineHeight: 1,
              }}
            />
          </div>

          {/* Nav groups + items */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {SIDEBAR_ITEMS.map((item, i) => {
              if (item.kind === 'group') {
                return (
                  <p
                    key={`group-${i}`}
                    style={{
                      margin: i === 0 ? '0 0 6px' : '18px 0 6px',
                      padding: '0 10px',
                      fontFamily: ONB.font,
                      fontSize: 11.5,
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: ONB.muted2,
                    }}
                  >
                    {item.label}
                  </p>
                );
              }
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={mkt.tap}
                  onClick={() => setActiveNav(item.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: ONB.font,
                    fontSize: 15,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? ONB.primaryInk : ONB.ink,
                    background: isActive ? ONB.lavender : 'transparent',
                    borderRadius: 10,
                    padding: '7px 12px',
                    lineHeight: 1.4,
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* ── MAIN CONTENT ──────────────────────────────────────────────── */}
        <main
          style={{
            flex: 1,
            padding: '40px 56px 80px 64px',
            minWidth: 0,
          }}
        >
          <div style={{ maxWidth: 720 }}>
            {/* Breadcrumb */}
            <p
              style={{
                margin: '0 0 18px',
                fontFamily: ONB.font,
                fontSize: 14,
                color: ONB.muted,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <button
                type="button"
                className={mkt.navLink}
                style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontFamily: ONB.font, fontSize: 14, color: ONB.muted }}
              >
                Docs
              </button>
              <span style={{ color: ONB.muted2 }}>›</span>
              <span>Learning paths</span>
            </p>

            {/* H1 */}
            <h1
              style={{
                margin: '0 0 16px',
                fontFamily: ONB.font,
                fontSize: 40,
                fontWeight: 700,
                color: ONB.ink,
                letterSpacing: '-0.5px',
                lineHeight: 1.2,
              }}
            >
              Learning paths
            </h1>

            {/* Subtitle */}
            <p
              style={{
                margin: '0 0 28px',
                fontFamily: ONB.font,
                fontSize: 20,
                color: ONB.muted,
                lineHeight: 1.5,
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
                gap: 12,
                background: ONB.lavender,
                borderRadius: 14,
                padding: '16px 20px',
                marginBottom: 40,
              }}
            >
              <span
                style={{
                  fontSize: 18,
                  color: ONB.primary,
                  flexShrink: 0,
                  lineHeight: 1.5,
                  fontFamily: 'serif',
                }}
              >
                ✦
              </span>
              <p
                style={{
                  margin: 0,
                  fontFamily: ONB.font,
                  fontSize: 15,
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
              id="what-is"
              style={{
                margin: '0 0 14px',
                fontFamily: ONB.font,
                fontSize: 24,
                fontWeight: 700,
                color: ONB.ink,
                letterSpacing: '-0.2px',
              }}
            >
              What is a learning path?
            </h2>
            <p
              style={{
                margin: '0 0 36px',
                fontFamily: ONB.font,
                fontSize: 16,
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
              id="how-mage"
              style={{
                margin: '0 0 22px',
                fontFamily: ONB.font,
                fontSize: 24,
                fontWeight: 700,
                color: ONB.ink,
                letterSpacing: '-0.2px',
              }}
            >
              How Mage builds one
            </h2>

            {/* Numbered list */}
            <ol style={{ margin: '0 0 44px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {[
                'You add material — a PDF, slides, notes, or a YouTube link.',
                'Mage reads it, finds the main topics, and pulls out the key ideas.',
                'It assembles a phased path with lessons, quizzes, and checkpoints — grounded in your sources.',
              ].map((text, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                  <span
                    style={{
                      flexShrink: 0,
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      background: ONB.primary,
                      color: ONB.white,
                      fontFamily: ONB.font,
                      fontSize: 14,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1,
                    }}
                  >
                    {i + 1}
                  </span>
                  <p
                    style={{
                      margin: '4px 0 0',
                      fontFamily: ONB.font,
                      fontSize: 16,
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
              onClick={() => setActiveNav('community-library')}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: ONB.white,
                border: `1.4px solid ${ONB.line}`,
                borderRadius: 14,
                padding: '18px 24px',
                cursor: 'pointer',
                boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
              }}
            >
              <p
                style={{
                  margin: '0 0 4px',
                  fontFamily: ONB.font,
                  fontSize: 11,
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
                  fontSize: 17,
                  fontWeight: 700,
                  color: ONB.primary,
                }}
              >
                Community library →
              </p>
            </button>
          </div>
        </main>

        {/* ── RIGHT TOC ─────────────────────────────────────────────────── */}
        <aside
          style={{
            flex: '0 0 200px',
            width: 200,
            padding: '40px 24px 40px 8px',
          }}
        >
          <p
            style={{
              margin: '0 0 16px',
              fontFamily: ONB.font,
              fontSize: 11.5,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: ONB.muted2,
            }}
          >
            ON THIS PAGE
          </p>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {TOC_ITEMS.map((item) => {
              const isActive = activeToc === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={mkt.tap}
                  onClick={() => setActiveToc(item.id)}
                  style={{
                    display: 'block',
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontFamily: ONB.font,
                    fontSize: 14,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? ONB.primary : ONB.muted,
                    padding: '5px 8px 5px 12px',
                    borderLeft: isActive ? `2.5px solid ${ONB.primary}` : '2.5px solid transparent',
                    lineHeight: 1.4,
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>
      </div>
    </MktWebFrame>
  );
}
