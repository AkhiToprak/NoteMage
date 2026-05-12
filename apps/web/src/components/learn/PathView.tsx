'use client';

import Image from 'next/image';

// Phase 10.1 — Learn Path view. Visuals are kept minimal (existing styling)
// while the schema cuts over from materials to checkpoint slots. The full
// Duolingo-style redesign (sticky section banners, slot-kind icons, stars,
// completion ring, decorative mascots, drawer launch) lands in Phase 10.5.
// All visuals are inline-style + CSS custom properties so light-mode/dark-mode
// are driven by the theme tokens (per CLAUDE.md and the light-mode-no-light-
// text rule). No gradients anywhere.

export interface PathActivity {
  id: string;
  kind: string; // "theory" | "flashcards" | "quiz"
  title: string;
  sortOrder: number;
  completed: boolean;
  theoryId: string | null;
  flashcardSetId: string | null;
  quizSetId: string | null;
}

export interface PathSlot {
  id: string;
  title: string;
  kind: string; // "learning" | "review" | "assessment"
  sortOrder: number;
  starsEarned: number;
  prerequisiteSlotIds: string[];
  unlocked: boolean;
  completed: boolean;
  isActive: boolean;
  activities: PathActivity[];
}

export interface PathPhase {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
  status: string;
  gateStrategy: 'open' | 'sequential' | 'checkpoint';
  unlocked: boolean;
  unlockReason?: string;
  slots: PathSlot[];
}

export interface PathPlan {
  id: string;
  title: string;
  description: string | null;
  // Phase 9 — null when the path spans multiple notebooks (no primary home).
  notebookId: string | null;
  notebookTitle: string | null;
  phases: PathPhase[];
}

type NodeState = 'locked' | 'available' | 'active' | 'completed';

const SLOT_ICONS: Record<string, string> = {
  learning: 'auto_stories',
  review: 'replay',
  assessment: 'quiz',
};

function nodeState(slot: PathSlot): NodeState {
  if (slot.completed) return 'completed';
  if (!slot.unlocked) return 'locked';
  if (slot.isActive) return 'active';
  return 'available';
}

function PathLessonNode({
  state,
  slot,
  size,
  onClick,
}: {
  state: NodeState;
  slot: PathSlot;
  size: number;
  onClick: () => void;
}) {
  const isLocked = state === 'locked';
  const isCompleted = state === 'completed';
  const isActive = state === 'active';
  const isAssessment = slot.kind === 'assessment';

  const bg = isCompleted
    ? 'var(--primary)'
    : isLocked
      ? 'var(--surface-container-low)'
      : 'var(--surface-container)';
  const borderColor = isCompleted
    ? 'var(--primary)'
    : isLocked
      ? 'var(--outline-variant)'
      : 'var(--outline)';
  const iconColor = isCompleted
    ? 'var(--on-primary)'
    : isLocked
      ? 'var(--on-surface-variant)'
      : 'var(--on-surface)';

  return (
    <div
      style={{
        position: 'relative',
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      {isActive && (
        <span
          aria-hidden
          className="learn-path-pulse"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '3px solid var(--primary)',
            pointerEvents: 'none',
          }}
        />
      )}
      <button
        type="button"
        onClick={isLocked ? undefined : onClick}
        aria-label={`${slot.title}${isLocked ? ' (locked)' : ''}`}
        aria-disabled={isLocked || undefined}
        className="learn-path-node"
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          background: bg,
          border: `2px solid ${borderColor}`,
          cursor: isLocked ? 'default' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          fontFamily: 'inherit',
        }}
        onMouseEnter={(e) => {
          if (isLocked) return;
          if (
            typeof window !== 'undefined' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ) {
            return;
          }
          e.currentTarget.style.transform = 'scale(1.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        {isLocked ? (
          <Image
            src="/mascot/hide-behind-hat-v2.png"
            alt=""
            width={Math.round(size * 0.7)}
            height={Math.round(size * 0.7)}
            style={{ opacity: 0.85, pointerEvents: 'none' }}
          />
        ) : isAssessment && !isCompleted ? (
          <Image
            src="/mascot/graduation-v2.png"
            alt=""
            width={Math.round(size * 0.8)}
            height={Math.round(size * 0.8)}
            style={{ pointerEvents: 'none' }}
          />
        ) : isCompleted ? (
          <span
            className="material-symbols-outlined"
            style={{ fontSize: `${Math.round(size * 0.45)}px`, color: iconColor }}
          >
            check
          </span>
        ) : (
          <span
            className="material-symbols-outlined"
            style={{ fontSize: `${Math.round(size * 0.45)}px`, color: iconColor }}
          >
            {SLOT_ICONS[slot.kind] ?? 'school'}
          </span>
        )}
      </button>
    </div>
  );
}

export default function PathView({ plan }: { plan: PathPlan }) {
  // Phase 10.1 — slot tap is a no-op until the checkpoint drawer lands in
  // Phase 10.6. Wiring this up now would require a half-baked navigation
  // that 10.5/10.6 would have to rip out again.
  const handleSlotClick = (_slot: PathSlot) => {
    /* noop — drawer ships in Phase 10.6 */
  };

  return (
    <section
      style={{
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
        padding: '24px',
        marginBottom: '24px',
      }}
    >
      <style>{`
        @keyframes learnPathPulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.12); opacity: 0.55; }
          100% { transform: scale(1); opacity: 1; }
        }
        .learn-path-pulse {
          animation: learnPathPulse 1.6s cubic-bezier(0.22, 1, 0.36, 1) infinite;
        }
        .learn-path-node {
          transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
        }
        @media (prefers-reduced-motion: reduce) {
          .learn-path-pulse { animation: none; }
          .learn-path-node { transition: none; }
        }
      `}</style>

      <header style={{ marginBottom: '24px' }}>
        <p
          style={{
            margin: 0,
            fontSize: '12px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--on-surface-variant)',
          }}
        >
          {plan.notebookTitle ?? 'Cross-notebook'}
        </p>
        <h2
          style={{
            margin: '4px 0 0',
            fontFamily: 'var(--font-display)',
            fontSize: '22px',
            fontWeight: 700,
            color: 'var(--on-surface)',
            letterSpacing: '-0.01em',
          }}
        >
          {plan.title}
        </h2>
        {plan.description ? (
          <p
            style={{
              margin: '6px 0 0',
              fontSize: '14px',
              color: 'var(--on-surface-variant)',
              lineHeight: 1.5,
            }}
          >
            {plan.description}
          </p>
        ) : null}
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {plan.phases.map((phase, phaseIdx) => (
          <div
            key={phase.id}
            style={{
              background: 'var(--surface-container-low)',
              border: '1px solid var(--outline-variant)',
              borderRadius: 'var(--radius-lg)',
              padding: '20px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '20px',
              }}
            >
              <div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '11px',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--on-surface-variant)',
                  }}
                >
                  Section {phaseIdx + 1}
                </p>
                <h3
                  style={{
                    margin: '4px 0 0',
                    fontFamily: 'var(--font-display)',
                    fontSize: '17px',
                    fontWeight: 700,
                    color: 'var(--on-surface)',
                  }}
                >
                  {phase.title}
                </h3>
              </div>
              {!phase.unlocked ? (
                <span
                  style={{
                    fontSize: '12px',
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--surface-container)',
                    color: 'var(--on-surface-variant)',
                    border: '1px solid var(--outline-variant)',
                  }}
                >
                  Locked
                </span>
              ) : null}
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '20px',
              }}
            >
              {phase.slots.map((slot, idx) => {
                const state = nodeState(slot);
                const size = slot.kind === 'assessment' ? 96 : 72;
                // Alternate horizontal positions for the winding feel.
                const align =
                  idx % 3 === 0 ? 'flex-start' : idx % 3 === 1 ? 'center' : 'flex-end';
                return (
                  <div
                    key={slot.id}
                    style={{
                      width: '100%',
                      maxWidth: '320px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: align,
                      gap: '8px',
                    }}
                  >
                    <PathLessonNode
                      state={state}
                      slot={slot}
                      size={size}
                      onClick={() => handleSlotClick(slot)}
                    />
                    <p
                      style={{
                        margin: 0,
                        fontSize: '13px',
                        color:
                          state === 'locked'
                            ? 'var(--on-surface-variant)'
                            : 'var(--on-surface)',
                        textAlign:
                          align === 'flex-start'
                            ? 'left'
                            : align === 'flex-end'
                              ? 'right'
                              : 'center',
                        maxWidth: `${size + 80}px`,
                        lineHeight: 1.3,
                      }}
                    >
                      {slot.title}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
