'use client';
// SVG connection lines need DOM measurements + state, which means a
// layout-effect → setState pattern. React 19's
// `react-hooks/set-state-in-effect` rule flags this even though
// measurement-driven state is the correct idiom here.
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import type { MatchPairsPayload } from '@notemage/shared';
import { shuffleByKey } from './quizShuffle';
import type { QuestionProps, UserAnswer } from './types';

// Shuffling is deterministic per question id (see ./quizShuffle) so re-renders
// don't re-arrange items mid-quiz. The earlier local `hash("${key}:${i}")`
// implementation here was monotonic for ≤10 items, so right-column labels came
// out in their original order and the pairing was already solved — quizShuffle's
// Mulberry32 + Fisher-Yates fixes that.

interface Endpoint {
  x: number;
  y: number;
}

interface Line {
  leftIdx: number;
  rightIdx: number;
  a: Endpoint;
  b: Endpoint;
}

export default function MatchPairsRenderer({
  question,
  mode,
  isAnswered,
  currentAnswer,
  reviewAnswer,
  showHint,
  onToggleHint,
  onSelectAnswer,
  isPhone,
}: QuestionProps<MatchPairsPayload | null>) {
  const payload = question.payload;
  const pairs = useMemo(() => payload?.pairs ?? [], [payload]);

  const shuffledRights = useMemo(
    () => shuffleByKey(pairs.map((p) => p.right), question.id),
    [pairs, question.id]
  );

  // Shuffle the LEFT column too, independently from the right (different seed),
  // so the pairs aren't presented in the AI's generation order — that made the
  // matching predictable. We shuffle the INDICES, not the items, so each
  // rendered row keeps its payload index and the grader's `connections[].left`
  // index still matches `payload.pairs[left]`.
  const leftOrder = useMemo(
    () => shuffleByKey(pairs.map((_, i) => i), `${question.id}:left`),
    [pairs, question.id]
  );

  // Active interaction state: clicking a left then a right records a pair.
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);

  // Use the user answer as source of truth in review mode; otherwise read
  // from the active currentAnswer (which is what QuizViewer stored last).
  const sourceAnswer: UserAnswer | undefined = mode === 'review' ? reviewAnswer : currentAnswer;
  const connections = useMemo(
    () =>
      sourceAnswer && sourceAnswer.kind === 'match_pairs' ? sourceAnswer.connections : [],
    [sourceAnswer]
  );

  const leftRefs = useRef<Map<number, HTMLElement | null>>(new Map());
  const rightRefs = useRef<Map<number, HTMLElement | null>>(new Map());
  const containerRef = useRef<HTMLDivElement | null>(null);

  const setLeftRef = useCallback(
    (idx: number, el: HTMLElement | null) => {
      leftRefs.current.set(idx, el);
    },
    []
  );
  const setRightRef = useCallback(
    (idx: number, el: HTMLElement | null) => {
      rightRefs.current.set(idx, el);
    },
    []
  );

  const [lines, setLines] = useState<Line[]>([]);

  const recomputeLines = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();

    const next: Line[] = [];
    for (const c of connections) {
      const leftEl = leftRefs.current.get(c.left);
      const rightSlotIdx = shuffledRights.findIndex((label) => label === c.rightLabel);
      if (rightSlotIdx < 0) continue;
      const rightEl = rightRefs.current.get(rightSlotIdx);
      if (!leftEl || !rightEl) continue;
      const leftRect = leftEl.getBoundingClientRect();
      const rightRect = rightEl.getBoundingClientRect();
      next.push({
        leftIdx: c.left,
        rightIdx: rightSlotIdx,
        a: {
          x: leftRect.right - containerRect.left,
          y: leftRect.top + leftRect.height / 2 - containerRect.top,
        },
        b: {
          x: rightRect.left - containerRect.left,
          y: rightRect.top + rightRect.height / 2 - containerRect.top,
        },
      });
    }
    setLines(next);
  }, [connections, shuffledRights]);

  // Recompute on any layout or connection change.
  useLayoutEffect(() => {
    recomputeLines();
  }, [recomputeLines]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => recomputeLines());
    ro.observe(container);
    return () => ro.disconnect();
  }, [recomputeLines]);

  // Per-connection correctness lookup for the colored line + chip.
  const isConnectionCorrect = (leftIdx: number, rightLabel: string): boolean => {
    const expected = pairs[leftIdx];
    if (!expected) return false;
    return normalize(expected.right) === normalize(rightLabel);
  };

  const updateConnections = (
    nextConnections: { left: number; rightLabel: string }[]
  ) => {
    onSelectAnswer({ kind: 'match_pairs', connections: nextConnections });
  };

  const handleLeftClick = (leftIdx: number) => {
    if (mode !== 'quiz') return;
    // If this left is already connected, clicking it removes the connection.
    const existing = connections.find((c) => c.left === leftIdx);
    if (existing) {
      updateConnections(connections.filter((c) => c.left !== leftIdx));
      setSelectedLeft(null);
      return;
    }
    setSelectedLeft(leftIdx);
  };

  const handleRightClick = (rightSlotIdx: number) => {
    if (mode !== 'quiz') return;
    const rightLabel = shuffledRights[rightSlotIdx];
    if (rightLabel === undefined) return;

    // If this right is already connected, clicking it removes the connection.
    const existing = connections.find((c) => c.rightLabel === rightLabel);
    if (existing) {
      updateConnections(connections.filter((c) => c.rightLabel !== rightLabel));
      return;
    }
    if (selectedLeft === null) return;
    // Replace any previous connection from this left (defensive — left should
    // already have been removed by `handleLeftClick`'s toggle above).
    const filtered = connections.filter((c) => c.left !== selectedLeft);
    updateConnections([...filtered, { left: selectedLeft, rightLabel }]);
    setSelectedLeft(null);
  };

  const isLeftConnected = (leftIdx: number) => connections.some((c) => c.left === leftIdx);
  const isRightConnected = (rightSlotIdx: number) => {
    const label = shuffledRights[rightSlotIdx];
    return label !== undefined && connections.some((c) => c.rightLabel === label);
  };

  const showResults = mode === 'review' || (isAnswered && connections.length === pairs.length);

  return (
    <div
      style={{
        width: '100%',
        maxWidth: isPhone ? '100%' : '520px',
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

      {/* Pair canvas */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: '1fr 80px 1fr',
          gap: '10px',
          marginBottom: '14px',
        }}
      >
        {/* SVG connection overlay */}
        <svg
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        >
          {lines.map((line) => {
            const rightLabel = shuffledRights[line.rightIdx] ?? '';
            const correct = isConnectionCorrect(line.leftIdx, rightLabel);
            const stroke = showResults
              ? correct
                ? 'rgba(74,222,128,0.85)'
                : 'rgba(252,165,165,0.85)'
              : 'rgba(196,169,255,0.65)';
            return (
              <line
                key={`${line.leftIdx}-${line.rightIdx}`}
                x1={line.a.x}
                y1={line.a.y}
                x2={line.b.x}
                y2={line.b.y}
                stroke={stroke}
                strokeWidth={2.5}
                strokeLinecap="round"
                style={{ opacity: 0.95 }}
              />
            );
          })}
        </svg>

        {/* Left column (rendered in shuffled order; `i` stays the payload index) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {leftOrder.map((i) => {
            const p = pairs[i];
            if (!p) return null;
            return (
              <PairItem
                key={`left-${i}`}
                label={p.left}
                connected={isLeftConnected(i)}
                selected={selectedLeft === i}
                disabled={mode === 'review'}
                showResult={
                  showResults && isLeftConnected(i)
                    ? isConnectionCorrect(
                        i,
                        connections.find((c) => c.left === i)?.rightLabel ?? ''
                      )
                    : null
                }
                onClick={() => handleLeftClick(i)}
                refCallback={(el) => setLeftRef(i, el)}
                side="left"
              />
            );
          })}
        </div>

        {/* Center spacer (the SVG draws through this column) */}
        <div />

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {shuffledRights.map((label, slotIdx) => {
            const conn = connections.find((c) => c.rightLabel === label);
            const showRes =
              showResults && conn !== undefined
                ? isConnectionCorrect(conn.left, label)
                : null;
            return (
              <PairItem
                key={`right-${slotIdx}`}
                label={label}
                connected={isRightConnected(slotIdx)}
                selected={false}
                disabled={mode === 'review'}
                showResult={showRes}
                onClick={() => handleRightClick(slotIdx)}
                refCallback={(el) => setRightRef(slotIdx, el)}
                side="right"
              />
            );
          })}
        </div>
      </div>

      {/* Progress indicator while pairing */}
      {mode === 'quiz' && (
        <div
          style={{
            fontSize: '12px',
            color: 'var(--ink-30)',
            textAlign: 'center',
            marginBottom: '10px',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {connections.length} / {pairs.length} paired
          {selectedLeft !== null && ' — pick a match on the right'}
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
          <span className="material-symbols-outlined" style={{ fontSize: 13 }} aria-hidden>lightbulb</span>
          {showHint ? 'Hide Hint' : 'Show Hint'}
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
        <SummaryBanner
          allCorrect={connections.every((c) => isConnectionCorrect(c.left, c.rightLabel))}
          correctExplanation={question.correctExplanation}
          wrongExplanation={question.wrongExplanation}
          pairs={pairs}
        />
      )}
    </div>
  );
}

function PairItem({
  label,
  connected,
  selected,
  disabled,
  showResult,
  onClick,
  refCallback,
  side,
}: {
  label: string;
  connected: boolean;
  selected: boolean;
  disabled: boolean;
  showResult: boolean | null;
  onClick: () => void;
  refCallback: (el: HTMLElement | null) => void;
  side: 'left' | 'right';
}) {
  let borderColor = 'rgba(140,82,255,0.2)';
  let bg = 'rgba(255,255,255,0.05)';
  let textColor = 'rgba(237,233,255,0.85)';

  if (showResult === true) {
    borderColor = 'rgba(74,222,128,0.5)';
    bg = 'rgba(74,222,128,0.08)';
    textColor = '#4ade80';
  } else if (showResult === false) {
    borderColor = 'rgba(252,165,165,0.5)';
    bg = 'rgba(252,165,165,0.08)';
    textColor = '#fca5a5';
  } else if (selected) {
    borderColor = 'rgba(174,137,255,0.7)';
    bg = 'rgba(140,82,255,0.18)';
    textColor = '#ede4ff';
  } else if (connected) {
    borderColor = 'rgba(174,137,255,0.45)';
    bg = 'rgba(140,82,255,0.10)';
    textColor = '#d6c2ff';
  }

  return (
    <button
      ref={refCallback}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '12px 14px',
        minHeight: '44px',
        borderRadius: '12px',
        border: `1px solid ${borderColor}`,
        background: bg,
        color: textColor,
        fontSize: '14px',
        fontWeight: 500,
        cursor: disabled ? 'default' : 'pointer',
        textAlign: side === 'left' ? 'left' : 'right',
        fontFamily: 'inherit',
        lineHeight: 1.4,
        width: '100%',
        transition: 'background 0.15s, border-color 0.15s, color 0.15s',
      }}
    >
      {label}
    </button>
  );
}

function SummaryBanner({
  allCorrect,
  correctExplanation,
  wrongExplanation,
  pairs,
}: {
  allCorrect: boolean;
  correctExplanation: string | null;
  wrongExplanation: string | null;
  pairs: { left: string; right: string }[];
}) {
  return (
    <div
      style={{
        padding: '14px 18px',
        borderRadius: '12px',
        background: allCorrect ? 'rgba(74,222,128,0.06)' : 'rgba(252,165,165,0.06)',
        border: `1px solid ${allCorrect ? 'rgba(74,222,128,0.2)' : 'rgba(252,165,165,0.2)'}`,
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
          color: allCorrect ? '#4ade80' : '#fca5a5',
        }}
      >
        {allCorrect ? (
          <>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>check_circle</span> All pairs correct
          </>
        ) : (
          <>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>cancel</span> Some pairs were off
          </>
        )}
      </div>
      <div style={{ fontSize: '13px', color: 'rgba(237,233,255,0.6)', lineHeight: 1.6 }}>
        <MarkdownRenderer
          content={
            allCorrect
              ? correctExplanation || 'All terms matched their definitions.'
              : wrongExplanation ||
                `Correct pairings: ${pairs.map((p) => `${p.left} ↔ ${p.right}`).join('; ')}.`
          }
        />
      </div>
    </div>
  );
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}
