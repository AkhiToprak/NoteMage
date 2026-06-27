'use client';
// dnd-kit's useDraggable exposes `setNodeRef` callbacks and `isDragging`
// that are designed for render-time use. React 19's `react-hooks/refs`
// rule misfires on this standard API.
/* eslint-disable react-hooks/refs */

/* Hallmark · component: timeline-placement quiz · genre: editorial · theme: project (cream / --nm-* + verdict tokens)
 * states: default · hover · focus-visible · active · dragging · over · disabled · correct · wrong
 * contrast: pass (uses --surface-* / --on-surface / --nm-* / --verdict-* tokens — theme-flipping, no inline hex)
 * Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4
 *
 * Figma redesign (Quiz screens): cream event tiles placed onto timeline slots,
 * purple while placing, green/red on check. Body-only — badge/source/card from QuestionCard.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import type { TimelinePayload } from '@notemage/shared';
import HintButton from './HintButton';
import SubmitBar from './SubmitBar';
import { shuffleByKey } from './quizShuffle';
import { parseYearForSort } from '@/lib/timeline-sort';
import type { QuestionProps } from './types';

function normalizeStr(s: string): string {
  return s.trim().toLowerCase();
}

export default function TimelineRenderer({
  question,
  mode,
  isAnswered,
  currentAnswer,
  reviewAnswer,
  showHint,
  onToggleHint,
  onSelectAnswer,
  isPhone,
  coarsePointer,
  externalChrome,
}: QuestionProps<TimelinePayload | null>) {
  const payload = question.payload;

  // Years are fixed on the axis (canonical, sorted ascending). Labels are
  // the draggable chips the learner has to place. Each slot carries the
  // event's ORIGINAL payload index (`idx`) — slots are keyed by that index,
  // not by year, so two events sharing a year get two independent slots
  // instead of colliding on one `placements[year]` entry.
  const sortedEvents = useMemo(() => {
    if (!payload) return [];
    return payload.events
      .map((e, idx) => ({ year: e.year, label: e.label, idx }))
      .sort((a, b) => parseYearForSort(a.year) - parseYearForSort(b.year));
  }, [payload]);

  // label → canonical year, so same-year slots are interchangeable: a label
  // is "correct" in any slot whose year matches the label's true year.
  const labelToYear = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of payload?.events ?? []) m.set(normalizeStr(e.label), e.year);
    return m;
  }, [payload]);

  const labelFitsYear = useCallback(
    (label: string, year: string): boolean => {
      const canonical = labelToYear.get(normalizeStr(label));
      return canonical !== undefined && normalizeStr(canonical) === normalizeStr(year);
    },
    [labelToYear]
  );

  const shuffledLabels = useMemo(() => {
    const labels = sortedEvents.map((e) => e.label);
    if (labels.length <= 1) return labels;
    let shuffled = shuffleByKey(labels, question.id);
    for (let attempt = 1; attempt < 6 && shuffled.every((l, i) => l === labels[i]); attempt += 1) {
      shuffled = shuffleByKey(labels, `${question.id}#${attempt}`);
    }
    return shuffled;
  }, [sortedEvents, question.id]);

  // Live placements: slot index (as string) → label. Keyed by slot index, not
  // year, so two events on the same year stay independent. On submit, becomes
  // UserAnswer (the grader reads the same slot-index keys).
  const [placements, setPlacements] = useState<Record<string, string>>({});
  const [activeDragLabel, setActiveDragLabel] = useState<string | null>(null);
  const [tappedLabel, setTappedLabel] = useState<string | null>(null);

  const reviewPlacements: Record<string, string> | null =
    mode === 'review' && reviewAnswer?.kind === 'timeline'
      ? reviewAnswer.placements
      : null;

  const effectivePlacements: Record<string, string> =
    reviewPlacements ?? placements;

  const placedLabels = new Set(Object.values(effectivePlacements).filter((v) => v.length > 0));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    // Keyboard drag: tab to a label, Space to lift, arrows to move, Space to drop.
    useSensor(KeyboardSensor)
  );

  const placeLabelOnSlot = (label: string, slotKey: string) => {
    if (isAnswered || mode === 'review') return;
    setPlacements((prev) => {
      // Drop any prior placement of this label so it can't occupy two slots,
      // then drop it into the target slot — overwriting whatever was there,
      // which sends that previous label back to the bank.
      const next: Record<string, string> = {};
      for (const [k, l] of Object.entries(prev)) {
        if (l !== label) next[k] = l;
      }
      next[slotKey] = label;
      return next;
    });
    setTappedLabel(null);
  };

  const unplaceSlot = (slotKey: string) => {
    if (isAnswered || mode === 'review') return;
    setPlacements((prev) => {
      if (!(slotKey in prev)) return prev;
      const next = { ...prev };
      delete next[slotKey];
      return next;
    });
  };

  const handleLabelTap = (label: string) => {
    if (mode !== 'quiz' || isAnswered) return;
    setTappedLabel(tappedLabel === label ? null : label);
  };

  const handleSlotTap = (slotKey: string) => {
    if (mode !== 'quiz' || isAnswered) return;
    if (tappedLabel) {
      placeLabelOnSlot(tappedLabel, slotKey);
    } else if (placements[slotKey]) {
      unplaceSlot(slotKey);
    }
  };

  const handleDragStart = (e: DragStartEvent) => {
    setActiveDragLabel(String(e.active.id));
    setTappedLabel(null);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragLabel(null);
    if (mode !== 'quiz') return;
    if (!e.over) return;
    const label = String(e.active.id);
    const overId = String(e.over.id);
    if (!overId.startsWith('slot-')) return;
    const slotKey = overId.slice('slot-'.length);
    placeLabelOnSlot(label, slotKey);
  };

  const allPlaced =
    sortedEvents.length > 0 &&
    sortedEvents.every((e) => typeof effectivePlacements[String(e.idx)] === 'string');

  const isCorrect = useMemo(() => {
    if (sortedEvents.length === 0) return false;
    return sortedEvents.every((e) => {
      const placed = effectivePlacements[String(e.idx)];
      return typeof placed === 'string' && labelFitsYear(placed, e.year);
    });
  }, [sortedEvents, effectivePlacements, labelFitsYear]);

  const submit = () => {
    if (isAnswered || mode === 'review') return;
    if (!allPlaced) return;
    onSelectAnswer({ kind: 'timeline', placements });
  };

  // Shell flow: stage the current placements continuously so the sticky
  // ActionBar "Check answer" can commit it; the internal SubmitBar is hidden.
  useEffect(() => {
    if (!externalChrome || isAnswered || mode !== 'quiz') return;
    onSelectAnswer({ kind: 'timeline', placements });
  }, [externalChrome, isAnswered, mode, placements, onSelectAnswer]);

  const showResults =
    mode === 'review' || (currentAnswer?.kind === 'timeline' && isAnswered);

  const placedCount = Object.keys(placements).length;
  const totalCount = sortedEvents.length;

  return (
    <div style={{ width: '100%' }}>
      <style>{`
        .qtl-label:not(:disabled):hover { border-color: var(--nm-primary); }
        .qtl-label:not(:disabled):active { transform: translateY(1px); }
        .qtl-label:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
        .qtl-slot:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
        .qtl-placed:not(:disabled):hover { border-color: var(--nm-primary); }
        .qtl-ctl:hover { border-color: var(--nm-primary); color: var(--nm-primary-on-light); }
        .qtl-ctl:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) {
          .qtl-label { transition: none; }
          .qtl-label:not(:disabled):active { transform: none; }
        }
      `}</style>

      {/* Prompt — large display heading on the cream card. */}
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: isPhone ? '20px' : 'clamp(22px, 2.2vw, 28px)',
          fontWeight: 800,
          lineHeight: 1.25,
          letterSpacing: '-0.01em',
          color: 'var(--on-surface)',
          marginBottom: '6px',
        }}
      >
        <MarkdownRenderer content={question.question} />
      </div>
      <p style={{ margin: '0 0 18px', fontSize: '14px', lineHeight: 1.5, color: 'var(--on-surface-variant)' }}>
        {coarsePointer ? 'Tap a label, then tap its year.' : 'Drag each label onto its year.'}
      </p>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {/* Label bank — neutral surface, placed labels fade in place. */}
        <div
          style={{
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--on-surface-variant)',
            marginBottom: '10px',
          }}
        >
          Event labels
        </div>
        <div
          style={{
            padding: '14px',
            borderRadius: 'var(--radius-md)',
            border: '1px dashed var(--quiz-card-border)',
            background: 'transparent',
            marginBottom: '20px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            minHeight: '60px',
          }}
        >
          {shuffledLabels.map((label) => {
            const isPlaced = placedLabels.has(label);
            if (isPlaced) {
              return <UsedChip key={label} label={label} coarsePointer={coarsePointer} />;
            }
            return (
              <LabelChip
                key={label}
                label={label}
                tapped={tappedLabel === label}
                disabled={mode === 'review' || isAnswered}
                coarsePointer={coarsePointer}
                onTap={() => handleLabelTap(label)}
              />
            );
          })}
        </div>

        {/* Timeline axis — cream inset. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: isPhone ? '14px 12px' : '16px 14px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--quiz-card-border)',
            background: 'var(--quiz-bg)',
            marginBottom: '16px',
          }}
        >
          {sortedEvents.map((event) => {
            const slotKey = String(event.idx);
            const placedLabel = effectivePlacements[slotKey];
            const correctAtYear = showResults
              ? typeof placedLabel === 'string' && labelFitsYear(placedLabel, event.year)
              : null;
            return (
              <YearSlot
                key={slotKey}
                slotKey={slotKey}
                year={event.year}
                placedLabel={placedLabel}
                disabled={mode === 'review' || isAnswered}
                showResult={correctAtYear}
                coarsePointer={coarsePointer}
                tappedLabel={tappedLabel}
                onTap={() => handleSlotTap(slotKey)}
                onUnplace={() => unplaceSlot(slotKey)}
                correctLabel={mode === 'review' ? event.label : null}
              />
            );
          })}
        </div>

        <DragOverlay>
          {activeDragLabel ? <LabelChipPreview label={activeDragLabel} coarsePointer={coarsePointer} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Footer: placed count + Clear. */}
      {!isAnswered && mode === 'quiz' && totalCount > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '6px',
            minHeight: '34px',
          }}
        >
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--on-surface-variant)' }}>
            {placedCount} of {totalCount} {totalCount === 1 ? 'event' : 'events'} placed
          </span>
          {placedCount > 0 && (
            <button
              type="button"
              className="qtl-ctl"
              onClick={() => {
                if (isAnswered) return;
                setPlacements({});
                setTappedLabel(null);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--outline-variant)',
                background: 'var(--surface-container-lowest)',
                color: 'var(--on-surface-variant)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>
                backspace
              </span>
              Reset
            </button>
          )}
        </div>
      )}

      {!externalChrome && !isAnswered && mode === 'quiz' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
          <SubmitBar
            onClick={submit}
            disabled={!allPlaced}
            label="Submit timeline"
            isPhone={isPhone}
          />
        </div>
      )}

      <HintButton
        hint={question.hint}
        showHint={showHint}
        onToggle={onToggleHint}
        isAnswered={isAnswered}
        mode={mode}
        coarsePointer={coarsePointer}
      />

      {showResults && (
        <div
          style={{
            padding: '16px 18px',
            borderRadius: 'var(--radius-md)',
            background: isCorrect
              ? 'rgb(var(--verdict-pass-rgb) / 0.08)'
              : 'rgb(var(--verdict-fail-rgb) / 0.08)',
            border: `1px solid ${
              isCorrect
                ? 'rgb(var(--verdict-pass-rgb) / 0.3)'
                : 'rgb(var(--verdict-fail-rgb) / 0.3)'
            }`,
            marginTop: '4px',
            marginBottom: '12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '15px',
              fontWeight: 800,
              marginBottom: '6px',
              color: isCorrect ? 'var(--success)' : 'var(--error)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
              {isCorrect ? 'check_circle' : 'cancel'}
            </span>
            {isCorrect ? 'Timeline complete' : 'Not quite'}
          </div>
          <div style={{ fontSize: '14px', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
            <MarkdownRenderer
              content={
                isCorrect
                  ? question.correctExplanation || 'Every event is on the right year.'
                  : question.wrongExplanation ||
                    `Correct order: ${sortedEvents
                      .map((e) => `${e.year} → ${e.label}`)
                      .join(' · ')}.`
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

// A label chip in the bank that hasn't been placed yet — draggable + tappable.
function LabelChip({
  label,
  tapped,
  disabled,
  coarsePointer,
  onTap,
}: {
  label: string;
  tapped: boolean;
  disabled: boolean;
  coarsePointer: boolean;
  onTap: () => void;
}) {
  const draggable = useDraggable({ id: label, disabled });
  return (
    <button
      ref={draggable.setNodeRef}
      {...draggable.attributes}
      {...draggable.listeners}
      onClick={onTap}
      disabled={disabled}
      className="qtl-label"
      style={{
        padding: coarsePointer ? '10px 16px' : '8px 14px',
        minHeight: coarsePointer ? '44px' : '36px',
        borderRadius: 'var(--radius-full)',
        border: `1.5px solid ${tapped ? 'var(--nm-primary)' : 'transparent'}`,
        background: 'var(--nm-primary-light)',
        color: 'var(--nm-primary-on-light)',
        fontSize: '14px',
        fontWeight: 700,
        cursor: disabled ? 'default' : 'grab',
        fontFamily: 'inherit',
        opacity: draggable.isDragging ? 0.35 : 1,
        touchAction: 'none',
        transition: 'border-color 0.15s cubic-bezier(0.22, 1, 0.36, 1), transform 0.15s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {label}
    </button>
  );
}

// Ghost placeholder left in the bank where a placed label used to be.
function UsedChip({ label, coarsePointer }: { label: string; coarsePointer: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        padding: coarsePointer ? '10px 16px' : '8px 14px',
        minHeight: coarsePointer ? '44px' : '36px',
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 'var(--radius-full)',
        border: '1.5px dashed var(--quiz-card-border)',
        background: 'transparent',
        color: 'var(--on-surface-variant)',
        fontSize: '14px',
        fontWeight: 600,
        fontFamily: 'inherit',
        opacity: 0.45,
      }}
    >
      {label}
    </span>
  );
}

// Floating drag preview rendered by DragOverlay.
function LabelChipPreview({ label, coarsePointer }: { label: string; coarsePointer: boolean }) {
  return (
    <span
      style={{
        padding: coarsePointer ? '10px 16px' : '8px 14px',
        minHeight: coarsePointer ? '44px' : '36px',
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 'var(--radius-full)',
        border: '1.5px solid var(--nm-primary)',
        background: 'var(--nm-primary)',
        color: 'var(--on-primary-container)',
        fontSize: '14px',
        fontWeight: 700,
        fontFamily: 'inherit',
        boxShadow: '0 14px 30px rgb(124 92 255 / 0.4)',
      }}
    >
      {label}
    </span>
  );
}

function YearSlot({
  slotKey,
  year,
  placedLabel,
  disabled,
  showResult,
  coarsePointer,
  tappedLabel,
  onTap,
  onUnplace,
  correctLabel,
}: {
  slotKey: string;
  year: string;
  placedLabel: string | undefined;
  disabled: boolean;
  showResult: boolean | null;
  coarsePointer: boolean;
  tappedLabel: string | null;
  onTap: () => void;
  onUnplace: () => void;
  correctLabel: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${slotKey}`, disabled });

  // Determine slot drop-zone highlight (tap-mode: a label is selected and slot is empty).
  const tapHighlight = !disabled && tappedLabel !== null && !placedLabel;

  let slotBorder = isOver || tapHighlight ? 'var(--nm-primary)' : 'var(--outline-variant)';
  let slotBg = isOver || tapHighlight ? 'var(--nm-primary-light)' : 'transparent';
  const slotBorderStyle = placedLabel ? 'solid' : 'dashed';

  // Placed chip colors.
  let labelBorder = 'var(--nm-primary)';
  let labelBg = 'var(--nm-primary-light)';
  let labelColor = 'var(--nm-primary-on-light)';

  if (showResult === true) {
    slotBorder = 'rgb(var(--verdict-pass-rgb) / 0.55)';
    slotBg = 'rgb(var(--verdict-pass-rgb) / 0.08)';
    labelBorder = 'rgb(var(--verdict-pass-rgb) / 0.55)';
    labelBg = 'rgb(var(--verdict-pass-rgb) / 0.12)';
    labelColor = 'var(--success)';
  } else if (showResult === false) {
    slotBorder = 'rgb(var(--verdict-fail-rgb) / 0.55)';
    slotBg = 'rgb(var(--verdict-fail-rgb) / 0.06)';
    labelBorder = 'rgb(var(--verdict-fail-rgb) / 0.55)';
    labelBg = 'rgb(var(--verdict-fail-rgb) / 0.10)';
    labelColor = 'var(--error)';
  }

  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={disabled ? -1 : 0}
      className="qtl-slot"
      onClick={onTap}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTap();
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 12px',
        borderRadius: 'var(--radius-md)',
        border: `1px ${slotBorderStyle} ${slotBorder}`,
        background: slotBg,
        minHeight: '48px',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background-color 0.15s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.15s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {/* Year marker */}
      <span
        style={{
          minWidth: '72px',
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '13px',
          fontWeight: 700,
          color: 'var(--on-surface)',
          letterSpacing: '0.04em',
          flexShrink: 0,
        }}
      >
        {year}
      </span>

      {/* Placed label or empty drop hint */}
      {placedLabel ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) onUnplace();
          }}
          disabled={disabled}
          className="qtl-placed"
          style={{
            padding: coarsePointer ? '10px 14px' : '5px 12px',
            minHeight: coarsePointer ? '44px' : undefined,
            borderRadius: 'var(--radius-full)',
            border: `1.5px solid ${labelBorder}`,
            background: labelBg,
            color: labelColor,
            fontSize: '13px',
            fontWeight: 700,
            cursor: disabled ? 'default' : 'pointer',
            fontFamily: 'inherit',
            transition: 'border-color 0.15s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {placedLabel}
        </button>
      ) : (
        <span
          style={{
            fontSize: '13px',
            color: 'var(--on-surface-variant)',
            fontStyle: 'italic',
            opacity: 0.7,
          }}
        >
          drop a label here
        </span>
      )}

      {/* Correct answer reveal in review mode when wrong. */}
      {correctLabel && showResult === false && (
        <span
          style={{
            marginLeft: 'auto',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--success)',
            flexShrink: 0,
          }}
        >
          answer: {correctLabel}
        </span>
      )}
    </div>
  );
}
