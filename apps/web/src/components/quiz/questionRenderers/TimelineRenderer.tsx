'use client';
// dnd-kit's useDraggable exposes `setNodeRef` callbacks and `isDragging`
// that are designed for render-time use. React 19's `react-hooks/refs`
// rule misfires on this standard API.
/* eslint-disable react-hooks/refs */

import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CheckCircle2, Lightbulb, XCircle, Calendar } from 'lucide-react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import type { TimelinePayload } from '@notemage/shared';
import { shuffleByKey } from './quizShuffle';
import type { QuestionProps } from './types';

function parseYearForSort(year: string): number {
  const trimmed = year.trim();
  const bceMatch = /^(-?\d+)\s*(?:bce|bc)$/i.exec(trimmed);
  if (bceMatch) return -Math.abs(parseInt(bceMatch[1], 10));
  const ceMatch = /^(-?\d+)\s*(?:ce|ad)$/i.exec(trimmed);
  if (ceMatch) return parseInt(ceMatch[1], 10);
  const direct = parseInt(trimmed, 10);
  if (Number.isFinite(direct)) return direct;
  return 0;
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
}: QuestionProps<TimelinePayload | null>) {
  const payload = question.payload;

  // Years are fixed on the axis (canonical, sorted ascending). Labels are
  // the draggable chips the learner has to place.
  const sortedEvents = useMemo(() => {
    if (!payload) return [];
    return [...payload.events].sort(
      (a, b) => parseYearForSort(a.year) - parseYearForSort(b.year)
    );
  }, [payload]);

  const shuffledLabels = useMemo(() => {
    const labels = sortedEvents.map((e) => e.label);
    if (labels.length <= 1) return labels;
    let shuffled = shuffleByKey(labels, question.id);
    for (let attempt = 1; attempt < 6 && shuffled.every((l, i) => l === labels[i]); attempt += 1) {
      shuffled = shuffleByKey(labels, `${question.id}#${attempt}`);
    }
    return shuffled;
  }, [sortedEvents, question.id]);

  // Live placements: year → label (or empty). On submit, becomes UserAnswer.
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
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } })
  );

  const placeLabelOnYear = (label: string, year: string) => {
    if (isAnswered || mode === 'review') return;
    setPlacements((prev) => {
      const next: Record<string, string> = { ...prev };
      for (const [y, l] of Object.entries(next)) {
        if (l === label) delete next[y];
      }
      const previousLabel = next[year];
      next[year] = label;
      // If something was already at this year, return it to the bank by
      // simply removing it from placements (it'll show up in remainingLabels).
      if (previousLabel && previousLabel !== label) {
        // already removed via overwrite — no extra work needed
      }
      return next;
    });
    setTappedLabel(null);
  };

  const unplaceYear = (year: string) => {
    if (isAnswered || mode === 'review') return;
    setPlacements((prev) => {
      if (!(year in prev)) return prev;
      const next = { ...prev };
      delete next[year];
      return next;
    });
  };

  const handleLabelTap = (label: string) => {
    if (mode !== 'quiz' || isAnswered) return;
    setTappedLabel(tappedLabel === label ? null : label);
  };

  const handleYearTap = (year: string) => {
    if (mode !== 'quiz' || isAnswered) return;
    if (tappedLabel) {
      placeLabelOnYear(tappedLabel, year);
    } else if (placements[year]) {
      unplaceYear(year);
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
    if (!overId.startsWith('year-')) return;
    const year = overId.slice('year-'.length);
    placeLabelOnYear(label, year);
  };

  const allPlaced =
    sortedEvents.length > 0 &&
    sortedEvents.every((e) => typeof effectivePlacements[e.year] === 'string');

  const isCorrect = useMemo(() => {
    if (sortedEvents.length === 0) return false;
    return sortedEvents.every((e) => effectivePlacements[e.year] === e.label);
  }, [sortedEvents, effectivePlacements]);

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
          background: '#000000',
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
            color: '#c4a9ff',
            fontFamily: 'inherit',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          <Calendar size={12} /> Drag each label onto its year
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
                color: 'rgba(237,233,255,0.5)',
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
            background: 'rgba(0,0,0,0.35)',
            marginBottom: '16px',
          }}
        >
          {sortedEvents.map((event) => {
            const placedLabel = effectivePlacements[event.year];
            const correctAtYear = showResults ? placedLabel === event.label : null;
            return (
              <YearSlot
                key={event.year}
                year={event.year}
                placedLabel={placedLabel}
                disabled={mode === 'review' || isAnswered}
                showResult={correctAtYear}
                onTap={() => handleYearTap(event.year)}
                onUnplace={() => unplaceYear(event.year)}
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
          <button
            onClick={submit}
            disabled={!allPlaced}
            style={{
              padding: '10px 18px',
              borderRadius: '10px',
              border: 'none',
              background: allPlaced ? '#8c52ff' : 'rgba(140,82,255,0.18)',
              color: allPlaced ? 'var(--on-surface)' : 'rgba(237,233,255,0.4)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: allPlaced ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              boxShadow: allPlaced ? '0 4px 16px rgba(140,82,255,0.25)' : 'none',
              transition: 'background 0.15s, box-shadow 0.15s',
            }}
          >
            Submit timeline
          </button>
        </div>
      )}

      {question.hint && !isAnswered && mode === 'quiz' && (
        <button
          onClick={onToggleHint}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            borderRadius: '10px',
            border: '1px solid rgba(251,191,36,0.2)',
            background: showHint ? 'rgba(251,191,36,0.08)' : 'transparent',
            color: '#fbbf24',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: '12px',
            fontFamily: 'inherit',
            transition: 'background 0.12s',
          }}
        >
          <Lightbulb size={13} />
          {showHint ? 'Hide Hint' : 'Show Hint (H)'}
        </button>
      )}
      {showHint && question.hint && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '10px',
            background: 'rgba(251,191,36,0.06)',
            border: '1px solid rgba(251,191,36,0.15)',
            fontSize: '13px',
            color: 'rgba(251,191,36,0.8)',
            marginBottom: '12px',
            lineHeight: 1.6,
          }}
        >
          {question.hint}
        </div>
      )}

      {showResults && (
        <div
          style={{
            padding: '14px 18px',
            borderRadius: '12px',
            background: isCorrect ? 'rgba(74,222,128,0.06)' : 'rgba(252,165,165,0.06)',
            border: `1px solid ${isCorrect ? 'rgba(74,222,128,0.2)' : 'rgba(252,165,165,0.2)'}`,
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
              color: isCorrect ? '#4ade80' : '#fca5a5',
            }}
          >
            {isCorrect ? (
              <>
                <CheckCircle2 size={16} /> Timeline complete
              </>
            ) : (
              <>
                <XCircle size={16} /> Not quite
              </>
            )}
          </div>
          <div style={{ fontSize: '13px', color: 'rgba(237,233,255,0.7)', lineHeight: 1.6 }}>
            {isCorrect
              ? question.correctExplanation || 'Every event is on the right year.'
              : question.wrongExplanation ||
                `Correct order: ${sortedEvents
                  .map((e) => `${e.year} → ${e.label}`)
                  .join(' · ')}.`}
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
  onTap,
}: {
  label: string;
  tapped: boolean;
  disabled: boolean;
  onTap: () => void;
}) {
  const draggable = useDraggable({ id: label, disabled });
  const borderColor = tapped ? 'rgba(196,169,255,0.85)' : 'rgba(140,82,255,0.4)';
  const bg = tapped ? 'rgba(140,82,255,0.28)' : 'rgba(140,82,255,0.12)';
  const textColor = tapped ? '#ede4ff' : '#d6c2ff';
  return (
    <button
      ref={draggable.setNodeRef}
      {...draggable.attributes}
      {...draggable.listeners}
      onClick={onTap}
      disabled={disabled}
      style={{
        padding: '6px 14px',
        minHeight: '34px',
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
        color: '#ede4ff',
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
  year,
  placedLabel,
  disabled,
  showResult,
  onTap,
  onUnplace,
  correctLabel,
}: {
  year: string;
  placedLabel: string | undefined;
  disabled: boolean;
  showResult: boolean | null;
  onTap: () => void;
  onUnplace: () => void;
  correctLabel: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `year-${year}`, disabled });

  let labelBorder = 'rgba(140,82,255,0.45)';
  let labelBg = 'rgba(140,82,255,0.12)';
  let labelColor = '#ede4ff';
  if (showResult === true) {
    labelBorder = 'rgba(74,222,128,0.55)';
    labelBg = 'rgba(74,222,128,0.12)';
    labelColor = '#4ade80';
  } else if (showResult === false) {
    labelBorder = 'rgba(252,165,165,0.55)';
    labelBg = 'rgba(252,165,165,0.10)';
    labelColor = '#fca5a5';
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
          color: '#c4a9ff',
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
            padding: '5px 12px',
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
            color: 'rgba(237,233,255,0.35)',
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
            color: 'rgba(74,222,128,0.85)',
          }}
        >
          answer: {correctLabel}
        </span>
      )}
    </div>
  );
}
