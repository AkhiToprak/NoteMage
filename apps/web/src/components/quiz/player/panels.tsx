'use client';

/* Hallmark · component: quiz player sidebar panels · genre: editorial · theme: project (cream / --quiz-* + --nm-* tokens)
 * states: rows have hover + focus-visible; cards are static surfaces
 * contrast: pass (semantic tokens only — theme-flipping, no inline hex)
 *
 * The three right-rail cards from the Figma "Quiz screens" redesign: Sources,
 * the Ask-Mage quick-action card, and Mission progress. Desktop renders them
 * stacked in the sidebar; mobile folds each into a collapsible accordion
 * (QuizPlayerShell owns that responsive switch and the open/close state).
 */

import type { MageQuickAction, MissionStep, QuizSource } from './types';

const SOURCE_ICON: Record<NonNullable<QuizSource['kind']>, string> = {
  pdf: 'picture_as_pdf',
  ppt: 'slideshow',
  doc: 'description',
  page: 'article',
  video: 'play_circle',
  path: 'route',
  quiz: 'quiz',
};

export function SidebarCard({
  children,
  padded = true,
}: {
  children: React.ReactNode;
  padded?: boolean;
}) {
  return (
    <section
      style={{
        background: 'var(--quiz-card)',
        border: '1px solid var(--quiz-card-border)',
        borderRadius: 'var(--radius-lg)',
        padding: padded ? '16px 16px' : 0,
        boxShadow: '0 1px 2px rgb(15 15 30 / 0.03), 0 10px 26px rgb(15 15 30 / 0.04)',
      }}
    >
      {children}
    </section>
  );
}

function CardHeader({ title, trailing }: { title: string; trailing?: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: '10px',
        marginBottom: '12px',
      }}
    >
      <h3
        style={{
          margin: 0,
          fontFamily: 'var(--font-display)',
          fontSize: '15px',
          fontWeight: 800,
          color: 'var(--on-surface)',
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </h3>
      {trailing ? (
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--on-surface-variant)' }}>
          {trailing}
        </span>
      ) : null}
    </div>
  );
}

// ── Sources ──────────────────────────────────────────────────────────────

export function SourcesPanel({
  sources,
  onOpenSource,
  hideHeader = false,
}: {
  sources: QuizSource[];
  onOpenSource?: (source: QuizSource) => void;
  hideHeader?: boolean;
}) {
  return (
    <>
      <style>{`
        .qsrc-row { transition: background-color 0.15s var(--ease-spring), border-color 0.15s var(--ease-spring); }
        .qsrc-row:hover { background: var(--quiz-bg); border-color: var(--nm-primary); }
        .qsrc-row:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { .qsrc-row { transition: none; } }
      `}</style>
      {!hideHeader ? (
        <CardHeader
          title="Sources"
          trailing={sources.length > 0 ? `${sources.length} ${sources.length === 1 ? 'file' : 'files'}` : undefined}
        />
      ) : null}
      {sources.length === 0 ? (
        <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5, color: 'var(--on-surface-variant)' }}>
          Grounded in your material.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {sources.map((s) => (
            <button
              key={s.id}
              type="button"
              className="qsrc-row"
              onClick={() => onOpenSource?.(s)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '11px',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--quiz-card-border)',
                background: 'var(--quiz-bg)',
                cursor: onOpenSource ? 'pointer' : 'default',
                textAlign: 'left',
                width: '100%',
                fontFamily: 'inherit',
              }}
            >
              <span
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: 'var(--radius-sm)',
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--nm-primary-light)',
                  color: 'var(--nm-primary-on-light)',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
                  {SOURCE_ICON[s.kind ?? 'doc']}
                </span>
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: 'var(--on-surface)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.title}
                </span>
                {s.detail ? (
                  <span style={{ display: 'block', fontSize: '12px', color: 'var(--on-surface-variant)' }}>
                    {s.detail}
                  </span>
                ) : null}
              </span>
              {onOpenSource ? (
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 18, color: 'var(--on-surface-variant)', flexShrink: 0 }}
                  aria-hidden
                >
                  chevron_right
                </span>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

// ── Ask Mage ─────────────────────────────────────────────────────────────

export function AskMageCard({
  subtitle,
  actions,
  hideHeader = false,
}: {
  subtitle: string;
  actions: MageQuickAction[];
  hideHeader?: boolean;
}) {
  return (
    <>
      <style>{`
        .qmage-action { transition: background-color 0.15s var(--ease-spring), transform 0.15s var(--ease-spring); }
        .qmage-action:hover { background: var(--nm-primary); color: var(--on-primary-container); }
        .qmage-action:active { transform: translateY(1px); }
        .qmage-action:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { .qmage-action { transition: none; } .qmage-action:active { transform: none; } }
      `}</style>
      {!hideHeader ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <span
            style={{
              width: '34px',
              height: '34px',
              borderRadius: 'var(--radius-sm)',
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--nm-primary-light)',
              color: 'var(--nm-primary-on-light)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 19 }} aria-hidden>
              auto_awesome
            </span>
          </span>
          <span style={{ minWidth: 0 }}>
            <span
              style={{
                display: 'block',
                fontFamily: 'var(--font-display)',
                fontSize: '15px',
                fontWeight: 800,
                color: 'var(--on-surface)',
                letterSpacing: '-0.01em',
              }}
            >
              Ask Mage
            </span>
            <span style={{ display: 'block', fontSize: '12px', color: 'var(--on-surface-variant)' }}>
              {subtitle}
            </span>
          </span>
        </div>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            className="qmage-action"
            onClick={a.onClick}
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'var(--nm-primary-light)',
              color: 'var(--nm-primary-on-light)',
              fontSize: '13px',
              fontWeight: 700,
              textAlign: 'left',
              cursor: 'pointer',
              fontFamily: 'inherit',
              width: '100%',
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
    </>
  );
}

// ── Mission progress ──────────────────────────────────────────────────────

function StepMarker({ step, n }: { step: MissionStep; n: number }) {
  // done = filled green check · current = filled purple number · locked = outlined
  // grey number · finish = gold star. Mirrors the Figma rail markers.
  const base: React.CSSProperties = {
    width: '26px',
    height: '26px',
    borderRadius: 'var(--radius-full)',
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 800,
  };
  if (step.status === 'done') {
    return (
      <span style={{ ...base, background: 'var(--success)', color: 'var(--on-primary-container)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>
          check
        </span>
      </span>
    );
  }
  if (step.status === 'current') {
    return <span style={{ ...base, background: 'var(--nm-primary)', color: 'var(--on-primary-container)' }}>{n}</span>;
  }
  if (step.status === 'finish') {
    return (
      <span style={{ ...base, background: 'var(--nm-streak-soft)', color: 'var(--ultra-ink)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>
          star
        </span>
      </span>
    );
  }
  return (
    <span
      style={{
        ...base,
        background: 'transparent',
        border: '1.5px solid var(--quiz-card-border)',
        color: 'var(--on-surface-variant)',
      }}
    >
      {n}
    </span>
  );
}

const STATUS_LABEL: Record<MissionStep['status'], string> = {
  done: 'Done',
  current: 'In progress',
  locked: 'Locked',
  finish: 'Finish',
};

export function MissionProgress({
  steps,
  hideHeader = false,
}: {
  steps: MissionStep[];
  hideHeader?: boolean;
}) {
  const doneCount = steps.filter((s) => s.status === 'done').length;
  const trackable = steps.filter((s) => s.status !== 'finish').length || steps.length;
  return (
    <>
      {!hideHeader ? <CardHeader title="Mission progress" trailing={`${doneCount} / ${trackable}`} /> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {steps.map((step, i) => {
          const isCurrent = step.status === 'current';
          return (
            <div
              key={step.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '11px',
                padding: '7px 9px',
                borderRadius: 'var(--radius-md)',
                background: isCurrent ? 'var(--nm-primary-light)' : 'transparent',
              }}
            >
              <StepMarker step={step} n={i + 1} />
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: isCurrent ? 800 : 600,
                    color: step.status === 'locked' ? 'var(--on-surface-variant)' : 'var(--on-surface)',
                  }}
                >
                  {step.label}
                </span>
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--on-surface-variant)' }}>
                  {STATUS_LABEL[step.status]}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
