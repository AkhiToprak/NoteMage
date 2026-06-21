'use client';

import { useState } from 'react';
import { Mage } from '@/figma/kit';
import {
  ONB,
  Sparkle,
  AppMobileFrame,
  MageTip,
  app,
  APPC,
} from './shell';

/**
 * Learning paths — Mobile (Figma node 100:3, 393px wide).
 * Single-column card stack inside AppMobileFrame.
 * Filter tabs drive local state; no backend.
 */

type FilterTab = 'all' | 'in-progress' | 'completed';

// ── Path card data (same as web, mobile sizes) ──────────────────────────────

interface PathCard {
  id: string;
  title: string;
  source: string;
  steps: number;
  progress: number;
  status: 'active' | 'completed' | null;
  next: string;
  action: 'continue' | 'review';
  hasIcon: boolean;
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

function cardVisible(card: PathCard, filter: FilterTab): boolean {
  if (filter === 'all') return true;
  if (filter === 'in-progress') return card.status === 'active' || card.status === null;
  if (filter === 'completed') return card.status === 'completed';
  return true;
}

// ── Sub-components ──────────────────────────────────────────────────────────

function DatabaseIcon() {
  return (
    <div
      style={{
        width: 48,
        height: 48,
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
        style={{ fontSize: 26, color: ONB.primaryInk }}
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
        width: 48,
        height: 48,
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
        fontSize: 11,
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
          ? '0px 8px 22px rgba(124,92,255,0.16), 0px 2px 8px rgba(26,19,48,0.05)'
          : isCompleted
          ? '0px 3px 10px rgba(58,46,102,0.04)'
          : '0px 6px 18px rgba(58,46,102,0.07)',
        padding: '16px 16px 14px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Row 1: icon + title/source + badge */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {card.hasIcon ? <DatabaseIcon /> : <PlainIcon />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
            <p
              style={{
                margin: 0,
                fontFamily: ONB.font,
                fontSize: 16.5,
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
              fontSize: 12,
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
      <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <ProgressBar progress={card.progress} fill={progressFill} />
        </div>
        <span
          style={{
            fontFamily: ONB.font,
            fontSize: 12.5,
            fontWeight: 700,
            color: pctColor,
            minWidth: 32,
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
          margin: '12px 0 10px',
        }}
      />

      {/* Next label + CTA */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontFamily: ONB.font,
            fontSize: 12.5,
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
            fontSize: 12.5,
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
        borderRadius: 18,
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        minHeight: 84,
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
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
          style={{ fontSize: 22, color: ONB.white }}
        >
          add
        </span>
      </div>
      <div>
        <p
          style={{
            margin: 0,
            fontFamily: ONB.font,
            fontSize: 15,
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
            margin: '3px 0 0',
            fontFamily: ONB.font,
            fontSize: 11.5,
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
        height: 34,
        paddingInline: 16,
        borderRadius: 17,
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

export default function LearningPathsMobile() {
  const [filter, setFilter] = useState<FilterTab>('all');

  const visiblePaths = PATHS.filter((c) => cardVisible(c, filter));
  const showCreate = filter !== 'completed';

  return (
    <AppMobileFrame active="paths" time="9:41">
      {/* Scrollable content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 24px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
      >
        {/* Page header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontFamily: ONB.font,
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: -0.5,
                color: ONB.ink,
                lineHeight: 1.3,
              }}
            >
              Learning paths
            </h1>
            <p
              style={{
                margin: '4px 0 0',
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
              gap: 4,
              height: 38,
              paddingInline: 12,
              borderRadius: 12,
              background: ONB.white,
              border: `1.4px solid ${APPC.btnBorder}`,
              boxShadow: APPC.shadow.pill,
              fontFamily: ONB.font,
              fontSize: 13,
              fontWeight: 600,
              color: ONB.primary,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            New path
          </button>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
          <FilterPill label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
          <FilterPill label="In progress" active={filter === 'in-progress'} onClick={() => setFilter('in-progress')} />
          <FilterPill label="Completed" active={filter === 'completed'} onClick={() => setFilter('completed')} />
        </div>

        {/* Card stack */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {visiblePaths.filter((c) => c.id === 'sql').map((c) => (
            <PathCardEl key={c.id} card={c} />
          ))}
          {visiblePaths.filter((c) => c.id === 'chem').map((c) => (
            <PathCardEl key={c.id} card={c} />
          ))}
          {showCreate && <CreateCard />}
          {visiblePaths.filter((c) => c.id === 'wwii').map((c) => (
            <PathCardEl key={c.id} card={c} />
          ))}
          {visiblePaths.length === 0 && !showCreate && (
            <p style={{ fontFamily: ONB.font, fontSize: 14, color: ONB.muted }}>
              No paths match this filter.
            </p>
          )}
        </div>

        {/* Mage Tip */}
        <div style={{ marginTop: 16, position: 'relative' }}>
          <MageTip>
            You have 2 active paths — continue SQL Databases to keep your streak.
          </MageTip>
          {/* Mage mascot overlapping right */}
          <div
            style={{
              position: 'absolute',
              right: -8,
              bottom: -8,
              pointerEvents: 'none',
            }}
          >
            <Sparkle
              size={12}
              color={ONB.gold}
              style={{ position: 'absolute', top: -8, left: -6 }}
            />
            <Mage pose="pointing" size={98} alt="" />
          </div>
        </div>
      </div>
    </AppMobileFrame>
  );
}
