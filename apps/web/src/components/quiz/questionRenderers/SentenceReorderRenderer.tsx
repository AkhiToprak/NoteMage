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
  // the source order (would leave the puzzle pre-solved).
  const [order, setOrder] = useState<string[]>(() => {
    const ids = initialTokens.map((t) => t.id);
    if (ids.length <= 1) return ids;
    let shuffled = shuffleByKey(ids, question.id);
    for (let attempt = 1; attempt < 6 && shuffled.every((id, i) => id === ids[i]); attempt += 1) {
      shuffled = shuffleByKey(ids, `${question.id}#${attempt}`);
    }
    return shuffled;
  });
  const [tappedTokenId, setTappedTokenId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const tokenById = useMemo(() => {
    const m = new Map<string, Token>();
    for (const t of initialTokens) m.set(t.id, t);
    return m;
  }, [initialTokens]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } })
  );

  // Review mode reads stored answer; live mode uses local order state.
  const reviewOrder: string[] | null =
    mode === 'review' && reviewAnswer?.kind === 'sentence_reorder'
      ? reviewAnswer.orderedTokens
      : null;

  const effectiveOrder: string[] =
    reviewOrder !== null ? reviewOrder : order.map((id) => tokenById.get(id)?.text ?? '');

  // Commit the current local order as the learner's answer. Triggered
  // ONLY by the explicit Submit button — dragging is free-play until
  // the learner is happy with the arrangement.
  const submit = () => {
    if (isAnswered || mode === 'review') return;
    const orderedTokens = order.map((id) => tokenById.get(id)?.text ?? '');
    onSelectAnswer({ kind: 'sentence_reorder', orderedTokens });
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
    // Two tokens tapped: swap their positions. No auto-submit — the
    // learner must press the Submit button to lock in their answer.
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
          <span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>swap_vert</span>{' '}
          {coarsePointer ? 'Tap two tiles to swap' : 'Drag to reorder'}
        </span>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div
          style={{
            padding: isPhone ? '14px 14px' : '16px 18px',
            borderRadius: '14px',
            border: '1px solid rgba(140,82,255,0.22)',
            background: 'rgba(140,82,255,0.05)',
            marginBottom: '12px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {/* Insertion zones interleaved with tokens */}
          {order.map((id, i) => {
            const token = tokenById.get(id);
            if (!token) return null;
            const correctAtIdx = showResults
              ? effectiveOrder[i] === correctOrder[i]
              : null;
            return (
              <span key={`g-${id}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
                <DropZone
                  idx={i}
                  disabled={mode === 'review' || isAnswered}
                  coarsePointer={coarsePointer}
                />
                <ReorderToken
                  id={id}
                  text={token.text}
                  disabled={mode === 'review' || isAnswered}
                  tapped={tappedTokenId === id}
                  onTap={() => handleTokenTap(id)}
                  showResult={correctAtIdx}
                  coarsePointer={coarsePointer}
                />
              </span>
            );
          })}
          <DropZone
            idx={order.length}
            disabled={mode === 'review' || isAnswered}
            coarsePointer={coarsePointer}
          />
        </div>

        <DragOverlay>
          {activeDragId
            ? (() => {
                const t = tokenById.get(activeDragId);
                if (!t) return null;
                return <TokenChip text={t.text} />;
              })()
            : null}
        </DragOverlay>
      </DndContext>

      {!isAnswered && mode === 'quiz' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginBottom: '12px',
          }}
        >
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
              color: isCorrect ? 'var(--success)' : 'var(--error)',
            }}
          >
            {isCorrect ? (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>check_circle</span> Correct order
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
                  ? question.correctExplanation || 'Every token is in the right place.'
                  : question.wrongExplanation || `Correct order: ${correctOrder.join(' · ')}.`
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

function DropZone({
  idx,
  disabled,
  coarsePointer,
}: {
  idx: number;
  disabled: boolean;
  coarsePointer: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `drop-${idx}`, disabled });
  // Outer span = drop hit area (wide, transparent). Inner span = visual
  // indicator (narrow, tinted only when hovered). Splitting these lets us
  // keep a clean inline rhythm while giving the pointer a real target —
  // the original 4-pixel zone was effectively un-droppable mid-drag. On coarse
  // pointers the hit area grows to ≥44px to match the enlarged tokens.
  return (
    <span
      ref={setNodeRef}
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: coarsePointer ? '20px' : '18px',
        height: coarsePointer ? '44px' : '36px',
        margin: '0 -1px',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: '6px',
          height: coarsePointer ? '34px' : '28px',
          borderRadius: '4px',
          background: isOver ? 'rgba(196,169,255,0.85)' : 'rgba(140,82,255,0.2)',
          transform: isOver ? 'scaleX(1)' : 'scaleX(0.3333)',
          transformOrigin: 'center',
          transition: 'background 0.12s, transform 0.12s',
        }}
      />
    </span>
  );
}

function ReorderToken({
  id,
  text,
  disabled,
  tapped,
  onTap,
  showResult,
  coarsePointer,
}: {
  id: string;
  text: string;
  disabled: boolean;
  tapped: boolean;
  onTap: () => void;
  showResult: boolean | null;
  coarsePointer: boolean;
}) {
  const draggable = useDraggable({ id, disabled });

  let borderColor = tapped ? 'rgba(196,169,255,0.85)' : 'rgba(140,82,255,0.4)';
  let bg = tapped ? 'rgba(140,82,255,0.28)' : 'rgba(140,82,255,0.12)';
  let textColor = tapped ? 'var(--on-surface)' : 'var(--on-surface-variant)';

  if (showResult === true) {
    borderColor = 'rgba(74,222,128,0.55)';
    bg = 'rgba(74,222,128,0.12)';
    textColor = 'var(--success)';
  } else if (showResult === false) {
    borderColor = 'rgba(252,165,165,0.55)';
    bg = 'rgba(252,165,165,0.10)';
    textColor = 'var(--error)';
  }

  return (
    <button
      ref={draggable.setNodeRef}
      {...draggable.attributes}
      {...draggable.listeners}
      onClick={onTap}
      disabled={disabled}
      style={{
        padding: coarsePointer ? '8px 14px' : '6px 12px',
        minHeight: coarsePointer ? '44px' : '32px',
        borderRadius: '999px',
        border: `1px solid ${borderColor}`,
        background: bg,
        color: textColor,
        fontSize: '14px',
        fontWeight: 600,
        cursor: disabled ? 'default' : 'grab',
        fontFamily: 'inherit',
        opacity: draggable.isDragging ? 0.35 : 1,
        touchAction: 'none',
        transition: 'background 0.15s, border-color 0.15s, color 0.15s',
      }}
    >
      {text}
    </button>
  );
}

function TokenChip({ text }: { text: string }) {
  return (
    <span
      style={{
        padding: '6px 12px',
        minHeight: '32px',
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: '999px',
        border: '1px solid rgba(196,169,255,0.85)',
        background: 'rgba(140,82,255,0.28)',
        color: 'var(--on-surface)',
        fontSize: '14px',
        fontWeight: 600,
        fontFamily: 'inherit',
        boxShadow: '0 12px 30px rgba(140,82,255,0.45)',
      }}
    >
      {text}
    </span>
  );
}
