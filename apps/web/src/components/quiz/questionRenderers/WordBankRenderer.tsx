'use client';
// dnd-kit's useDraggable/useDroppable expose `setNodeRef` callbacks and
// `isDragging`/`attributes`/`listeners` that are designed for render-time
// use. React 19's `react-hooks/refs` rule misfires on this standard API.
/* eslint-disable react-hooks/refs */

import { useMemo, useState } from 'react';
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
import type { WordBankPayload } from '@notemage/shared';
import { substituteBlankMarker } from './blankPlaceholder';
import HintButton from './HintButton';
import { shuffleByKey } from './quizShuffle';
import SubmitBar from './SubmitBar';
import type { QuestionProps } from './types';

// Stable per-token ids so duplicate words (e.g. "the" appearing twice) move
// independently. The id is derived from the initial bank position.
interface Token {
  id: string;
  text: string;
}

const BANK_ZONE_ID = 'word-bank-zone';

// Parse `{{0}}`, `{{1}}` ... markers into a sequence of segments. Odd-indexed
// entries (after a regex match) are slot indices; even ones are literal text.
function parseTemplate(template: string): Array<{ kind: 'text'; text: string } | { kind: 'slot'; index: number }> {
  const out: Array<{ kind: 'text'; text: string } | { kind: 'slot'; index: number }> = [];
  const re = /\{\{(\d+)\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(template)) !== null) {
    if (match.index > lastIndex) {
      out.push({ kind: 'text', text: template.slice(lastIndex, match.index) });
    }
    out.push({ kind: 'slot', index: parseInt(match[1], 10) });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < template.length) {
    out.push({ kind: 'text', text: template.slice(lastIndex) });
  }
  return out;
}

export default function WordBankRenderer({
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
}: QuestionProps<WordBankPayload | null>) {
  const payload = question.payload;
  const slotCount = payload?.slots.length ?? 0;
  const template = payload?.template ?? '';

  // Initial bank tokens (shuffled with stable per-question seed).
  const initialBank: Token[] = useMemo(() => {
    if (!payload) return [];
    const shuffled = shuffleByKey(payload.wordBank, question.id);
    return shuffled.map((text, i) => ({ id: `t${i}`, text }));
  }, [payload, question.id]);

  // Local state: bank order + per-slot token id (or null). QuizViewer keys
  // this component by `question.id`, so navigation between questions
  // unmounts/remounts the component — no manual reset needed.
  const [bankIds, setBankIds] = useState<string[]>(() => initialBank.map((t) => t.id));
  const [slotIds, setSlotIds] = useState<(string | null)[]>(() => Array(slotCount).fill(null));
  const [tappedTokenId, setTappedTokenId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // Build token-id → text lookup. Stable across the lifetime of this render
  // since initialBank is memoized by question.id.
  const tokenById = useMemo(() => {
    const m = new Map<string, Token>();
    for (const t of initialBank) m.set(t.id, t);
    return m;
  }, [initialBank]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    // Keyboard drag: tab to a word, Space to lift, arrows to move, Space to drop.
    useSensor(KeyboardSensor)
  );

  // Surface state for review mode: pull from reviewAnswer instead of local
  // state, since the user's stored answer is the truth.
  const reviewSlots: (string | null)[] | null =
    mode === 'review' && reviewAnswer?.kind === 'word_bank'
      ? reviewAnswer.slotAnswers
      : null;

  const effectiveSlots: (string | null)[] =
    reviewSlots !== null
      ? reviewSlots
      : slotIds.map((id) => (id !== null ? tokenById.get(id)?.text ?? null : null));

  // Commit the current slot layout as the learner's answer. Triggered
  // ONLY by the explicit Submit button — dragging tokens around the
  // template is free-play until the learner is happy with the layout.
  const submitAnswer = () => {
    if (isAnswered || mode === 'review') return;
    const slotAnswers = slotIds.map((id) => (id !== null ? tokenById.get(id)?.text ?? null : null));
    onSelectAnswer({ kind: 'word_bank', slotAnswers });
  };

  const commitState = (nextBank: string[], nextSlots: (string | null)[]) => {
    setBankIds(nextBank);
    setSlotIds(nextSlots);
  };

  const handleDragStart = (e: DragStartEvent) => {
    setActiveDragId(String(e.active.id));
    setTappedTokenId(null);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragId(null);
    if (mode !== 'quiz' || isAnswered) return;
    if (!e.over) return;

    const activeId = String(e.active.id);
    const overId = String(e.over.id);

    // Source: bank or slot-N? Identify by inspecting current state.
    const fromSlotIdx = slotIds.findIndex((id) => id === activeId);
    const fromBank = bankIds.includes(activeId);

    const nextBank = [...bankIds];
    const nextSlots = [...slotIds];

    if (overId === BANK_ZONE_ID) {
      // Drop into bank: return token from a slot to the bank. No-op if already in bank.
      if (fromSlotIdx >= 0) {
        nextSlots[fromSlotIdx] = null;
        if (!nextBank.includes(activeId)) nextBank.push(activeId);
        commitState(nextBank, nextSlots);
      }
      return;
    }

    // overId should be `slot-N`
    if (!overId.startsWith('slot-')) return;
    const destSlotIdx = parseInt(overId.slice('slot-'.length), 10);
    if (!Number.isInteger(destSlotIdx) || destSlotIdx < 0 || destSlotIdx >= slotCount) return;

    // If the destination slot already holds a token, move it to wherever the
    // active token came from (slot → swap; bank → return to bank).
    const displaced = nextSlots[destSlotIdx];
    nextSlots[destSlotIdx] = activeId;

    if (fromSlotIdx >= 0 && fromSlotIdx !== destSlotIdx) {
      nextSlots[fromSlotIdx] = displaced ?? null;
    } else if (fromBank) {
      const bankIdx = nextBank.indexOf(activeId);
      if (bankIdx >= 0) nextBank.splice(bankIdx, 1);
      if (displaced) nextBank.push(displaced);
    }
    commitState(nextBank, nextSlots);
  };

  // Tap-fallback flow: tap a token → select; tap a slot → place; tap a
  // placed token → return to bank.
  const handleTokenTap = (id: string) => {
    if (mode !== 'quiz' || isAnswered) return;
    setTappedTokenId(tappedTokenId === id ? null : id);
  };

  const handleSlotTap = (slotIdx: number) => {
    if (mode !== 'quiz' || isAnswered) return;
    const occupant = slotIds[slotIdx];
    if (occupant) {
      // Return to bank.
      const nextSlots = [...slotIds];
      nextSlots[slotIdx] = null;
      const nextBank = bankIds.includes(occupant) ? bankIds : [...bankIds, occupant];
      commitState(nextBank, nextSlots);
      setTappedTokenId(null);
      return;
    }
    if (!tappedTokenId) return;

    const fromSlotIdx = slotIds.findIndex((id) => id === tappedTokenId);
    const fromBank = bankIds.includes(tappedTokenId);
    const nextBank = [...bankIds];
    const nextSlots = [...slotIds];
    nextSlots[slotIdx] = tappedTokenId;
    if (fromSlotIdx >= 0) {
      nextSlots[fromSlotIdx] = null;
    } else if (fromBank) {
      const i = nextBank.indexOf(tappedTokenId);
      if (i >= 0) nextBank.splice(i, 1);
    }
    commitState(nextBank, nextSlots);
    setTappedTokenId(null);
  };

  const segments = useMemo(() => parseTemplate(template), [template]);

  const slotsFilled = slotIds.every((id) => id !== null);
  const showResults =
    mode === 'review' || (isAnswered && currentAnswer?.kind === 'word_bank');

  const slotCorrectness = useMemo(() => {
    if (!payload) return null;
    const slots = effectiveSlots;
    return payload.slots.map((s, i) =>
      slots[i] !== null && normalize(slots[i] as string) === normalize(s.correctAnswer)
    );
  }, [payload, effectiveSlots]);

  const allCorrect = slotCorrectness?.every(Boolean) ?? false;

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
          <MarkdownRenderer content={substituteBlankMarker(question.question)} />
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {coarsePointer && !isAnswered && mode === 'quiz' && (
          <div
            style={{
              fontSize: 12,
              color: 'var(--on-surface-variant)',
              marginBottom: '8px',
            }}
          >
            Tap a word, then tap a blank
          </div>
        )}
        {/* Template with inline slots */}
        <div
          style={{
            padding: isPhone ? '14px 14px' : '16px 18px',
            borderRadius: '14px',
            border: '1px solid rgba(140,82,255,0.22)',
            background: 'var(--ink-08)',
            marginBottom: '14px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '6px',
            fontSize: '16px',
            color: 'var(--on-surface)',
            lineHeight: 1.7,
          }}
        >
          {segments.map((seg, i) => {
            if (seg.kind === 'text') {
              return (
                <span key={`s-${i}`} style={{ whiteSpace: 'pre-wrap' }}>
                  {seg.text}
                </span>
              );
            }
            const tokenId = effectiveSlots[seg.index] !== null ? slotIds[seg.index] : null;
            const tokenText =
              reviewSlots !== null ? reviewSlots[seg.index] : tokenId ? tokenById.get(tokenId)?.text : null;
            const correct = slotCorrectness?.[seg.index] ?? null;
            return (
              <Slot
                key={`s-${i}`}
                slotIndex={seg.index}
                tokenText={tokenText ?? null}
                tokenId={tokenId}
                onTap={() => handleSlotTap(seg.index)}
                showResult={showResults ? correct : null}
                disabled={mode === 'review' || isAnswered}
                tapModeHint={tappedTokenId !== null}
                coarsePointer={coarsePointer}
              />
            );
          })}
        </div>

        {/* Word bank */}
        <BankZone disabled={mode === 'review' || isAnswered}>
          {bankIds.map((id) => {
            const token = tokenById.get(id);
            if (!token) return null;
            return (
              <BankToken
                key={id}
                id={id}
                text={token.text}
                disabled={mode === 'review' || isAnswered}
                tapped={tappedTokenId === id}
                onTap={() => handleTokenTap(id)}
                coarsePointer={coarsePointer}
              />
            );
          })}
          {bankIds.length === 0 && (
            <span
              style={{
                color: 'var(--on-surface-variant)',
                fontSize: '12px',
                fontStyle: 'italic',
                padding: '8px 4px',
              }}
            >
              All words placed.
            </span>
          )}
        </BankZone>

        <DragOverlay>
          {activeDragId
            ? (() => {
                const t = tokenById.get(activeDragId);
                if (!t) return null;
                return <TokenChip text={t.text} dragging coarsePointer={coarsePointer} />;
              })()
            : null}
        </DragOverlay>
      </DndContext>

      {!isAnswered && mode === 'quiz' && (
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: '12px' }}>
          <SubmitBar onClick={submitAnswer} disabled={!slotsFilled} isPhone={isPhone} />
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

      {showResults && payload && (
        <div
          style={{
            padding: '14px 18px',
            borderRadius: '12px',
            background: allCorrect ? 'rgb(var(--verdict-pass-rgb) / 0.06)' : 'rgb(var(--verdict-fail-rgb) / 0.06)',
            border: `1px solid ${allCorrect ? 'rgb(var(--verdict-pass-rgb) / 0.2)' : 'rgb(var(--verdict-fail-rgb) / 0.2)'}`,
            marginTop: '12px',
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
                <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>check_circle</span> All slots correct
              </>
            ) : (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>cancel</span> Some slots are off
              </>
            )}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
            <MarkdownRenderer
              content={
                allCorrect
                  ? question.correctExplanation || 'Every blank matched the expected word.'
                  : question.wrongExplanation ||
                    `Expected: ${payload.slots.map((s) => s.correctAnswer).join(', ')}.`
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Slot({
  slotIndex,
  tokenText,
  tokenId,
  onTap,
  showResult,
  disabled,
  tapModeHint,
  coarsePointer,
}: {
  slotIndex: number;
  tokenText: string | null;
  tokenId: string | null;
  onTap: () => void;
  showResult: boolean | null;
  disabled: boolean;
  tapModeHint: boolean;
  coarsePointer: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${slotIndex}` });
  let borderColor = 'rgba(140,82,255,0.45)';
  let bg = 'rgba(140,82,255,0.10)';
  let textColor = 'var(--on-surface-variant)';
  let dashed = !tokenText;

  if (tokenText) {
    dashed = false;
    borderColor = 'rgba(174,137,255,0.55)';
    bg = 'rgba(140,82,255,0.16)';
    textColor = 'var(--on-surface)';
  }
  if (showResult === true) {
    borderColor = 'rgb(var(--verdict-pass-rgb) / 0.55)';
    bg = 'rgb(var(--verdict-pass-rgb) / 0.10)';
    textColor = 'var(--success)';
  } else if (showResult === false) {
    borderColor = 'rgb(var(--verdict-fail-rgb) / 0.55)';
    bg = 'rgb(var(--verdict-fail-rgb) / 0.10)';
    textColor = 'var(--error)';
  } else if (isOver) {
    borderColor = 'rgba(196,169,255,0.85)';
    bg = 'rgba(140,82,255,0.22)';
  } else if (tapModeHint && !tokenText) {
    borderColor = 'rgba(196,169,255,0.7)';
  }

  // Render the placed token as a draggable so it can be re-dragged.
  const draggable = useDraggable({ id: tokenId ?? `empty-slot-${slotIndex}`, disabled: !tokenId || disabled });

  return (
    <span
      ref={setNodeRef}
      onClick={onTap}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '56px',
        minHeight: coarsePointer ? '44px' : '32px',
        padding: coarsePointer ? '8px 14px' : '4px 12px',
        borderRadius: '999px',
        border: `${dashed ? '1.5px dashed' : '1px solid'} ${borderColor}`,
        background: bg,
        color: textColor,
        fontSize: '14px',
        fontWeight: tokenText ? 600 : 500,
        fontFamily: 'inherit',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      {tokenText ? (
        <span
          ref={draggable.setNodeRef}
          {...draggable.attributes}
          {...draggable.listeners}
          style={{
            display: 'inline-flex',
            opacity: draggable.isDragging ? 0.35 : 1,
            touchAction: 'none',
          }}
        >
          {tokenText}
        </span>
      ) : (
        <span style={{ letterSpacing: '0.05em' }}>____</span>
      )}
    </span>
  );
}

function BankZone({
  children,
  disabled,
}: {
  children: React.ReactNode;
  disabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: BANK_ZONE_ID, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        padding: '14px',
        borderRadius: '14px',
        border: `1px ${isOver ? 'solid' : 'dashed'} ${
          isOver ? 'rgba(174,137,255,0.7)' : 'rgba(140,82,255,0.3)'
        }`,
        background: isOver ? 'rgba(140,82,255,0.10)' : 'var(--ink-08)',
        minHeight: '64px',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      {children}
    </div>
  );
}

function BankToken({
  id,
  text,
  disabled,
  tapped,
  onTap,
  coarsePointer,
}: {
  id: string;
  text: string;
  disabled: boolean;
  tapped: boolean;
  onTap: () => void;
  coarsePointer: boolean;
}) {
  const draggable = useDraggable({ id, disabled });
  return (
    <button
      ref={draggable.setNodeRef}
      {...draggable.attributes}
      {...draggable.listeners}
      onClick={onTap}
      disabled={disabled}
      style={{
        padding: coarsePointer ? '10px 14px' : '6px 12px',
        minHeight: coarsePointer ? '44px' : '32px',
        borderRadius: '999px',
        border: `1px solid ${tapped ? 'rgba(196,169,255,0.85)' : 'rgba(140,82,255,0.4)'}`,
        background: tapped ? 'rgba(140,82,255,0.28)' : 'rgba(140,82,255,0.12)',
        color: tapped ? 'var(--on-surface)' : 'var(--on-surface-variant)',
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

function TokenChip({
  text,
  dragging,
  coarsePointer,
}: {
  text: string;
  dragging?: boolean;
  coarsePointer?: boolean;
}) {
  return (
    <span
      style={{
        padding: coarsePointer ? '10px 14px' : '6px 12px',
        minHeight: coarsePointer ? '44px' : '32px',
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: '999px',
        border: '1px solid rgba(196,169,255,0.85)',
        background: 'rgba(140,82,255,0.28)',
        color: 'var(--on-surface)',
        fontSize: '14px',
        fontWeight: 600,
        fontFamily: 'inherit',
        boxShadow: dragging ? '0 12px 30px rgba(140,82,255,0.45)' : 'none',
      }}
    >
      {text}
    </span>
  );
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}
