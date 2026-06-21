'use client';

import type { CSSProperties } from 'react';
import { Mage } from '@/figma/kit';
import { ONB, APPC, app, MageTip, Sparkle } from './shell';
import { AppMobileFrame } from './shell';

/**
 * Dashboard — mobile (Figma 94:3, 393×1420). Single-column signed-in home: hero +
 * "New path", active path card, amber review queue, today's study plan rows, the
 * today's-goal / next-checkpoint pair, the study-tools 2×2 grid, and a mage tip.
 * Status bar + bottom tab bar come from `AppMobileFrame`. Mock state only.
 */
export default function DashboardMobile() {
  return (
    <AppMobileFrame active="dashboard">
      <div style={{ padding: '14px 24px 24px', display: 'grid', gap: 0 }}>
        {/* Hero row */}
        <header style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 500, color: ONB.muted }}>Your first path is ready</p>
            <h1 style={{ margin: '5px 0 0', fontSize: 24, fontWeight: 700, letterSpacing: '-0.3px', color: ONB.ink }}>
              Let&apos;s keep going
            </h1>
          </div>
          <button
            type="button"
            className={app.pill}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              height: 38,
              padding: '0 14px',
              borderRadius: 12,
              background: ONB.white,
              border: `1.4px solid ${APPC.btnBorder}`,
              boxShadow: APPC.shadow.pill,
              color: ONB.primary,
              fontFamily: ONB.font,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              flex: '0 0 auto',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            New path
          </button>
        </header>

        {/* Active path card */}
        <section
          style={{
            marginTop: 22,
            background: ONB.white,
            border: `1.2px solid ${ONB.line}`,
            borderRadius: 24,
            boxShadow: APPC.shadow.path,
            padding: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: ONB.lavender,
                display: 'grid',
                placeItems: 'center',
                flex: '0 0 auto',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: ONB.primaryInk }}>database</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 18.5, fontWeight: 700, letterSpacing: '-0.2px', color: ONB.ink }}>
                SQL Databases
              </h2>
              <p style={{ margin: '3px 0 0', fontSize: 12, fontWeight: 500, color: ONB.muted }}>
                Generated from Sample Material
              </p>
            </div>
          </div>

          <p style={{ margin: '14px 0 0', fontSize: 11.5, fontWeight: 500, color: APPC.metaWarm }}>
            8 units · 42 lessons · 3 of 38 done
          </p>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: ONB.muted }}>Progress</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: ONB.primaryInk }}>8% complete</span>
          </div>
          <ProgressTrack pct={8} style={{ marginTop: 8 }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 22 }}>
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: ONB.primary,
                display: 'grid',
                placeItems: 'center',
                flex: '0 0 auto',
              }}
            >
              <span className="material-symbols-outlined filled" style={{ fontSize: 14, color: ONB.white }}>play_arrow</span>
            </span>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: ONB.ink }}>Next · Tables and keys</span>
          </div>

          <button
            type="button"
            className={app.pill}
            style={{
              width: '100%',
              height: 52,
              marginTop: 14,
              borderRadius: 16,
              background: ONB.primary,
              boxShadow: '0px 9px 20px rgba(124,92,255,0.36)',
              border: 'none',
              color: ONB.white,
              fontFamily: ONB.font,
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Continue studying
          </button>
        </section>

        {/* Review queue (amber) */}
        <section
          style={{
            marginTop: 16,
            background: APPC.amberBg,
            border: `1.2px solid ${APPC.amberBorder}`,
            borderRadius: 18,
            padding: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: APPC.amberChip,
                display: 'grid',
                placeItems: 'center',
                flex: '0 0 auto',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 22, color: APPC.amberInk }}>replay</span>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: ONB.ink }}>Review queue</p>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, fontWeight: 500, color: APPC.amberInk }}>1 topic waiting</p>
            </div>
          </div>
          <div style={{ height: 1, background: APPC.amberBorder, margin: '14px 0 12px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, fontWeight: 500, color: ONB.ink }}>Table relationships</span>
            <button type="button" className={app.link} style={linkBtn}>
              Review now <span className="material-symbols-outlined" style={{ fontSize: 15 }}>arrow_forward</span>
            </button>
          </div>
        </section>

        {/* Today's study plan */}
        <h3 style={{ margin: '24px 0 0', fontSize: 16, fontWeight: 700, letterSpacing: '-0.2px', color: ONB.ink }}>
          Today&apos;s study plan
        </h3>
        <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
          <PlanRow icon="play_arrow" title="Continue · Tables and keys" subtitle="Lesson 4 · 10 min" />
          <PlanRow icon="replay" title="Review · Table relationships" subtitle="1 card due today" />
          <PlanRow mage title="Ask Mage · Explain primary keys" subtitle="Quick explainer" />
        </div>

        {/* Today's goal + Next checkpoint */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13, marginTop: 16 }}>
          <section style={miniCard}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: ONB.ink }}>Today&apos;s goal</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: ONB.green,
                  display: 'grid',
                  placeItems: 'center',
                  flex: '0 0 auto',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: ONB.white }}>check</span>
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: ONB.ink }}>1 of 1 done</span>
            </div>
            <p style={{ margin: '12px 0 0', fontSize: 11.5, fontWeight: 500, lineHeight: 1.35, color: ONB.muted }}>
              Come back tomorrow to keep your streak.
            </p>
          </section>

          <section style={miniCard}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: ONB.ink }}>Next checkpoint</p>
            <span
              style={{
                display: 'inline-block',
                marginTop: 12,
                padding: '3px 9px',
                borderRadius: 11,
                background: ONB.lavender,
                fontSize: 10.5,
                fontWeight: 600,
                color: ONB.primaryInk,
              }}
            >
              2 lessons to quiz
            </span>
            <ProgressTrack pct={66} style={{ marginTop: 14, height: 5 }} />
            <p style={{ margin: '10px 0 0', fontSize: 11, fontWeight: 500, lineHeight: 1.35, color: ONB.muted }}>
              Finish lessons to unlock your checkpoint.
            </p>
          </section>
        </div>

        {/* Study tools */}
        <h3 style={{ margin: '24px 0 0', fontSize: 16, fontWeight: 700, letterSpacing: '-0.2px', color: ONB.ink }}>
          Study tools
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13, marginTop: 14 }}>
          <ToolTile icon="target" title="Review weak points" subtitle="1 topic waiting" />
          <ToolTile mage title="Ask Mage" subtitle="About SQL databases" />
          <ToolTile icon="description" title="View sources" subtitle="PDF, slides, notes" />
          <ToolTile icon="add" title="Create new path" subtitle="Upload more material" />
        </div>

        {/* Mage tip */}
        <div style={{ position: 'relative', marginTop: 22 }}>
          <MageTip width="100%">You&apos;re 2 lessons away from your first checkpoint.</MageTip>
          <div style={{ position: 'absolute', right: 8, bottom: -2, width: 98, height: 98, pointerEvents: 'none' }}>
            <Sparkle size={12} color={ONB.gold} style={{ position: 'absolute', left: -4, top: -4 }} />
            <Mage pose="default" size={98} alt="" />
          </div>
        </div>
      </div>
    </AppMobileFrame>
  );
}

/* ── shared sub-components ─────────────────────────────────────────────── */

const miniCard: CSSProperties = {
  background: ONB.white,
  border: `1.2px solid ${ONB.line}`,
  borderRadius: 18,
  boxShadow: APPC.shadow.rail,
  padding: 14,
};

const linkBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  padding: 0,
  background: 'transparent',
  border: 'none',
  color: ONB.primary,
  fontFamily: ONB.font,
  fontSize: 12.5,
  fontWeight: 700,
  cursor: 'pointer',
};

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
        <span className="material-symbols-outlined" style={{ fontSize: 20, color: ONB.primary }}>{icon}</span>
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
        gap: 14,
        width: '100%',
        textAlign: 'left',
        background: ONB.white,
        border: `1.2px solid ${ONB.line}`,
        borderRadius: 16,
        boxShadow: APPC.shadow.row,
        padding: '13px 14px',
        cursor: 'pointer',
      }}
    >
      <RowTile icon={icon} mage={mage} />
      <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: ONB.ink }}>{title}</span>
        <span style={{ fontSize: 12, fontWeight: 500, color: ONB.muted }}>{subtitle}</span>
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

function ToolTile({ icon, mage, title, subtitle }: { icon?: string; mage?: boolean; title: string; subtitle: string }) {
  return (
    <button
      type="button"
      className={app.card}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        textAlign: 'left',
        background: ONB.white,
        border: `1.2px solid ${ONB.line}`,
        borderRadius: 18,
        boxShadow: APPC.shadow.tool,
        padding: 14,
        cursor: 'pointer',
        minHeight: 100,
      }}
    >
      <RowTile icon={icon} mage={mage} size={38} radius={11} />
      <span style={{ marginTop: 14, fontSize: 13.5, fontWeight: 600, color: ONB.ink }}>{title}</span>
      <span style={{ marginTop: 3, fontSize: 11, fontWeight: 500, color: ONB.muted }}>{subtitle}</span>
    </button>
  );
}
