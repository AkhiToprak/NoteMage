'use client';

import type { CSSProperties, ReactNode } from 'react';
import { Mage } from '@/figma/kit';
import { ONB, APPC, app, MageTip, Sparkle } from './shell';
import { AppWebFrame } from './shell';

/**
 * Dashboard — web (Figma 93:3, 1440×940). The signed-in home: hero greeting +
 * "New path" button, the active path card with progress, "Today's study plan"
 * rows, the "Study tools" grid, and a right rail (review queue · today's goal ·
 * next checkpoint · mage tip). Sidebar comes from `AppWebFrame`. Mock state only.
 */
export default function DashboardWeb() {
  return (
    <AppWebFrame active="dashboard" minHeight={940} askSubtitle="About this path">
      <div style={{ width: '100%', maxWidth: 1176 }}>
        {/* Hero row */}
        <header style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: ONB.muted }}>Your first path is ready</p>
            <h1
              style={{
                margin: '6px 0 0',
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: '-0.4px',
                color: ONB.ink,
              }}
            >
              Let&apos;s keep going
            </h1>
          </div>
          <button
            type="button"
            className={app.pill}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 44,
              padding: '0 18px',
              borderRadius: 14,
              background: ONB.white,
              border: `1.4px solid ${APPC.btnBorder}`,
              boxShadow: APPC.shadow.pill,
              color: ONB.primary,
              fontFamily: ONB.font,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              add
            </span>
            New path
          </button>
        </header>

        {/* Two columns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, marginTop: 24, alignItems: 'start' }}>
          {/* ── Left column ─────────────────────────────────────────── */}
          <div>
            {/* Active path card */}
            <section
              style={{
                background: ONB.white,
                border: `1.2px solid ${ONB.line}`,
                borderRadius: 24,
                boxShadow: APPC.shadow.path,
                padding: 24,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 16,
                    background: ONB.lavender,
                    display: 'grid',
                    placeItems: 'center',
                    flex: '0 0 auto',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 28, color: ONB.primaryInk }}>
                    database
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.2px', color: ONB.ink }}>
                    SQL Databases
                  </h2>
                  <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 500, color: ONB.muted }}>
                    Generated from Sample Material
                  </p>
                </div>
              </div>

              <p style={{ margin: '14px 0 0', fontSize: 12.5, fontWeight: 500, color: APPC.metaWarm }}>
                8 units · 42 lessons · 3 of 38 steps complete
              </p>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 16 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: ONB.muted }}>Progress</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: ONB.primaryInk }}>8% complete</span>
              </div>
              <ProgressTrack pct={8} style={{ marginTop: 8 }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 26, gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: ONB.primary,
                      display: 'grid',
                      placeItems: 'center',
                      flex: '0 0 auto',
                    }}
                  >
                    <span className="material-symbols-outlined filled" style={{ fontSize: 15, color: ONB.white }}>
                      play_arrow
                    </span>
                  </span>
                  <span style={{ fontSize: 14.5, fontWeight: 600, color: ONB.ink }}>Next · Tables and keys</span>
                </div>
                <button
                  type="button"
                  className={app.pill}
                  style={{
                    width: 280,
                    height: 54,
                    borderRadius: 16,
                    background: ONB.primary,
                    boxShadow: '0px 10px 22px rgba(124,92,255,0.36)',
                    border: 'none',
                    color: ONB.white,
                    fontFamily: ONB.font,
                    fontSize: 16,
                    fontWeight: 600,
                    cursor: 'pointer',
                    flex: '0 0 auto',
                  }}
                >
                  Continue studying
                </button>
              </div>
            </section>

            {/* Today's study plan */}
            <h3 style={{ margin: '28px 0 0', fontSize: 17, fontWeight: 700, letterSpacing: '-0.2px', color: ONB.ink }}>
              Today&apos;s study plan
            </h3>
            <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
              <PlanRow icon="play_arrow" title="Continue · Tables and keys" subtitle="Lesson 4 · 10 min" />
              <PlanRow icon="replay" title="Review · Table relationships" subtitle="1 card due today" />
              <PlanRow mage title="Ask Mage · Explain primary keys" subtitle="Get a quick explainer" />
            </div>

            {/* Study tools */}
            <h3 style={{ margin: '28px 0 0', fontSize: 17, fontWeight: 700, letterSpacing: '-0.2px', color: ONB.ink }}>
              Study tools
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 14 }}>
              <ToolTile icon="target" title="Review weak points" subtitle="1 topic waiting" />
              <ToolTile mage title="Ask Mage" subtitle="About SQL databases" />
              <ToolTile icon="description" title="View sources" subtitle="PDF, slides, notes" />
              <ToolTile icon="add" title="Create new path" subtitle="Upload more material" />
            </div>
          </div>

          {/* ── Right rail ──────────────────────────────────────────── */}
          <aside style={{ display: 'grid', gap: 16 }}>
            {/* Review queue (amber) */}
            <section
              style={{
                background: APPC.amberBg,
                border: `1.2px solid ${APPC.amberBorder}`,
                borderRadius: 18,
                padding: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: APPC.amberChip,
                    display: 'grid',
                    placeItems: 'center',
                    flex: '0 0 auto',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 22, color: APPC.amberInk }}>
                    replay
                  </span>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: ONB.ink }}>Review queue</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 500, color: APPC.amberInk }}>1 topic waiting</p>
                </div>
              </div>
              <div style={{ height: 1, background: APPC.amberBorder, margin: '16px 0 14px' }} />
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 500, color: ONB.ink }}>Table relationships</p>
              <button type="button" className={app.link} style={linkBtn}>
                Review now <span className="material-symbols-outlined" style={arrowGlyph}>arrow_forward</span>
              </button>
            </section>

            {/* Today's goal */}
            <section style={railCard}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: ONB.ink }}>Today&apos;s goal</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: ONB.green,
                    display: 'grid',
                    placeItems: 'center',
                    flex: '0 0 auto',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 15, color: ONB.white }}>check</span>
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: ONB.ink }}>1 of 1 sessions done</span>
              </div>
              <p style={{ margin: '14px 0 0', fontSize: 12, fontWeight: 500, lineHeight: 1.35, color: ONB.muted }}>
                Come back tomorrow to keep your streak.
              </p>
            </section>

            {/* Next checkpoint */}
            <section style={railCard}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: ONB.ink }}>Next checkpoint</p>
              <span
                style={{
                  display: 'inline-block',
                  marginTop: 14,
                  padding: '4px 11px',
                  borderRadius: 12,
                  background: ONB.lavender,
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: ONB.primaryInk,
                }}
              >
                2 lessons until quiz
              </span>
              <ProgressTrack pct={66} style={{ marginTop: 18, height: 6 }} />
              <p style={{ margin: '12px 0 0', fontSize: 12, fontWeight: 500, lineHeight: 1.35, color: ONB.muted }}>
                Finish the next lessons to unlock your first checkpoint.
              </p>
            </section>

            {/* Mage tip (mascot overhangs the right edge) */}
            <div style={{ position: 'relative' }}>
              <MageTip width={236}>You&apos;re 2 lessons away from your first checkpoint.</MageTip>
              <div style={{ position: 'absolute', right: -16, bottom: -6, width: 120, height: 120, pointerEvents: 'none' }}>
                <Sparkle size={14} color={ONB.gold} style={{ position: 'absolute', left: -2, top: -4 }} />
                <Mage pose="default" size={120} alt="" />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </AppWebFrame>
  );
}

/* ── shared sub-components ─────────────────────────────────────────────── */

const railCard: CSSProperties = {
  background: ONB.white,
  border: `1.2px solid ${ONB.line}`,
  borderRadius: 18,
  boxShadow: APPC.shadow.rail,
  padding: 16,
};

const linkBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  marginTop: 14,
  padding: 0,
  background: 'transparent',
  border: 'none',
  color: ONB.primary,
  fontFamily: ONB.font,
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
};

const arrowGlyph: CSSProperties = { fontSize: 16 };

function ProgressTrack({ pct, style }: { pct: number; style?: CSSProperties }) {
  return (
    <div style={{ height: 8, borderRadius: 4, background: ONB.lavender, overflow: 'hidden', ...style }}>
      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: ONB.primary }} />
    </div>
  );
}

function RowTile({ icon, mage, size = 40, radius = 11 }: { icon?: string; mage?: boolean; size?: number; radius?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: ONB.lavender,
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
        flex: '0 0 auto',
      }}
    >
      {mage ? (
        <Mage pose="default" size={Math.round(size * 0.66)} alt="" />
      ) : (
        <span className="material-symbols-outlined" style={{ fontSize: 20, color: ONB.primary }}>
          {icon}
        </span>
      )}
    </div>
  );
}

function PlanRow({ icon, mage, title, subtitle }: { icon?: string; mage?: boolean; title: string; subtitle: string }) {
  return (
    <button
      type="button"
      className={app.card}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        width: '100%',
        textAlign: 'left',
        background: ONB.white,
        border: `1.2px solid ${ONB.line}`,
        borderRadius: 16,
        boxShadow: APPC.shadow.row,
        padding: '13px 16px',
        cursor: 'pointer',
      }}
    >
      <RowTile icon={icon} mage={mage} />
      <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: ONB.ink }}>{title}</span>
        <span style={{ fontSize: 12.5, fontWeight: 500, color: ONB.muted }}>{subtitle}</span>
      </span>
      <span
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: ONB.lavender,
          display: 'grid',
          placeItems: 'center',
          flex: '0 0 auto',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: ONB.primary }}>arrow_forward</span>
      </span>
    </button>
  );
}

function ToolTile({ icon, mage, title, subtitle }: { icon?: string; mage?: boolean; title: string; subtitle: string }): ReactNode {
  return (
    <button
      type="button"
      className={app.card}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 0,
        textAlign: 'left',
        background: ONB.white,
        border: `1.2px solid ${ONB.line}`,
        borderRadius: 18,
        boxShadow: APPC.shadow.tool,
        padding: 16,
        cursor: 'pointer',
        minHeight: 112,
      }}
    >
      <RowTile icon={icon} mage={mage} size={40} radius={12} />
      <span style={{ marginTop: 16, fontSize: 14, fontWeight: 600, color: ONB.ink }}>{title}</span>
      <span style={{ marginTop: 3, fontSize: 11.5, fontWeight: 500, color: ONB.muted }}>{subtitle}</span>
    </button>
  );
}
