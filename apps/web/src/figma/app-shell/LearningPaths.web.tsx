'use client';

import { useState } from 'react';
import { Mage } from '@/figma/kit';
import {
  ONB,
  Sparkle,
  AppWebFrame,
  MageTip,
  app,
  APPC,
} from './shell';

/**
 * Learning paths — Web (Figma node 99:3, 1440 wide).
 * Sidebar 190 + 2-col card grid content area.
 * Filter tabs drive local state; no backend.
 */

type FilterTab = 'all' | 'in-progress' | 'completed';

// ── Path card data ──────────────────────────────────────────────────────────

interface PathCard {
  id: string;
  title: string;
  source: string;
  steps: number;
  progress: number; // 0–100
  status: 'active' | 'completed' | null;
  next: string;
  action: 'continue' | 'review';
  hasIcon: boolean; // true = database icon; false = plain lavender tile
  titleColor?: string;
  progressFill?: string;
  progressPct?: string;
  progressPctColor?: string;
}

const PATHS: PathCard[] = [
  {
    id: 'sql',
    title: 'SQL Databases',
    source: 'From Sample Material',
    steps: 6,
    progress: 8,
    status: 'active',
    next: 'Next: Tables and keys',
    action: 'continue',
    hasIcon: true,
  },
  {
    id: 'chem',
    title: 'Organic Chemistry',
    source: 'From Chem notes.pdf',
    steps: 9,
    progress: 62,
    status: null,
    next: 'Next: Functional groups',
    action: 'continue',
    hasIcon: false,
  },
  {
    id: 'wwii',
    title: 'World War II',
    source: 'From History slides',
    steps: 7,
    progress: 100,
    status: 'completed',
    next: 'Completed · Review anytime',
    action: 'review',
    hasIcon: false,
    titleColor: '#5b5566',
    progressFill: '#b9a8f5',
    progressPct: '100%',
    progressPctColor: '#8a82a0',
  },
];

// ── Filter visibility ───────────────────────────────────────────────────────

function cardVisible(card: PathCard, filter: FilterTab): boolean {
  if (filter === 'all') return true;
  if (filter === 'in-progress') return card.status === 'active' || card.status === null;
  if (filter === 'completed') return card.status === 'completed';
  return true;
}

// ── Sub-components ──────────────────────────────────────────────────────────

function DatabaseIcon() {
  // Stylised cylinder / database icon using CSS shapes (no raster, no SVG import).
  // Matches the Figma: a lavender rounded tile containing a dark-purple database cylinder.
  return (
    <div
      style={{
        width: 52,
        height: 52,
        borderRadius: 14,
        background: ONB.lavender,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        className="material-symbols-outlined filled"
        style={{ fontSize: 28, color: ONB.primaryInk }}
      >
        database
      </span>
    </div>
  );
}

function PlainIcon() {
  return (
    <div
      style={{
        width: 52,
        height: 52,
        borderRadius: 14,
        background: ONB.lavender,
        flexShrink: 0,
      }}
    />
  );
}

function StatusBadge({ status }: { status: 'active' | 'completed' }) {
  const isActive = status === 'active';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 24,
        paddingInline: 10,
        borderRadius: 12,
        background: isActive ? ONB.primary : ONB.lavender,
        fontFamily: ONB.font,
        fontSize: 11.5,
        fontWeight: 600,
        color: isActive ? ONB.white : ONB.primaryInk,
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}
    >
      {isActive ? 'Active' : 'Completed'}
    </span>
  );
}

function ProgressBar({
  progress,
  fill = ONB.primary,
}: {
  progress: number;
  fill?: string;
}) {
  return (
    <div
      style={{
        height: 7,
        borderRadius: 3.5,
        background: ONB.lavender,
        overflow: 'hidden',
        width: '100%',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          borderRadius: 3.5,
          background: fill,
        }}
      />
    </div>
  );
}

function PathCardEl({ card }: { card: PathCard }) {
  const isActive = card.status === 'active';
  const isCompleted = card.status === 'completed';
  const progressFill = card.progressFill ?? ONB.primary;
  const pctColor = card.progressPctColor ?? ONB.primaryInk;
  const titleColor = card.titleColor ?? ONB.ink;

  return (
    <div
      className={app.card}
      style={{
        background: ONB.white,
        border: isActive
          ? `1.6px solid ${ONB.primary}`
          : `1.2px solid ${ONB.line}`,
        borderRadius: 20,
        boxShadow: isActive
          ? '0px 10px 26px rgba(124,92,255,0.16), 0px 2px 8px rgba(26,19,48,0.05)'
          : isCompleted
          ? '0px 3px 10px rgba(58,46,102,0.04)'
          : '0px 6px 18px rgba(58,46,102,0.07)',
        padding: '20px 20px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      {/* Row 1: icon + title/source + badge */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 0 }}>
        {card.hasIcon ? <DatabaseIcon /> : <PlainIcon />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <p
              style={{
                margin: 0,
                fontFamily: ONB.font,
                fontSize: 17,
                fontWeight: 700,
                letterSpacing: -0.2,
                color: titleColor,
                lineHeight: 1.3,
              }}
            >
              {card.title}
            </p>
            {card.status && <StatusBadge status={card.status} />}
          </div>
          <p
            style={{
              margin: '4px 0 0',
              fontFamily: ONB.font,
              fontSize: 12.5,
              fontWeight: 500,
              color: ONB.muted,
              lineHeight: 1.3,
            }}
          >
            {card.source} · {card.steps} steps
          </p>
        </div>
      </div>

      {/* Progress bar + percentage */}
      <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <ProgressBar progress={card.progress} fill={progressFill} />
        </div>
        <span
          style={{
            fontFamily: ONB.font,
            fontSize: 13,
            fontWeight: 700,
            color: pctColor,
            minWidth: 36,
            textAlign: 'right',
          }}
        >
          {card.progressPct ?? `${card.progress}%`}
        </span>
      </div>

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: '#f2efe8',
          margin: '14px 0 12px',
        }}
      />

      {/* Next label + CTA */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontFamily: ONB.font,
            fontSize: 13,
            fontWeight: 500,
            color: isCompleted ? ONB.muted : ONB.ink,
            lineHeight: 1.3,
          }}
        >
          {card.next}
        </span>
        <button
          className={app.link}
          type="button"
          style={{
            fontFamily: ONB.font,
            fontSize: 13,
            fontWeight: 700,
            color: ONB.primary,
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {card.action === 'continue' ? 'Continue →' : 'Review →'}
        </button>
      </div>
    </div>
  );
}

function CreateCard() {
  return (
    <div
      className={app.card}
      style={{
        background: '#f6f2ff',
        border: '1.5px dashed #c9bbff',
        borderRadius: 20,
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        minHeight: 156,
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: ONB.primary,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span
          className="material-symbols-outlined filled"
          style={{ fontSize: 24, color: ONB.white }}
        >
          add
        </span>
      </div>
      <div>
        <p
          style={{
            margin: 0,
            fontFamily: ONB.font,
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: -0.2,
            color: ONB.ink,
            lineHeight: 1.3,
          }}
        >
          Create a new path
        </p>
        <p
          style={{
            margin: '4px 0 0',
            fontFamily: ONB.font,
            fontSize: 12.5,
            fontWeight: 500,
            color: ONB.muted,
            lineHeight: 1.3,
          }}
        >
          Upload material and let Mage build it
        </p>
      </div>
    </div>
  );
}

// ── Filter pill ─────────────────────────────────────────────────────────────

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={app.pill}
      style={{
        height: 36,
        paddingInline: 18,
        borderRadius: 18,
        background: active ? ONB.primary : ONB.white,
        border: active ? 'none' : `1.2px solid ${ONB.line}`,
        fontFamily: ONB.font,
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        color: active ? ONB.white : ONB.muted,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

// ── Root component ──────────────────────────────────────────────────────────

export default function LearningPathsWeb() {
  const [filter, setFilter] = useState<FilterTab>('all');

  const visiblePaths = PATHS.filter((c) => cardVisible(c, filter));
  const showCreate = filter !== 'completed';

  // Build 2-col grid items: SQL + Chem in first row; Create + WWII in second row.
  // When filtering we show the matching cards + the create card, laid out naturally.
  // Full "all" view: col-a = [sql, create], col-b = [chem, wwii]
  // The Figma grid: row1 = (sql, chem), row2 = (create, wwii).
  // We reproduce that with CSS grid 2-col auto rows.

  return (
    <AppWebFrame active="paths" askSubtitle="Help me study" minHeight={730} mainPadding="36px 40px 40px 34px">

      {/* Page header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontFamily: ONB.font,
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: -0.4,
              color: ONB.ink,
              lineHeight: 1.3,
            }}
          >
            Learning paths
          </h1>
          <p
            style={{
              margin: '6px 0 0',
              fontFamily: ONB.font,
              fontSize: 14,
              fontWeight: 500,
              color: ONB.muted,
              lineHeight: 1.3,
            }}
          >
            3 paths in progress
          </p>
        </div>

        {/* "+ New path" button */}
        <button
          type="button"
          className={app.pill}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: 44,
            paddingInline: 18,
            borderRadius: 14,
            background: ONB.white,
            border: `1.4px solid ${APPC.btnBorder}`,
            boxShadow: APPC.shadow.pill,
            fontFamily: ONB.font,
            fontSize: 14,
            fontWeight: 600,
            color: ONB.primary,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
          New path
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <FilterPill label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
        <FilterPill label="In progress" active={filter === 'in-progress'} onClick={() => setFilter('in-progress')} />
        <FilterPill label="Completed" active={filter === 'completed'} onClick={() => setFilter('completed')} />
      </div>

      {/* 2-col card grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '20px',
          maxWidth: 860,
        }}
      >
        {/* Row 1 */}
        {visiblePaths.filter((c) => c.id === 'sql').map((c) => (
          <PathCardEl key={c.id} card={c} />
        ))}
        {visiblePaths.filter((c) => c.id === 'chem').map((c) => (
          <PathCardEl key={c.id} card={c} />
        ))}

        {/* Row 2 */}
        {showCreate && <CreateCard />}
        {visiblePaths.filter((c) => c.id === 'wwii').map((c) => (
          <PathCardEl key={c.id} card={c} />
        ))}

        {/* If only create card in row (completed filter), make it span so it doesn't float */}
        {!showCreate && visiblePaths.length === 0 && (
          <p style={{ gridColumn: 'span 2', fontFamily: ONB.font, fontSize: 14, color: ONB.muted }}>
            No paths match this filter.
          </p>
        )}
      </div>

      {/* Mage Tip card */}
      <div style={{ marginTop: 24, position: 'relative', maxWidth: 600 }}>
        <MageTip>
          You have 2 active paths — continue SQL Databases to keep your streak.
        </MageTip>
        {/* Mage mascot overlapping the right side */}
        <div
          style={{
            position: 'absolute',
            right: -16,
            bottom: -12,
            pointerEvents: 'none',
          }}
        >
          <Sparkle
            size={14}
            color={ONB.gold}
            style={{ position: 'absolute', top: -10, left: -8 }}
          />
          <Mage pose="pointing" size={128} alt="" />
        </div>
      </div>
    </AppWebFrame>
  );
}
