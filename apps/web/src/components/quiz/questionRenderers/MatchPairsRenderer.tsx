'use client';
// SVG connection lines need DOM measurements + state, which means a
// layout-effect → setState pattern. React 19's
// `react-hooks/set-state-in-effect` rule flags this even though
// measurement-driven state is the correct idiom here.
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { haptics } from '@/lib/haptics';
import type { MatchPairsPayload } from '@notemage/shared';
import HintButton from './HintButton';
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
  coarsePointer,
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

  // Resolve a connection to its right-column SLOT index. New answers carry
  // `rightSlot` directly; historical answers (pre-slot model) only have
  // `rightLabel`, so fall back to the first matching slot. Keying the right
  // side by slot index — not by label text — is what lets two slots sharing
  // an identical value (e.g. two "1945" chips) be matched independently.
  const resolveSlot = useCallback(
    (c: { rightSlot?: number; rightLabel: string }) =>
      c.rightSlot ?? shuffledRights.findIndex((l) => l === c.rightLabel),
    [shuffledRights]
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
    // Touch pointers render the stacked layout (no SVG lines) — nothing to measure.
    if (coarsePointer) return;
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();

    const next: Line[] = [];
    for (const c of connections) {
      const leftEl = leftRefs.current.get(c.left);
      const rightSlotIdx = resolveSlot(c);
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
  }, [connections, resolveSlot, coarsePointer]);

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
    nextConnections: { left: number; rightSlot?: number; rightLabel: string }[]
  ) => {
    onSelectAnswer({ kind: 'match_pairs', connections: nextConnections });
  };

  const handleLeftClick = (leftIdx: number) => {
    if (mode !== 'quiz') return;
    haptics.select();
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
    haptics.select();
    const rightLabel = shuffledRights[rightSlotIdx];
    if (rightLabel === undefined) return;

    // If THIS slot is already connected, clicking it removes the connection.
    // Keyed by slot index, not label, so a duplicate-value slot toggles on its
    // own and doesn't disturb the other slot sharing the same text.
    const existing = connections.find((c) => resolveSlot(c) === rightSlotIdx);
    if (existing) {
      updateConnections(connections.filter((c) => resolveSlot(c) !== rightSlotIdx));
      return;
    }
    if (selectedLeft === null) return;
    // Replace any previous connection from this left (defensive — left should
    // already have been removed by `handleLeftClick`'s toggle above).
    const filtered = connections.filter((c) => c.left !== selectedLeft);
    updateConnections([...filtered, { left: selectedLeft, rightSlot: rightSlotIdx, rightLabel }]);
    setSelectedLeft(null);
  };

  const isLeftConnected = (leftIdx: number) => connections.some((c) => c.left === leftIdx);
  const isRightConnected = (rightSlotIdx: number) =>
    connections.some((c) => resolveSlot(c) === rightSlotIdx);

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

      {/* Pair canvas. Coarse pointers get a stacked tap-to-pair layout (no columns,
          no SVG lines — full-width rows that wrap, so long definitions never clip).
          Fine pointers keep the two-column + SVG-connector layout unchanged. */}
      {coarsePointer ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            marginBottom: '14px',
          }}
        >
          {/* Matched pairs collapse to the top as bound rows */}
          {connections.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {leftOrder
                .filter((i) => isLeftConnected(i))
                .map((i) => {
                  const conn = connections.find((c) => c.left === i);
                  const rightLabel = conn?.rightLabel ?? '';
                  return (
                    <MatchedRow
                      key={`matched-${i}`}
                      term={pairs[i]?.left ?? ''}
                      definition={rightLabel}
                      result={showResults ? isConnectionCorrect(i, rightLabel) : null}
                      canUnlink={mode === 'quiz'}
                      onUnlink={() => handleLeftClick(i)}
                    />
                  );
                })}
            </div>
          )}

          {/* Remaining terms + definitions to pair */}
          {(() => {
            const unmatchedLefts = leftOrder.filter((i) => !isLeftConnected(i));
            if (unmatchedLefts.length === 0) return null;
            // Consume each connection's own SLOT (not its label): when two pairs
            // share an identical definition, only the matched slot is removed so the
            // duplicate stays tappable (mirrors the fine-pointer branch, which renders
            // every slot). Removing by label would hide both and strand the second
            // term in an unpairable dead-end.
            const consumedSlots = new Set<number>();
            for (const c of connections) {
              const slotIdx = resolveSlot(c);
              if (slotIdx >= 0) consumedSlots.add(slotIdx);
            }
            const unmatchedRights = shuffledRights
              .map((label, slotIdx) => ({ label, slotIdx }))
              .filter(({ slotIdx }) => !consumedSlots.has(slotIdx));
            const needsTerm = mode === 'quiz' && selectedLeft === null;
            return (
              <>
                {mode === 'quiz' && (
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--on-surface-variant)',
                    }}
                  >
                    {selectedLeft !== null
                      ? 'Now tap its definition'
                      : 'Tap a term, then its definition'}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {unmatchedLefts.map((i) => (
                    <TapTile
                      key={`term-${i}`}
                      label={pairs[i]?.left ?? ''}
                      selected={selectedLeft === i}
                      disabled={mode === 'review'}
                      onClick={() =>
                        selectedLeft === i ? setSelectedLeft(null) : handleLeftClick(i)
                      }
                    />
                  ))}
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    opacity: needsTerm ? 0.55 : 1,
                    transition: 'opacity 0.15s',
                  }}
                >
                  {unmatchedRights.map(({ label, slotIdx }) => (
                    <TapTile
                      key={`def-${slotIdx}`}
                      label={label}
                      selected={false}
                      disabled={mode === 'review' || selectedLeft === null}
                      onClick={() => handleRightClick(slotIdx)}
                    />
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      ) : (
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
                ? 'rgb(var(--verdict-pass-rgb) / 0.85)'
                : 'rgb(var(--verdict-fail-rgb) / 0.85)'
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
            const conn = connections.find((c) => resolveSlot(c) === slotIdx);
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
      )}

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
          {selectedLeft !== null && ' — pick its match'}
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
  let bg = 'var(--surface-container)';
  let textColor = 'var(--on-surface)';

  if (showResult === true) {
    borderColor = 'rgb(var(--verdict-pass-rgb) / 0.5)';
    bg = 'rgb(var(--verdict-pass-rgb) / 0.08)';
    textColor = 'var(--success)';
  } else if (showResult === false) {
    borderColor = 'rgb(var(--verdict-fail-rgb) / 0.5)';
    bg = 'rgb(var(--verdict-fail-rgb) / 0.08)';
    textColor = 'var(--error)';
  } else if (selected) {
    borderColor = 'rgba(174,137,255,0.7)';
    bg = 'rgba(140,82,255,0.18)';
    textColor = 'var(--on-surface)';
  } else if (connected) {
    borderColor = 'rgba(174,137,255,0.45)';
    bg = 'rgba(140,82,255,0.10)';
    textColor = 'var(--on-surface-variant)';
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

// Full-width tappable tile for an unmatched term or definition (coarse-pointer layout).
function TapTile({
  label,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        minHeight: '52px',
        padding: '14px 16px',
        borderRadius: '12px',
        border: `1px solid ${selected ? 'rgba(174,137,255,0.7)' : 'rgba(140,82,255,0.2)'}`,
        background: selected ? 'rgba(140,82,255,0.18)' : 'var(--surface-container)',
        color: 'var(--on-surface)',
        fontSize: '15px',
        fontWeight: 500,
        lineHeight: 1.45,
        textAlign: 'left',
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'inherit',
        overflowWrap: 'anywhere',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      {label}
    </button>
  );
}

// A bound term↔definition pair in the coarse-pointer layout. In quiz mode it carries
// an unlink control; in review mode it shows a correctness icon and colour.
function MatchedRow({
  term,
  definition,
  result,
  canUnlink,
  onUnlink,
}: {
  term: string;
  definition: string;
  result: boolean | null;
  canUnlink: boolean;
  onUnlink: () => void;
}) {
  let borderColor = 'rgba(174,137,255,0.45)';
  let bg = 'rgba(140,82,255,0.10)';
  let accent = 'var(--on-surface-variant)';
  if (result === true) {
    borderColor = 'rgb(var(--verdict-pass-rgb) / 0.5)';
    bg = 'rgb(var(--verdict-pass-rgb) / 0.08)';
    accent = 'var(--success)';
  } else if (result === false) {
    borderColor = 'rgb(var(--verdict-fail-rgb) / 0.5)';
    bg = 'rgb(var(--verdict-fail-rgb) / 0.08)';
    accent = 'var(--error)';
  }
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        padding: '12px 12px 12px 14px',
        borderRadius: '12px',
        border: `1px solid ${borderColor}`,
        background: bg,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '15px',
            fontWeight: 600,
            color: 'var(--on-surface)',
            lineHeight: 1.4,
            overflowWrap: 'anywhere',
          }}
        >
          {term}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '4px',
            marginTop: '3px',
            fontSize: '13px',
            color: accent,
            lineHeight: 1.45,
            overflowWrap: 'anywhere',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 16, flexShrink: 0, marginTop: '1px' }}
            aria-hidden
          >
            subdirectory_arrow_right
          </span>
          <span style={{ minWidth: 0 }}>{definition}</span>
        </div>
      </div>
      {canUnlink ? (
        <button
          onClick={onUnlink}
          aria-label="Unlink pair"
          style={{
            flexShrink: 0,
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '10px',
            border: 'none',
            background: 'transparent',
            color: 'var(--on-surface-variant)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden>
            link_off
          </span>
        </button>
      ) : (
        result !== null && (
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 20, flexShrink: 0, color: accent, marginTop: '2px' }}
            aria-hidden
          >
            {result ? 'check_circle' : 'cancel'}
          </span>
        )
      )}
    </div>
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
        background: allCorrect ? 'rgb(var(--verdict-pass-rgb) / 0.06)' : 'rgb(var(--verdict-fail-rgb) / 0.06)',
        border: `1px solid ${allCorrect ? 'rgb(var(--verdict-pass-rgb) / 0.2)' : 'rgb(var(--verdict-fail-rgb) / 0.2)'}`,
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
          color: allCorrect ? 'var(--success)' : 'var(--error)',
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
      <div style={{ fontSize: '13px', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
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
