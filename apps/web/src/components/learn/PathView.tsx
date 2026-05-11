'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

// Phase 5 — Learn Path view. Renders one study plan as a vertical "Duolingo
// path" of lesson nodes. All visuals are inline-style + CSS custom properties
// so light-mode and dark-mode are driven by the theme tokens in globals.css —
// no hard-coded colors or gradients (per CLAUDE.md and the project's
// light-mode-no-light-text rule).

type MaterialType = 'page' | 'flashcard_set' | 'quiz_set' | 'document' | string;

export interface PathMaterial {
  id: string;
  type: MaterialType;
  referenceId: string;
  title: string;
  completed: boolean;
  sortOrder: number;
  unlocked: boolean;
  isCheckpoint: boolean;
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
  materials: PathMaterial[];
}

export interface PathPlan {
  id: string;
  title: string;
  description: string | null;
  notebookId: string;
  notebookTitle: string;
  phases: PathPhase[];
}

type NodeState = 'locked' | 'available' | 'active' | 'completed';

const MATERIAL_ICONS: Record<string, string> = {
  quiz_set: 'quiz',
  flashcard_set: 'style',
  page: 'description',
  document: 'article',
};

function findActiveMaterialId(phases: PathPhase[]): string | null {
  for (const phase of phases) {
    if (!phase.unlocked) continue;
    for (const m of phase.materials) {
      if (m.unlocked && !m.completed) return m.id;
    }
  }
  return null;
}

function nodeState(material: PathMaterial, activeId: string | null): NodeState {
  if (material.completed) return 'completed';
  if (!material.unlocked) return 'locked';
  if (material.id === activeId) return 'active';
  return 'available';
}

function navUrlFor(plan: PathPlan, material: PathMaterial): string | null {
  switch (material.type) {
    case 'quiz_set':
      return `/notebooks/${plan.notebookId}/quizzes/${material.referenceId}?material=${encodeURIComponent(material.id)}`;
    case 'flashcard_set':
      return `/notebooks/${plan.notebookId}/flashcards/${material.referenceId}`;
    case 'page':
      return `/notebooks/${plan.notebookId}/pages/${material.referenceId}`;
    case 'document':
      return `/notebooks/${plan.notebookId}`;
    default:
      return null;
  }
}

function PathLessonNode({
  state,
  material,
  size,
  onClick,
}: {
  state: NodeState;
  material: PathMaterial;
  size: number;
  onClick: () => void;
}) {
  const isLocked = state === 'locked';
  const isCompleted = state === 'completed';
  const isActive = state === 'active';
  const isCheckpoint = material.isCheckpoint;

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
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '3px solid var(--primary)',
            animation: 'learnPathPulse 1.6s cubic-bezier(0.22, 1, 0.36, 1) infinite',
            pointerEvents: 'none',
          }}
        />
      )}
      <button
        type="button"
        onClick={isLocked ? undefined : onClick}
        aria-label={`${material.title}${isLocked ? ' (locked)' : ''}`}
        aria-disabled={isLocked || undefined}
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
          transition: 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        onMouseEnter={(e) => {
          if (!isLocked) e.currentTarget.style.transform = 'scale(1.05)';
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
        ) : isCheckpoint ? (
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
            {MATERIAL_ICONS[material.type] ?? 'school'}
          </span>
        )}
      </button>
    </div>
  );
}

export default function PathView({ plan }: { plan: PathPlan }) {
  const router = useRouter();
  const activeMaterialId = useMemo(() => findActiveMaterialId(plan.phases), [plan.phases]);

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
          {plan.notebookTitle}
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
                  Phase {phaseIdx + 1}
                  {phase.gateStrategy === 'checkpoint' ? ' · checkpoint' : ''}
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
              {phase.materials.map((material, idx) => {
                const state = nodeState(material, activeMaterialId);
                const size = material.isCheckpoint ? 96 : 72;
                // Alternate horizontal positions for the winding feel.
                const align =
                  idx % 3 === 0 ? 'flex-start' : idx % 3 === 1 ? 'center' : 'flex-end';
                const url = navUrlFor(plan, material);
                return (
                  <div
                    key={material.id}
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
                      material={material}
                      size={size}
                      onClick={() => {
                        if (url) router.push(url);
                      }}
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
                      {material.title}
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
