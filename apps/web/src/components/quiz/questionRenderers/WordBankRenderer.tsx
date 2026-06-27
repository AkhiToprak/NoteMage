'use client';
// dnd-kit's useDraggable/useDroppable expose `setNodeRef` callbacks and
// `isDragging`/`attributes`/`listeners` that are designed for render-time
// use. React 19's `react-hooks/refs` rule misfires on this standard API.
/* eslint-disable react-hooks/refs */

/* Hallmark · component: fill-the-blank (drag) quiz · genre: editorial · theme: project (cream / --nm-* + verdict tokens)
 * states: default · hover · focus-visible · active · dragging · over · disabled · correct · wrong
 * contrast: pass (uses --quiz-* / --surface-* / --on-surface / --nm-* / --verdict-* tokens — no inline hex)
 * Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4
 *
 * Figma redesign (Quiz screens · "Fill the Blank" — drag): a cream sentence
 * inset with inline purple word-pills and dashed "drop word" slots, a labelled
 * word bank whose placed words fade in place, and an "X of N blanks filled" +
 * Clear blanks footer. Body-only — the type badge, source chip and white card
 * come from QuestionCard. Tokens stay semantic so dark mode keeps working; the
 * still-mounted study-pack page keeps its own SubmitBar (externalChrome falsy).
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
  externalChrome,
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

  // Commit the current slot layout as the learner's answer. Triggered ONLY by
  // the explicit Submit button on the study-pack page; dragging tokens around
  // the template is free-play until the learner is happy with the layout.
  const submitAnswer = () => {
    if (isAnswered || mode === 'review') return;
    const slotAnswers = slotIds.map((id) => (id !== null ? tokenById.get(id)?.text ?? null : null));
    onSelectAnswer({ kind: 'word_bank', slotAnswers });
  };

  // Shell flow: stage the current slot layout continuously so the sticky
  // ActionBar "Check answer" can commit it; the internal SubmitBar is hidden.
  useEffect(() => {
    if (!externalChrome || isAnswered || mode !== 'quiz') return;
    onSelectAnswer({
      kind: 'word_bank',
      slotAnswers: slotIds.map((id) => (id !== null ? tokenById.get(id)?.text ?? null : null)),
    });
  }, [externalChrome, isAnswered, mode, slotIds, tokenById, onSelectAnswer]);

  const commitState = (nextBank: string[], nextSlots: (string | null)[]) => {
    setBankIds(nextBank);
    setSlotIds(nextSlots);
  };

  // Clear all blanks: return every placed token to the bank.
  const clearBlanks = () => {
    if (isAnswered || mode === 'review') return;
    const placed = slotIds.filter((id): id is string => id !== null);
    if (placed.length === 0) return;
    const nextBank = [...bankIds];
    for (const id of placed) if (!nextBank.includes(id)) nextBank.push(id);
    commitState(nextBank, Array(slotCount).fill(null));
    setTappedTokenId(null);
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

  const filledCount = slotIds.filter((id) => id !== null).length;
  const slotsFilled = slotCount > 0 && filledCount === slotCount;
  const showResults =
    mode === 'review' || (isAnswered && currentAnswer?.kind === 'word_bank');
  const locked = mode === 'review' || isAnswered;

  const slotCorrectness = useMemo(() => {
    if (!payload) return null;
    const slots = effectiveSlots;
    return payload.slots.map((s, i) =>
      slots[i] !== null && normalize(slots[i] as string) === normalize(s.correctAnswer)
    );
  }, [payload, effectiveSlots]);

  const allCorrect = slotCorrectness?.every(Boolean) ?? false;
  // Placed tokens render faded-in-place in the bank (Figma) — derive the set.
  const placedSet = useMemo(
    () => new Set(slotIds.filter((id): id is string => id !== null)),
    [slotIds]
  );

  return (
    <div style={{ width: '100%' }}>
      <style>{`
        .qwb-token:not(:disabled):hover { border-color: var(--nm-primary); }
        .qwb-token:not(:disabled):active { transform: translateY(1px); }
        .qwb-token:focus-visible, .qwb-slot:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
        .qwb-ctl:hover { border-color: var(--nm-primary); color: var(--nm-primary-on-light); }
        .qwb-ctl:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) {
          .qwb-token { transition: none; }
          .qwb-token:not(:disabled):active { transform: none; }
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
        <MarkdownRenderer content={substituteBlankMarker(question.question)} />
      </div>
      <p style={{ margin: '0 0 18px', fontSize: '14px', lineHeight: 1.5, color: 'var(--on-surface-variant)' }}>
        {coarsePointer ? 'Tap a word, then tap a blank.' : 'Drag the correct words into each blank.'}
      </p>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {/* Sentence with inline slots — cream inset. */}
        <div
          style={{
            padding: isPhone ? '16px 16px' : '20px 22px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--quiz-card-border)',
            background: 'var(--quiz-bg)',
            marginBottom: '20px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '7px',
            fontSize: '17px',
            color: 'var(--on-surface)',
            lineHeight: 1.9,
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
                disabled={locked}
                tapModeHint={tappedTokenId !== null}
                coarsePointer={coarsePointer}
              />
            );
          })}
        </div>

        {/* Word bank — placed words fade in place. */}
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
          Word bank
        </div>
        <BankZone disabled={locked}>
          {initialBank.map((token) => {
            if (placedSet.has(token.id)) {
              return <UsedChip key={token.id} text={token.text} coarsePointer={coarsePointer} />;
            }
            return (
              <BankToken
                key={token.id}
                id={token.id}
                text={token.text}
                disabled={locked}
                tapped={tappedTokenId === token.id}
                onTap={() => handleTokenTap(token.id)}
                coarsePointer={coarsePointer}
              />
            );
          })}
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

      {/* Footer: blanks-filled count + Clear blanks. */}
      {!locked && slotCount > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginTop: '14px',
            marginBottom: '6px',
            minHeight: '34px',
          }}
        >
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--on-surface-variant)' }}>
            {filledCount} of {slotCount} {slotCount === 1 ? 'blank' : 'blanks'} filled
          </span>
          {filledCount > 0 ? (
            <button
              type="button"
              className="qwb-ctl"
              onClick={clearBlanks}
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
              Clear blanks
            </button>
          ) : null}
        </div>
      )}

      {!externalChrome && !isAnswered && mode === 'quiz' && (
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
            padding: '16px 18px',
            borderRadius: 'var(--radius-md)',
            background: allCorrect
              ? 'rgb(var(--verdict-pass-rgb) / 0.08)'
              : 'rgb(var(--verdict-fail-rgb) / 0.08)',
            border: `1px solid ${
              allCorrect ? 'rgb(var(--verdict-pass-rgb) / 0.3)' : 'rgb(var(--verdict-fail-rgb) / 0.3)'
            }`,
            marginTop: '12px',
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
              color: allCorrect ? 'var(--success)' : 'var(--error)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
              {allCorrect ? 'check_circle' : 'cancel'}
            </span>
            {allCorrect ? 'Correct' : 'Not quite'}
          </div>
          <div style={{ fontSize: '14px', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
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
  const dashed = !tokenText;
  let borderColor = 'var(--nm-primary)';
  let bg = tokenText ? 'var(--nm-primary-light)' : 'transparent';
  let textColor = tokenText ? 'var(--nm-primary-on-light)' : 'var(--nm-primary-on-light)';

  if (showResult === true) {
    borderColor = 'rgb(var(--verdict-pass-rgb) / 0.6)';
    bg = 'rgb(var(--verdict-pass-rgb) / 0.12)';
    textColor = 'var(--success)';
  } else if (showResult === false) {
    borderColor = 'rgb(var(--verdict-fail-rgb) / 0.6)';
    bg = 'rgb(var(--verdict-fail-rgb) / 0.10)';
    textColor = 'var(--error)';
  } else if (isOver) {
    borderColor = 'var(--nm-primary)';
    bg = 'var(--nm-primary-light)';
  } else if (tapModeHint && !tokenText) {
    borderColor = 'var(--nm-primary)';
    bg = 'var(--nm-primary-light)';
  }

  // Render the placed token as a draggable so it can be re-dragged.
  const draggable = useDraggable({ id: tokenId ?? `empty-slot-${slotIndex}`, disabled: !tokenId || disabled });

  return (
    <span
      ref={setNodeRef}
      onClick={onTap}
      className="qwb-slot"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: tokenText ? '56px' : '88px',
        minHeight: coarsePointer ? '40px' : '34px',
        padding: coarsePointer ? '7px 16px' : '5px 14px',
        borderRadius: 'var(--radius-full)',
        border: `${dashed ? '1.5px dashed' : '1.5px solid'} ${borderColor}`,
        background: bg,
        color: textColor,
        fontSize: '15px',
        fontWeight: 700,
        fontFamily: 'inherit',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background-color 0.15s, border-color 0.15s',
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
        <span style={{ fontWeight: 600, opacity: 0.8 }}>drop word</span>
      )}
    </span>
  );
}

function BankZone({ children, disabled }: { children: React.ReactNode; disabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: BANK_ZONE_ID, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        padding: '14px',
        borderRadius: 'var(--radius-md)',
        border: `1px ${isOver ? 'solid var(--nm-primary)' : 'dashed var(--quiz-card-border)'}`,
        background: isOver ? 'var(--nm-primary-light)' : 'transparent',
        minHeight: '60px',
        transition: 'background-color 0.15s, border-color 0.15s',
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
      className="qwb-token"
      style={{
        padding: coarsePointer ? '10px 16px' : '8px 14px',
        minHeight: coarsePointer ? '44px' : '36px',
        borderRadius: 'var(--radius-full)',
        border: `1.5px solid ${tapped ? 'var(--nm-primary)' : 'transparent'}`,
        background: 'var(--nm-primary-light)',
        color: 'var(--nm-primary-on-light)',
        fontSize: '15px',
        fontWeight: 700,
        cursor: disabled ? 'default' : 'grab',
        fontFamily: 'inherit',
        opacity: draggable.isDragging ? 0.35 : 1,
        touchAction: 'none',
        transition: 'border-color 0.15s, transform 0.15s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {text}
    </button>
  );
}

// A placed word, shown faded in the bank where it used to sit (Figma).
function UsedChip({ text, coarsePointer }: { text: string; coarsePointer: boolean }) {
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
        fontSize: '15px',
        fontWeight: 600,
        fontFamily: 'inherit',
        opacity: 0.45,
      }}
    >
      {text}
    </span>
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
        padding: coarsePointer ? '10px 16px' : '8px 14px',
        minHeight: coarsePointer ? '44px' : '36px',
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 'var(--radius-full)',
        border: '1.5px solid var(--nm-primary)',
        background: 'var(--nm-primary)',
        color: 'var(--on-primary-container)',
        fontSize: '15px',
        fontWeight: 700,
        fontFamily: 'inherit',
        boxShadow: dragging ? '0 14px 30px rgb(124 92 255 / 0.4)' : 'none',
      }}
    >
      {text}
    </span>
  );
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}
