'use client';

import { useMemo } from 'react';
import SectionBanner from '@/components/learn/SectionBanner';
import SlotNode from '@/components/learn/SlotNode';
import PathConnector from '@/components/learn/PathConnector';
import PathDecoration, { decorationsForSection } from '@/components/learn/PathDecorations';
import { sectionAverageGrade } from '@/lib/path-gating';
import { UltraBadge } from '@/components/learn/UltraBadge';

// Phase 10.5 — guided path view.
//
// Single vertical scroll column. Each phase ("section") renders a
// sticky banner that pins to the viewport top while the section's
// slots scroll past, followed by a winding column of slot nodes that
// alternate left / center / right via `idx % 3`. Decorative mascots
// drift in the column gutter every 3rd slot (PathDecorations) without
// intercepting clicks.
//
// All visuals stay inline-style + theme tokens — no gradients, no
// hex literals (per project memory: `feedback_no_gradients`,
// `feedback_light_mode_no_light_text`). Animations only touch
// `transform` + `opacity` and degrade to no-op under
// `prefers-reduced-motion`.

// ── DTO types (returned by /api/learn/paths + serializePath) ────────

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
  description?: string | null;
  kind: string; // "learning" | "review" | "assessment"
  sortOrder: number;
  starsEarned: number;
  bestPercentage: number | null;
  prerequisiteSlotIds: string[];
  unlocked: boolean;
  completed: boolean;
  /** Missing one or more expected activities — AI generation failed. */
  incompleteGeneration: boolean;
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
  notebookId: string | null;
  notebookTitle: string | null;
  ultra?: boolean;
  phases: PathPhase[];
}

type NodeState = 'locked' | 'available' | 'active' | 'completed';

function nodeStateFor(slot: PathSlot): NodeState {
  if (slot.completed) return 'completed';
  if (!slot.unlocked) return 'locked';
  if (slot.isActive) return 'active';
  return 'available';
}

// Alternate horizontal alignment for the winding-path feel. The
// `idx % 3` pattern is from the pre-redesign PathView and keeps the
// slot column visually rhythmic.
function alignmentFor(idx: number): 'flex-start' | 'center' | 'flex-end' {
  const mod = idx % 3;
  if (mod === 0) return 'flex-start';
  if (mod === 1) return 'center';
  return 'flex-end';
}

interface PathViewProps {
  plan: PathPlan;
  /**
   * Phase 10.6 — slot click handler. The detail page wires this up to
   * push `?slot=<id>` and open the CheckpointDrawer. The list page
   * leaves it undefined; PathView falls back to navigating to the
   * detail page so any list-page slot click still works.
   */
  onSlotClick?: (slot: PathSlot) => void;
}

export default function PathView({ plan, onSlotClick }: PathViewProps) {
  const handleSlotClick = useMemo(() => {
    return (slot: PathSlot) => {
      if (onSlotClick) {
        onSlotClick(slot);
        return;
      }
      // List-page fallback: navigate to the detail page with the slot
      // pre-opened. Using window.location keeps PathView a
      // self-contained component with no Next router dependency.
      if (typeof window !== 'undefined' && slot.unlocked) {
        const params = new URLSearchParams({ slot: slot.id });
        window.location.href = `/learn/paths/${encodeURIComponent(
          plan.id,
        )}?${params.toString()}`;
      }
    };
  }, [onSlotClick, plan.id]);

  return (
    <section
      style={{
        maxWidth: '640px',
        margin: '0 auto',
        padding: '0 16px',
      }}
    >
      {/* Plan header — quick at-a-glance heading above the first
          section banner. Stays in normal flow so it scrolls off
          while the section banner pins. */}
      <header style={{ margin: '0 4px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: '24px',
              fontWeight: 800,
              color: 'var(--on-surface)',
              letterSpacing: '-0.01em',
            }}
          >
            {plan.title}
          </h1>
          {plan.ultra && <UltraBadge />}
        </div>
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

      <style>{`
        @keyframes learnPathPulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.12); opacity: 0.6; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes learnPathSlotMount {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes learnPathStartBob {
          0% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
          100% { transform: translateY(0); }
        }
        .learn-path-start-bubble {
          animation: learnPathStartBob 1.4s cubic-bezier(0.22, 1, 0.36, 1) infinite;
        }
        .learn-path-slot-mount {
          animation: learnPathSlotMount 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .learn-path-node-btn {
          transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .learn-path-node-btn:hover:not([aria-disabled="true"]) {
          transform: scale(1.05);
        }
        .learn-path-node-btn:active:not([aria-disabled="true"]) {
          transform: scale(0.97);
        }
        .learn-path-node-btn:focus-visible {
          outline: 3px solid var(--primary);
          outline-offset: 4px;
        }
        @media (prefers-reduced-motion: reduce) {
          .learn-path-start-bubble,
          .learn-path-slot-mount {
            animation: none;
          }
          .learn-path-node-btn { transition: none; }
        }
      `}</style>

      {plan.phases.map((phase, phaseIdx) => {
        const spots = decorationsForSection(phase.slots.length, phaseIdx);
        const spotsAfter = new Map(spots.map((s) => [s.afterSlotIndex, s]));
        return (
          <div key={phase.id} style={{ position: 'relative' }}>
            <SectionBanner
              index={phaseIdx}
              title={phase.title}
              description={phase.description}
              notebookId={plan.notebookId}
              notebookTitle={plan.notebookTitle}
              unlocked={phase.unlocked}
              sectionGrade={sectionAverageGrade(phase.slots)}
            />

            {/* Section locked notice — sits below the (now greyed)
                banner. The previous section's assessment slot is the
                gate, so the copy points at it specifically. */}
            {!phase.unlocked ? (
              <p
                style={{
                  margin: '0 8px 12px',
                  fontSize: '13px',
                  color: 'var(--on-surface-variant)',
                  textAlign: 'center',
                }}
              >
                Locked — pass the previous section&apos;s assessment to unlock.
              </p>
            ) : null}

            {/* Slot column. position:relative scopes the absolutely
                positioned decorative mascots to this section. The column
                no longer carries a flex `gap` — vertical rhythm between
                slots is now produced by <PathConnector />, which doubles
                as the trail that fills with primary color as the learner
                progresses. */}
            <div
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                padding: '8px 0 16px',
              }}
            >
              {phase.slots.map((slot, idx) => {
                const align = alignmentFor(idx);
                const state = nodeStateFor(slot);
                const decoration = spotsAfter.get(idx);
                const isLast = idx === phase.slots.length - 1;
                return (
                  <div key={slot.id}>
                    <div
                      data-active-slot={state === 'active' ? 'true' : undefined}
                      style={{
                        display: 'flex',
                        justifyContent: align,
                        width: '100%',
                        padding: '0 8px',
                      }}
                    >
                      <SlotNode
                        slot={slot}
                        state={state}
                        mountIndex={idx}
                        onClick={() => handleSlotClick(slot)}
                      />
                    </div>
                    {!isLast ? (
                      <div style={{ position: 'relative' }}>
                        <PathConnector
                          fromAlign={align}
                          toAlign={alignmentFor(idx + 1)}
                          completed={state === 'completed'}
                          height={decoration ? 84 : 36}
                        />
                        {decoration ? <PathDecoration spot={decoration} /> : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {/* Section divider — small chip at the bottom of every
                section except the last. Subtle, no gradients. */}
            {phaseIdx < plan.phases.length - 1 ? (
              <div
                aria-hidden
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  margin: '16px 0 8px',
                  color: 'var(--on-surface-variant)',
                }}
              >
                <span
                  style={{
                    flex: 1,
                    height: '1px',
                    background: 'var(--outline-variant)',
                    maxWidth: '120px',
                  }}
                />
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '16px', opacity: 0.6 }}
                  aria-hidden
                >
                  flag
                </span>
                <span
                  style={{
                    flex: 1,
                    height: '1px',
                    background: 'var(--outline-variant)',
                    maxWidth: '120px',
                  }}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
