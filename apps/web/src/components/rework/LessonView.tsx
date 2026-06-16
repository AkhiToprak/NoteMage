/* Hallmark · component: lesson-view · genre: playful-educational
 * states: default · hover · focus · active · disabled
 * contrast: pass (all text on surface tokens)
 */
'use client';

import * as React from 'react';
import Link from 'next/link';
import { Mascot } from '@/components/mascot/Mascot';
import { ProgressBar } from '@/components/rework/ProgressBar';
import { NMCard } from '@/components/rework/NMCard';
import { Button } from '@/components/ui/Button';
import { DifficultyBadge } from '@/components/rework/DifficultyBadge';
import { CelebrationToast } from '@/components/rework/CelebrationToast';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuickCheck {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export interface LessonContent {
  title: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  simple: string;
  why: string;
  example: string;
  examWording: string;
  commonMistake: string;
  quickCheck?: QuickCheck;
}

export interface LessonViewProps {
  lesson: LessonContent;
  index?: number;
  total?: number;
  onContinue?: () => void;
  backHref?: string;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--fs-xs)',
        fontWeight: 700,
        letterSpacing: '0.07em',
        color: 'var(--on-surface-variant)',
        textTransform: 'uppercase',
        margin: '0 0 8px',
      }}
    >
      {children}
    </p>
  );
}

function BodyProse({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--fs-md)',
        lineHeight: 'var(--lh-relaxed)',
        color: 'var(--on-surface)',
        margin: 0,
      }}
    >
      {children}
    </p>
  );
}

// ─── Quick-check option button ─────────────────────────────────────────────────

type OptionState = 'idle' | 'correct' | 'wrong' | 'correct-highlight';

function OptionButton({
  label,
  state,
  index,
  onSelect,
  answered,
}: {
  label: string;
  state: OptionState;
  index: number;
  onSelect: (i: number) => void;
  answered: boolean;
}) {
  const [hovered, setHovered] = React.useState(false);
  const [pressed, setPressed] = React.useState(false);

  const bg = React.useMemo(() => {
    if (state === 'correct') return 'var(--nm-complete-soft)';
    if (state === 'correct-highlight') return 'var(--nm-complete-soft)';
    if (state === 'wrong') return 'var(--nm-boss-soft)';
    if (hovered && !answered) return 'var(--ink-08)';
    return 'transparent';
  }, [state, hovered, answered]);

  const borderColor = React.useMemo(() => {
    if (state === 'correct' || state === 'correct-highlight') return 'var(--nm-complete)';
    if (state === 'wrong') return 'var(--nm-boss)';
    if (hovered && !answered) return 'var(--ink-12)';
    return 'var(--rule-hairline)';
  }, [state, hovered, answered]);

  const iconName =
    state === 'correct' || state === 'correct-highlight'
      ? 'check_circle'
      : state === 'wrong'
        ? 'cancel'
        : 'radio_button_unchecked';

  const iconColor =
    state === 'correct' || state === 'correct-highlight'
      ? 'var(--nm-complete)'
      : state === 'wrong'
        ? 'var(--nm-boss)'
        : 'var(--on-surface-variant)';

  return (
    <button
      type="button"
      disabled={answered}
      onClick={() => onSelect(index)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        minHeight: 48,
        padding: '12px 16px',
        background: bg,
        border: `1.5px solid ${borderColor}`,
        borderRadius: 'var(--radius-md)',
        cursor: answered ? 'default' : 'pointer',
        textAlign: 'left',
        transition: 'background var(--dur-fast) var(--ease-spring), border-color var(--dur-fast) var(--ease-spring), transform var(--dur-fast) var(--ease-spring)',
        transform: pressed && !answered ? 'scale(0.985)' : 'scale(1)',
        outline: 'none',
      }}
      onFocus={(e) => {
        (e.currentTarget as HTMLButtonElement).style.outline = '3px solid var(--accent-strong)';
        (e.currentTarget as HTMLButtonElement).style.outlineOffset = '2px';
      }}
      onBlur={(e) => {
        (e.currentTarget as HTMLButtonElement).style.outline = 'none';
      }}
    >
      <span
        className="material-symbols-outlined"
        aria-hidden
        style={{ fontSize: 20, color: iconColor, flexShrink: 0 }}
      >
        {iconName}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--fs-base)',
          color: 'var(--on-surface)',
          lineHeight: 1.4,
        }}
      >
        {label}
      </span>
    </button>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function LessonView({
  lesson,
  index,
  total,
  onContinue,
  backHref = '/my-path',
}: LessonViewProps) {
  const [saved, setSaved] = React.useState(false);
  const [selectedOption, setSelectedOption] = React.useState<number | null>(null);
  const [toastVisible, setToastVisible] = React.useState(false);
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const answered = selectedOption !== null;
  const progressValue =
    index != null && total != null && total > 0 ? (index / total) * 100 : 33;

  const handleContinue = React.useCallback(() => {
    if (onContinue) {
      onContinue();
    } else if (typeof window !== 'undefined') {
      window.location.href = '/my-path';
    }
  }, [onContinue]);

  const getOptionState = (i: number): OptionState => {
    if (selectedOption === null) return 'idle';
    const isCorrect = lesson.quickCheck?.answerIndex === i;
    if (i === selectedOption) return isCorrect ? 'correct' : 'wrong';
    if (isCorrect) return 'correct-highlight';
    return 'idle';
  };

  const isAnswerCorrect =
    answered && lesson.quickCheck?.answerIndex === selectedOption;

  const handleOptionSelect = React.useCallback((i: number) => {
    if (selectedOption !== null) return; // already answered, ignore
    setSelectedOption(i);
    const correct = lesson.quickCheck?.answerIndex === i;
    if (correct) {
      // Clear any existing timer before starting a new one
      if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
      setToastVisible(true);
      toastTimerRef.current = setTimeout(() => {
        setToastVisible(false);
        toastTimerRef.current = null;
      }, 3500);
    }
  }, [selectedOption, lesson.quickCheck?.answerIndex]);

  // Clear timer on unmount
  React.useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    };
  }, []);

  return (
    <div
      className="nm-rework"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--background)',
      }}
    >
      {/* ── Sticky top bar ── */}
      <div
        style={{
          flexShrink: 0,
          background: 'var(--surface)',
          borderBottom: '1px solid var(--rule-hairline)',
          zIndex: 10,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            height: 52,
            maxWidth: 'var(--reading-measure)',
            margin: '0 auto',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          {/* Back link */}
          <Link
            href={backHref}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              minWidth: 44,
              minHeight: 44,
              color: 'var(--on-surface-variant)',
              textDecoration: 'none',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--fs-sm)',
              fontWeight: 600,
              borderRadius: 'var(--radius-md)',
              padding: '0 8px',
              transition: 'color var(--dur-fast) var(--ease-spring)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--on-surface)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--on-surface-variant)')}
          >
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 20 }}>
              arrow_back
            </span>
            <span>Back</span>
          </Link>

          {/* Lesson counter */}
          {index != null && total != null ? (
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--fs-sm)',
                color: 'var(--on-surface-variant)',
                fontWeight: 600,
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
              }}
            >
              Lesson {index} of {total}
            </span>
          ) : null}

          {/* Save toggle */}
          <button
            type="button"
            aria-label={saved ? 'Unsave lesson' : 'Save lesson'}
            aria-pressed={saved}
            onClick={() => setSaved((s) => !s)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              minWidth: 44,
              minHeight: 44,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: saved ? 'var(--nm-boss)' : 'var(--on-surface-variant)',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--fs-sm)',
              fontWeight: 600,
              borderRadius: 'var(--radius-md)',
              padding: '0 8px',
              transition: 'color var(--dur-fast) var(--ease-spring), transform var(--dur-fast) var(--ease-spring)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
            }}
            onFocus={(e) => {
              (e.currentTarget as HTMLButtonElement).style.outline = '3px solid var(--accent-strong)';
              (e.currentTarget as HTMLButtonElement).style.outlineOffset = '2px';
            }}
            onBlur={(e) => {
              (e.currentTarget as HTMLButtonElement).style.outline = 'none';
            }}
          >
            <span
              className="material-symbols-outlined"
              aria-hidden
              style={{
                fontSize: 20,
                fontVariationSettings: saved ? "'FILL' 1" : "'FILL' 0",
              }}
            >
              favorite
            </span>
            <span>{saved ? 'Saved' : 'Save'}</span>
          </button>
        </div>

        {/* Progress bar flush under top bar */}
        <ProgressBar
          value={progressValue}
          height={3}
          color="var(--nm-lesson)"
          style={{ margin: 0 }}
        />
      </div>

      {/* ── Scrollable content ── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        <div
          style={{
            maxWidth: 'var(--reading-measure)',
            margin: '0 auto',
            padding: '32px 20px 120px',
            boxSizing: 'border-box',
          }}
        >
          {/* Title row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 16,
              marginBottom: 32,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--fs-2xl)',
                  fontWeight: 800,
                  lineHeight: 1.15,
                  color: 'var(--on-surface)',
                  margin: '0 0 8px',
                  letterSpacing: '-0.02em',
                }}
              >
                {lesson.title}
              </h1>
              {lesson.difficulty && (
                <DifficultyBadge level={lesson.difficulty} size="md" />
              )}
            </div>
            <div style={{ flexShrink: 0, marginTop: 2 }}>
              <Mascot
                pose="holding-scroll"
                size="sm"
                idle="sway"
                aria-hidden
              />
            </div>
          </div>

          {/* Simple explanation */}
          <section style={{ marginBottom: 28 }}>
            <SectionLabel>What it is</SectionLabel>
            <BodyProse>{lesson.simple}</BodyProse>
          </section>

          {/* Why it matters */}
          <section style={{ marginBottom: 28 }}>
            <SectionLabel>Why it matters</SectionLabel>
            <BodyProse>{lesson.why}</BodyProse>
          </section>

          {/* Example — NMCard soft tint */}
          <section style={{ marginBottom: 28 }}>
            <SectionLabel>Example</SectionLabel>
            <NMCard
              style={{
                background: 'var(--nm-lesson-soft)',
                border: '1px solid var(--nm-lesson)',
                borderRadius: 'var(--radius-xl)',
                padding: '20px 24px',
                boxShadow: 'none',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
              >
                <span
                  className="material-symbols-outlined"
                  aria-hidden
                  style={{
                    fontSize: 22,
                    color: 'var(--nm-lesson)',
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  science
                </span>
                <BodyProse>{lesson.example}</BodyProse>
              </div>
            </NMCard>
          </section>

          {/* Exam wording — quiz accent */}
          <section style={{ marginBottom: 28 }}>
            <SectionLabel>Exam wording</SectionLabel>
            <NMCard
              style={{
                background: 'var(--nm-quiz-soft)',
                border: '1px solid var(--nm-quiz)',
                borderRadius: 'var(--radius-xl)',
                padding: '20px 24px',
                boxShadow: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span
                  className="material-symbols-outlined"
                  aria-hidden
                  style={{
                    fontSize: 22,
                    color: 'var(--nm-quiz)',
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  format_quote
                </span>
                <p
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 'var(--fs-md)',
                    lineHeight: 'var(--lh-relaxed)',
                    color: 'var(--on-surface)',
                    margin: 0,
                    fontStyle: 'italic',
                  }}
                >
                  {lesson.examWording}
                </p>
              </div>
            </NMCard>
          </section>

          {/* Common mistake — boss/warning accent */}
          <section style={{ marginBottom: 36 }}>
            <SectionLabel>Common mistake</SectionLabel>
            <NMCard
              style={{
                background: 'var(--nm-boss-soft)',
                border: '1px solid var(--nm-boss)',
                borderRadius: 'var(--radius-xl)',
                padding: '20px 24px',
                boxShadow: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span
                  className="material-symbols-outlined"
                  aria-hidden
                  style={{
                    fontSize: 22,
                    color: 'var(--nm-boss)',
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  warning
                </span>
                <BodyProse>{lesson.commonMistake}</BodyProse>
              </div>
            </NMCard>
          </section>

          {/* Quick check */}
          {lesson.quickCheck && (
            <section>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                <span
                  className="material-symbols-outlined"
                  aria-hidden
                  style={{ fontSize: 20, color: 'var(--accent-strong)' }}
                >
                  quiz
                </span>
                <SectionLabel>Quick check</SectionLabel>
              </div>

              <p
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: 'var(--fs-base)',
                  fontWeight: 600,
                  color: 'var(--on-surface)',
                  margin: '0 0 16px',
                  lineHeight: 1.4,
                }}
              >
                {lesson.quickCheck.question}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {lesson.quickCheck.options.map((opt, i) => (
                  <OptionButton
                    key={i}
                    label={opt}
                    index={i}
                    state={getOptionState(i)}
                    answered={answered}
                    onSelect={handleOptionSelect}
                  />
                ))}
              </div>

              {/* Explanation reveal */}
              {answered && (
                <div
                  style={{
                    marginTop: 16,
                    padding: '16px 20px',
                    background: isAnswerCorrect
                      ? 'var(--nm-complete-soft)'
                      : 'var(--nm-boss-soft)',
                    border: `1.5px solid ${isAnswerCorrect ? 'var(--nm-complete)' : 'var(--nm-boss)'}`,
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    animation: 'lessonFadeUp var(--dur-normal) var(--ease-spring) both',
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    aria-hidden
                    style={{
                      fontSize: 20,
                      color: isAnswerCorrect ? 'var(--nm-complete)' : 'var(--nm-boss)',
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  >
                    {isAnswerCorrect ? 'check_circle' : 'info'}
                  </span>
                  <p
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 'var(--fs-sm)',
                      lineHeight: 1.55,
                      color: 'var(--on-surface)',
                      margin: 0,
                    }}
                  >
                    {lesson.quickCheck.explanation}
                  </p>
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {/* ── Sticky bottom bar ── */}
      <div
        style={{
          flexShrink: 0,
          background: 'var(--surface)',
          borderTop: '1px solid var(--rule-hairline)',
          padding: 'env(safe-area-inset-bottom, 0px) 0 0',
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: 'var(--reading-measure)',
            margin: '0 auto',
            padding: '12px 20px',
            boxSizing: 'border-box',
          }}
        >
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleContinue}
            trailingIcon="arrow_forward"
            haptic="success"
          >
            Continue
          </Button>
        </div>
      </div>

      {/* Keyframe for explanation reveal */}
      <style>{`
        @keyframes lessonFadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes lessonFadeUp {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
        }
      `}</style>

      {/* Celebration toast — shown fixed near bottom-center on correct answer */}
      <CelebrationToast
        title="Correct!"
        message="Nice — you've got this."
        visible={toastVisible}
        onClose={() => {
          setToastVisible(false);
          if (toastTimerRef.current !== null) {
            clearTimeout(toastTimerRef.current);
            toastTimerRef.current = null;
          }
        }}
        style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 60 }}
      />
    </div>
  );
}

export default LessonView;
