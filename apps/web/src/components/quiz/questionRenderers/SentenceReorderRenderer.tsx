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
import { CheckCircle2, Lightbulb, XCircle, ArrowDownUp } from 'lucide-react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import type { SentenceReorderPayload } from '@notemage/shared';
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
          <ArrowDownUp size={12} /> Drag to reorder
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
                <DropZone idx={i} disabled={mode === 'review' || isAnswered} />
                <ReorderToken
                  id={id}
                  text={token.text}
                  disabled={mode === 'review' || isAnswered}
                  tapped={tappedTokenId === id}
                  onTap={() => handleTokenTap(id)}
                  showResult={correctAtIdx}
                />
              </span>
            );
          })}
          <DropZone idx={order.length} disabled={mode === 'review' || isAnswered} />
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
          <button
            onClick={submit}
            style={{
              padding: '10px 18px',
              borderRadius: '10px',
              border: 'none',
              background: '#8c52ff',
              color: 'var(--on-surface)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              boxShadow: '0 4px 16px rgba(140,82,255,0.25)',
              transition: 'background 0.15s, box-shadow 0.15s',
            }}
          >
            Submit answer
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
                <CheckCircle2 size={16} /> Correct order
              </>
            ) : (
              <>
                <XCircle size={16} /> Not quite
              </>
            )}
          </div>
          <div style={{ fontSize: '13px', color: 'rgba(237,233,255,0.6)', lineHeight: 1.6 }}>
            {isCorrect
              ? question.correctExplanation || 'Every token is in the right place.'
              : question.wrongExplanation || `Correct order: ${correctOrder.join(' · ')}.`}
          </div>
        </div>
      )}
    </div>
  );
}

function DropZone({ idx, disabled }: { idx: number; disabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `drop-${idx}`, disabled });
  // Outer span = drop hit area (wide, transparent). Inner span = visual
  // indicator (narrow, tinted only when hovered). Splitting these lets us
  // keep a clean inline rhythm while giving the pointer a real target —
  // the original 4-pixel zone was effectively un-droppable mid-drag.
  return (
    <span
      ref={setNodeRef}
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '18px',
        height: '36px',
        margin: '0 -1px',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: isOver ? '6px' : '2px',
          height: '28px',
          borderRadius: '4px',
          background: isOver ? 'rgba(196,169,255,0.85)' : 'rgba(140,82,255,0.2)',
          transition: 'background 0.12s, width 0.12s',
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
}: {
  id: string;
  text: string;
  disabled: boolean;
  tapped: boolean;
  onTap: () => void;
  showResult: boolean | null;
}) {
  const draggable = useDraggable({ id, disabled });

  let borderColor = tapped ? 'rgba(196,169,255,0.85)' : 'rgba(140,82,255,0.4)';
  let bg = tapped ? 'rgba(140,82,255,0.28)' : 'rgba(140,82,255,0.12)';
  let textColor = tapped ? '#ede4ff' : '#d6c2ff';

  if (showResult === true) {
    borderColor = 'rgba(74,222,128,0.55)';
    bg = 'rgba(74,222,128,0.12)';
    textColor = '#4ade80';
  } else if (showResult === false) {
    borderColor = 'rgba(252,165,165,0.55)';
    bg = 'rgba(252,165,165,0.10)';
    textColor = '#fca5a5';
  }

  return (
    <button
      ref={draggable.setNodeRef}
      {...draggable.attributes}
      {...draggable.listeners}
      onClick={onTap}
      disabled={disabled}
      style={{
        padding: '6px 12px',
        minHeight: '32px',
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
        color: '#ede4ff',
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
