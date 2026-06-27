'use client';
// dnd-kit's useDraggable exposes `setNodeRef` callbacks and `isDragging`
// that are designed for render-time use. React 19's `react-hooks/refs`
// rule misfires on this standard API.
/* eslint-disable react-hooks/refs */

/* Hallmark · component: order-the-steps quiz rows · genre: editorial · theme: project (cream / --nm-* + verdict tokens)
 * states: default · hover · focus-visible · active · dragging · disabled · correct-place · wrong-place
 * contrast: pass (uses --surface-* / --on-surface / --nm-* / --verdict-* tokens — theme-flipping, no inline hex)
 * Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4
 *
 * Figma redesign (Quiz screens · "Order the Steps"): a vertical stack of step
 * cards, each with a circular position badge, the step text, and a drag handle.
 * After checking, correctly-placed rows read green and misplaced rows read amber
 * (warn), with an "X of N in the right place" footer + Reset order. Body-only:
 * the type badge, source chip and white card come from QuestionCard. Tokens stay
 * semantic so dark mode keeps working; the still-mounted study-pack page keeps
 * its own SubmitBar (externalChrome falsy → explicit submit, behaviour unchanged).
 */

import { useEffect, useMemo, useState } from 'react';
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
import type { SentenceReorderPayload } from '@notemage/shared';
import HintButton from './HintButton';
import SubmitBar from './SubmitBar';
import { shuffleByKey } from './quizShuffle';
import type { QuestionProps } from './types';

interface Token {
  id: string;
  text: string;
}

export default function SentenceReorderRenderer({
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
}: QuestionProps<SentenceReorderPayload | null>) {
  const payload = question.payload;
  const correctOrder = useMemo(() => payload?.correctOrder ?? [], [payload]);

  // Initial token list: stable per-id, shuffled by question key. Duplicates
  // are tracked independently via the id, not the text.
  const initialTokens: Token[] = useMemo(() => {
    if (!payload) return [];
    return correctOrder.map((text, i) => ({ id: `t${i}`, text }));
  }, [payload, correctOrder]);

  // QuizViewer keys this component by question.id, so navigation between
  // questions unmounts/remounts — no manual reset needed. Shuffle is
  // re-rolled with a salted key in the rare case the first roll matches
  // the source order (would leave the puzzle pre-solved). Memoized so the
  // "Reset order" affordance can restore it.
  const initialOrder = useMemo(() => {
    const ids = initialTokens.map((t) => t.id);
    if (ids.length <= 1) return ids;
    let shuffled = shuffleByKey(ids, question.id);
    for (let attempt = 1; attempt < 6 && shuffled.every((id, i) => id === ids[i]); attempt += 1) {
      shuffled = shuffleByKey(ids, `${question.id}#${attempt}`);
    }
    return shuffled;
  }, [initialTokens, question.id]);

  const [order, setOrder] = useState<string[]>(initialOrder);
  const [tappedTokenId, setTappedTokenId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const tokenById = useMemo(() => {
    const m = new Map<string, Token>();
    for (const t of initialTokens) m.set(t.id, t);
    return m;
  }, [initialTokens]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    // Keyboard drag: tab to a row, Space to lift, arrows to move, Space to drop.
    useSensor(KeyboardSensor)
  );

  // Review mode reads stored answer; live mode uses local order state.
  const reviewOrder: string[] | null =
    mode === 'review' && reviewAnswer?.kind === 'sentence_reorder'
      ? reviewAnswer.orderedTokens
      : null;

  const effectiveOrder: string[] =
    reviewOrder !== null ? reviewOrder : order.map((id) => tokenById.get(id)?.text ?? '');

  // Commit the current local order as the learner's answer. Triggered ONLY by
  // the explicit Submit button on the study-pack page; dragging is free-play
  // until the learner is happy with the arrangement.
  const submit = () => {
    if (isAnswered || mode === 'review') return;
    const orderedTokens = order.map((id) => tokenById.get(id)?.text ?? '');
    onSelectAnswer({ kind: 'sentence_reorder', orderedTokens });
  };

  // Shell flow: the sticky ActionBar "Check answer" commits the staged answer,
  // so stage the current arrangement continuously (incl. the initial shuffle on
  // mount, so the CTA is live immediately). No internal SubmitBar in this mode.
  useEffect(() => {
    if (!externalChrome || isAnswered || mode !== 'quiz') return;
    onSelectAnswer({
      kind: 'sentence_reorder',
      orderedTokens: order.map((id) => tokenById.get(id)?.text ?? ''),
    });
  }, [externalChrome, isAnswered, mode, order, tokenById, onSelectAnswer]);

  const resetOrder = () => {
    if (isAnswered || mode === 'review') return;
    setOrder(initialOrder);
    setTappedTokenId(null);
  };

  const moveToken = (sourceId: string, destIdx: number) => {
    if (isAnswered || mode === 'review') return;
    const sourceIdx = order.indexOf(sourceId);
    if (sourceIdx < 0) return;
    const next = [...order];
    next.splice(sourceIdx, 1);
    const adjustedDest = destIdx > sourceIdx ? destIdx - 1 : destIdx;
    next.splice(adjustedDest, 0, sourceId);
    setOrder(next);
  };

  const handleDragStart = (e: DragStartEvent) => {
    setActiveDragId(String(e.active.id));
    setTappedTokenId(null);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragId(null);
    if (mode !== 'quiz') return;
    if (!e.over) return;
    const activeId = String(e.active.id);
    const overId = String(e.over.id);
    if (!overId.startsWith('drop-')) return;
    const destIdx = parseInt(overId.slice('drop-'.length), 10);
    if (!Number.isInteger(destIdx)) return;
    moveToken(activeId, destIdx);
  };

  const handleTokenTap = (id: string) => {
    if (mode !== 'quiz' || isAnswered) return;
    if (tappedTokenId === id) {
      setTappedTokenId(null);
      return;
    }
    if (tappedTokenId === null) {
      setTappedTokenId(id);
      return;
    }
    // Two rows tapped: swap their positions. No auto-submit — the shell's
    // ActionBar (or the study-pack SubmitBar) locks in the answer.
    const next = [...order];
    const a = next.indexOf(tappedTokenId);
    const b = next.indexOf(id);
    if (a >= 0 && b >= 0) {
      [next[a], next[b]] = [next[b], next[a]];
      setOrder(next);
    }
    setTappedTokenId(null);
  };

  const isCorrect = useMemo(() => {
    if (correctOrder.length === 0) return false;
    if (effectiveOrder.length !== correctOrder.length) return false;
    return correctOrder.every((t, i) => t === effectiveOrder[i]);
  }, [correctOrder, effectiveOrder]);

  const showResults =
    mode === 'review' || (currentAnswer?.kind === 'sentence_reorder' && isAnswered);
  const locked = mode === 'review' || isAnswered;
  const correctCount = showResults
    ? effectiveOrder.filter((t, i) => t === correctOrder[i]).length
    : 0;

  return (
    <div style={{ width: '100%' }}>
      <style>{`
        .qord-row:not(:disabled):hover { border-color: var(--nm-primary); }
        .qord-row:not(:disabled):active { transform: translateY(1px); }
        .qord-row:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; border-color: var(--nm-primary); }
        .qord-reset:hover { border-color: var(--nm-primary); color: var(--nm-primary-on-light); }
        .qord-reset:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) {
          .qord-row { transition: none; }
          .qord-row:not(:disabled):active { transform: none; }
        }
      `}</style>

      {/* Prompt — large display heading on the white card. */}
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
        {coarsePointer ? 'Tap two cards to swap them.' : 'Drag the cards by the handle into the correct order.'}
      </p>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '14px' }}>
          {order.map((id, i) => {
            const token = tokenById.get(id);
            if (!token) return null;
            const correctAtIdx = showResults ? effectiveOrder[i] === correctOrder[i] : null;
            return (
              <span key={`g-${id}`} style={{ display: 'block' }}>
                <DropZone idx={i} disabled={locked} />
                <ReorderRow
                  id={id}
                  position={i + 1}
                  text={token.text}
                  disabled={locked}
                  tapped={tappedTokenId === id}
                  onTap={() => handleTokenTap(id)}
                  showResult={correctAtIdx}
                  isPhone={isPhone}
                  coarsePointer={coarsePointer}
                />
              </span>
            );
          })}
          <DropZone idx={order.length} disabled={locked} />
        </div>

        <DragOverlay>
          {activeDragId
            ? (() => {
                const t = tokenById.get(activeDragId);
                if (!t) return null;
                const pos = order.indexOf(activeDragId);
                return <RowChip text={t.text} position={pos >= 0 ? pos + 1 : 1} />;
              })()
            : null}
        </DragOverlay>
      </DndContext>

      {/* Footer: result count (post-check) + Reset order. */}
      {(showResults || (!locked && order.length > 1)) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginBottom: '14px',
            minHeight: '34px',
          }}
        >
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--on-surface-variant)' }}>
            {showResults ? `${correctCount} of ${correctOrder.length} in the right place` : ''}
          </span>
          {!locked && order.length > 1 ? (
            <button
              type="button"
              className="qord-reset"
              onClick={resetOrder}
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
                restart_alt
              </span>
              Reset order
            </button>
          ) : null}
        </div>
      )}

      {/* Study-pack page keeps its explicit Submit; the shell drives submit via
          its ActionBar, so the internal bar is suppressed there. */}
      {!externalChrome && !isAnswered && mode === 'quiz' && (
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '12px' }}>
          <SubmitBar onClick={submit} disabled={false} isPhone={isPhone} />
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
              isCorrect ? 'rgb(var(--verdict-pass-rgb) / 0.3)' : 'rgb(var(--verdict-fail-rgb) / 0.3)'
            }`,
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
            {isCorrect ? 'Correct order' : 'Not quite'}
          </div>
          <div style={{ fontSize: '14px', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
            <MarkdownRenderer
              content={
                isCorrect
                  ? question.correctExplanation || 'Every step is in the right place.'
                  : question.wrongExplanation || `Correct order: ${correctOrder.join(' · ')}.`
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Horizontal insertion indicator between rows. The outer span is the drop hit
// area (tall enough to catch a mid-drag pointer); the inner bar tints + grows
// only while hovered. Drop ids stay `drop-${idx}` so the move logic is unchanged.
function DropZone({ idx, disabled }: { idx: number; disabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `drop-${idx}`, disabled });
  return (
    <span
      ref={setNodeRef}
      aria-hidden
      style={{
        display: 'block',
        height: '10px',
        margin: '-1px 0',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <span
        style={{
          display: 'block',
          height: '3px',
          margin: '3.5px 8px',
          borderRadius: 'var(--radius-full)',
          background: isOver ? 'var(--nm-primary)' : 'transparent',
          transform: isOver ? 'scaleX(1)' : 'scaleX(0.4)',
          transformOrigin: 'center',
          transition: 'background 0.12s, transform 0.12s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      />
    </span>
  );
}

function ReorderRow({
  id,
  position,
  text,
  disabled,
  tapped,
  onTap,
  showResult,
  isPhone,
  coarsePointer,
}: {
  id: string;
  position: number;
  text: string;
  disabled: boolean;
  tapped: boolean;
  onTap: () => void;
  showResult: boolean | null;
  isPhone: boolean;
  coarsePointer: boolean;
}) {
  const draggable = useDraggable({ id, disabled });

  // Row variant → token-composed surfaces. Pre-check rows are neutral white
  // with a purple position badge; on tap-select they pick up the purple state.
  // After checking, green = correctly placed, amber (warn) = misplaced.
  let bg = 'var(--surface-container-lowest)';
  let borderColor = 'var(--outline-variant)';
  let edge = 'transparent';
  let badgeBg = 'var(--nm-primary-light)';
  let badgeColor = 'var(--nm-primary-on-light)';

  if (showResult === true) {
    bg = 'rgb(var(--verdict-pass-rgb) / 0.08)';
    borderColor = 'rgb(var(--verdict-pass-rgb) / 0.45)';
    edge = 'var(--success)';
    badgeBg = 'var(--success)';
    badgeColor = 'var(--on-primary-container)';
  } else if (showResult === false) {
    bg = 'rgb(var(--verdict-warn-rgb) / 0.10)';
    borderColor = 'rgb(var(--verdict-warn-rgb) / 0.45)';
    edge = 'var(--warning)';
    badgeBg = 'var(--warning)';
    badgeColor = 'var(--on-primary-container)';
  } else if (tapped) {
    bg = 'var(--nm-primary-light)';
    borderColor = 'var(--nm-primary)';
    edge = 'var(--nm-primary)';
    badgeBg = 'var(--nm-primary)';
    badgeColor = 'var(--on-primary-container)';
  }

  return (
    <button
      ref={draggable.setNodeRef}
      {...draggable.attributes}
      {...draggable.listeners}
      onClick={onTap}
      disabled={disabled}
      className="qord-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: isPhone ? '12px' : '14px',
        width: '100%',
        padding: isPhone ? '12px 14px' : '14px 16px',
        minHeight: coarsePointer ? '60px' : '54px',
        borderRadius: 'var(--radius-md)',
        border: `1.5px solid ${borderColor}`,
        borderLeft: `4px solid ${edge === 'transparent' ? borderColor : edge}`,
        background: bg,
        color: 'var(--on-surface)',
        textAlign: 'left',
        fontFamily: 'inherit',
        cursor: disabled ? 'default' : 'grab',
        opacity: draggable.isDragging ? 0.4 : 1,
        touchAction: 'none',
        transition:
          'background-color 0.18s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.18s cubic-bezier(0.22, 1, 0.36, 1), transform 0.18s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <span
        style={{
          width: '28px',
          height: '28px',
          borderRadius: 'var(--radius-full)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '13px',
          fontWeight: 800,
          flexShrink: 0,
          color: badgeColor,
          background: badgeBg,
          transition: 'background-color 0.18s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {position}
      </span>
      <span style={{ flex: 1, fontSize: '15px', lineHeight: 1.45 }}>
        <MarkdownRenderer content={text} />
      </span>
      {!disabled ? (
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 20, color: 'var(--on-surface-variant)', flexShrink: 0 }}
          aria-hidden
        >
          drag_indicator
        </span>
      ) : null}
    </button>
  );
}

function RowChip({ text, position }: { text: string; position: number }) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '14px 16px',
        minHeight: '54px',
        borderRadius: 'var(--radius-md)',
        border: '1.5px solid var(--nm-primary)',
        borderLeft: '4px solid var(--nm-primary)',
        background: 'var(--quiz-card)',
        color: 'var(--on-surface)',
        fontFamily: 'inherit',
        boxShadow: '0 14px 34px rgb(15 15 30 / 0.18)',
      }}
    >
      <span
        style={{
          width: '28px',
          height: '28px',
          borderRadius: 'var(--radius-full)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '13px',
          fontWeight: 800,
          flexShrink: 0,
          color: 'var(--on-primary-container)',
          background: 'var(--nm-primary)',
        }}
      >
        {position}
      </span>
      <span style={{ flex: 1, fontSize: '15px', lineHeight: 1.45 }}>{text}</span>
      <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--nm-primary)' }} aria-hidden>
        drag_indicator
      </span>
    </span>
  );
}
