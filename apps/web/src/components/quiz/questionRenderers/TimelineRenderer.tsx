'use client';
// dnd-kit's useDraggable exposes `setNodeRef` callbacks and `isDragging`
// that are designed for render-time use. React 19's `react-hooks/refs`
// rule misfires on this standard API.
/* eslint-disable react-hooks/refs */

import { useCallback, useMemo, useState } from 'react';
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
  const remainingLabels = shuffledLabels.filter((l) => !placedLabels.has(l));

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

  const showResults =
    mode === 'review' || (currentAnswer?.kind === 'timeline' && isAnswered);

  return (
    <div
      style={{
        width: '100%',
        maxWidth: isPhone ? '100%' : '640px',
        marginBottom: '20px',
      }}
    >
      <div
        style={{
          background: 'var(--quiz-question-surface)',
          border: '1px solid rgba(174,137,255,0.38)',
          borderRadius: '16px',
          padding: isPhone ? '20px 16px' : '28px 24px',
          marginBottom: '16px',
          boxShadow: '0 2px 14px rgba(0,0,0,0.55), inset 0 1px 0 rgba(196,169,255,0.10)',
        }}
      >
        <div style={{ fontSize: '18px', color: '#f5f1ff', lineHeight: 1.6 }}>
          <MarkdownRenderer content={question.question} />
        </div>
      </div>

      <div style={{ display: 'flex', marginBottom: '8px' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(140,82,255,0.12)',
            border: '1px solid rgba(140,82,255,0.3)',
            borderRadius: '999px',
            padding: '4px 12px',
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--accent-strong)',
            fontFamily: 'inherit',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>calendar_month</span> {coarsePointer ? 'Tap a label, then tap its year' : 'Drag each label onto its year'}
        </span>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {/* Label bank */}
        <div
          style={{
            padding: '14px 16px',
            borderRadius: '12px',
            border: '1px solid rgba(140,82,255,0.22)',
            background: 'rgba(140,82,255,0.05)',
            marginBottom: '14px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            minHeight: '52px',
          }}
        >
          {remainingLabels.length === 0 ? (
            <span
              style={{
                fontSize: '12px',
                color: 'var(--on-surface-variant)',
                fontStyle: 'italic',
                alignSelf: 'center',
              }}
            >
              All labels placed.
            </span>
          ) : (
            remainingLabels.map((label) => (
              <LabelChip
                key={label}
                label={label}
                tapped={tappedLabel === label}
                disabled={mode === 'review' || isAnswered}
                coarsePointer={coarsePointer}
                onTap={() => handleLabelTap(label)}
              />
            ))
          )}
        </div>

        {/* Timeline axis */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: '14px 14px',
            borderRadius: '12px',
            border: '1px solid rgba(174,137,255,0.22)',
            background: 'var(--surface-container)',
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
                onTap={() => handleSlotTap(slotKey)}
                onUnplace={() => unplaceSlot(slotKey)}
                correctLabel={mode === 'review' ? event.label : null}
              />
            );
          })}
        </div>

        <DragOverlay>
          {activeDragLabel ? <LabelChipPreview label={activeDragLabel} /> : null}
        </DragOverlay>
      </DndContext>

      {!isAnswered && mode === 'quiz' && (
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
            padding: '14px 18px',
            borderRadius: '12px',
            background: isCorrect ? 'rgb(var(--verdict-pass-rgb) / 0.06)' : 'rgb(var(--verdict-fail-rgb) / 0.06)',
            border: `1px solid ${isCorrect ? 'rgb(var(--verdict-pass-rgb) / 0.2)' : 'rgb(var(--verdict-fail-rgb) / 0.2)'}`,
            marginBottom: '12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
              fontWeight: 700,
              marginBottom: '6px',
              color: isCorrect ? 'var(--success)' : 'var(--error)',
            }}
          >
            {isCorrect ? (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>check_circle</span> Timeline complete
              </>
            ) : (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>cancel</span> Not quite
              </>
            )}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
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
  const borderColor = tapped ? 'rgba(196,169,255,0.85)' : 'rgba(140,82,255,0.4)';
  const bg = tapped ? 'rgba(140,82,255,0.28)' : 'rgba(140,82,255,0.12)';
  const textColor = tapped ? 'var(--on-surface)' : 'var(--on-surface-variant)';
  return (
    <button
      ref={draggable.setNodeRef}
      {...draggable.attributes}
      {...draggable.listeners}
      onClick={onTap}
      disabled={disabled}
      style={{
        padding: coarsePointer ? '10px 16px' : '6px 14px',
        minHeight: coarsePointer ? '44px' : '34px',
        borderRadius: '999px',
        border: `1px solid ${borderColor}`,
        background: bg,
        color: textColor,
        fontSize: '13px',
        fontWeight: 600,
        cursor: disabled ? 'default' : 'grab',
        fontFamily: 'inherit',
        opacity: draggable.isDragging ? 0.35 : 1,
        touchAction: 'none',
        transition: 'background 0.15s, border-color 0.15s, color 0.15s',
      }}
    >
      {label}
    </button>
  );
}

function LabelChipPreview({ label }: { label: string }) {
  return (
    <span
      style={{
        padding: '6px 14px',
        minHeight: '34px',
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: '999px',
        border: '1px solid rgba(196,169,255,0.85)',
        background: 'rgba(140,82,255,0.28)',
        color: 'var(--on-surface)',
        fontSize: '13px',
        fontWeight: 600,
        fontFamily: 'inherit',
        boxShadow: '0 12px 30px rgba(140,82,255,0.45)',
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
  onTap: () => void;
  onUnplace: () => void;
  correctLabel: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${slotKey}`, disabled });

  let labelBorder = 'rgba(140,82,255,0.45)';
  let labelBg = 'rgba(140,82,255,0.12)';
  let labelColor = 'var(--on-surface)';
  if (showResult === true) {
    labelBorder = 'rgb(var(--verdict-pass-rgb) / 0.55)';
    labelBg = 'rgb(var(--verdict-pass-rgb) / 0.12)';
    labelColor = 'var(--success)';
  } else if (showResult === false) {
    labelBorder = 'rgb(var(--verdict-fail-rgb) / 0.55)';
    labelBg = 'rgb(var(--verdict-fail-rgb) / 0.10)';
    labelColor = 'var(--error)';
  }

  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={disabled ? -1 : 0}
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
        borderRadius: '10px',
        border: `1px dashed ${isOver ? 'rgba(196,169,255,0.85)' : 'rgba(174,137,255,0.28)'}`,
        background: isOver ? 'rgba(140,82,255,0.10)' : 'transparent',
        minHeight: '44px',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background 0.12s, border-color 0.12s',
      }}
    >
      <span
        style={{
          minWidth: '72px',
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '13px',
          fontWeight: 700,
          color: 'var(--accent-strong)',
          letterSpacing: '0.04em',
        }}
      >
        {year}
      </span>
      {placedLabel ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) onUnplace();
          }}
          disabled={disabled}
          style={{
            padding: coarsePointer ? '10px 14px' : '5px 12px',
            minHeight: coarsePointer ? '44px' : undefined,
            borderRadius: '999px',
            border: `1px solid ${labelBorder}`,
            background: labelBg,
            color: labelColor,
            fontSize: '13px',
            fontWeight: 600,
            cursor: disabled ? 'default' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {placedLabel}
        </button>
      ) : (
        <span
          style={{
            fontSize: '12px',
            color: 'var(--on-surface-variant)',
            fontStyle: 'italic',
          }}
        >
          drop a label here
        </span>
      )}
      {correctLabel && showResult === false && (
        <span
          style={{
            marginLeft: 'auto',
            fontSize: '12px',
            color: 'var(--success)',
          }}
        >
          answer: {correctLabel}
        </span>
      )}
    </div>
  );
}
