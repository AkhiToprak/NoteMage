'use client';

/* Hallmark · component: quiz player shell · genre: editorial · theme: project (cream / --quiz-* + --nm-* tokens)
 * states: back/CTA/secondary buttons all have hover · focus-visible · active · disabled
 * contrast: pass (semantic tokens only — theme-flipping cream↔navy, no inline hex)
 * Hallmark · pre-emit critique: P5 H5 E4 S4 R5 V4
 *
 * The immersive 3-zone quiz frame from the Figma "Quiz screens" redesign, shared
 * across path checkpoints, exams, and weakness practice:
 *   header (back · breadcrumb · title · step pill · progress)
 *   · content slot (QuestionCard wrapping the renderer)
 *   · right sidebar (Sources · Ask Mage · Mission progress)
 *   · sticky bottom action bar with the state-driven CTA.
 * Props-driven; QuizViewer reports session state up (external-chrome mode) and the
 * CTA calls back into it. Desktop = 3-zone; phone/tablet folds the sidebar into
 * collapsible accordions under the card.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import QuestionCard from './QuestionCard';
import { AskMageCard, MissionProgress, SidebarCard, SourcesPanel } from './panels';
import SourceReaderDrawer from './SourceReaderDrawer';
import { TimerBar, QuestionNavigator, type QuestionNavigatorItem } from '@/components/exam';
import { QUIZ_KIND_LABEL, type MageQuickAction, type MissionStep, type QuizSession, type QuizSource } from './types';

/** Mock-exam (timed, free-nav) chrome — the timer + navigator + submit-all the
 *  shell renders only in Phase 3 mock mode. All optional; absent for every other
 *  context, so the path/practice/exam-sim flows are untouched. */
export interface MockChrome {
  /** Countdown state; null = untimed (no timer rendered). */
  timer: { remainingSec: number; totalSec: number; paused?: boolean } | null;
  /** Navigator cells (answered / current / flagged / not-answered). */
  navigatorItems: QuestionNavigatorItem[];
  onJump: (index: number) => void;
  /** Current question flagged for review. */
  flagged: boolean;
  onToggleFlag: () => void;
  /** How many questions have a staged answer (drives the submit hint). */
  answeredCount: number;
  onSubmitAll: () => void;
  /** Disables Prev/Next + Submit once the mock is grading. */
  submitting?: boolean;
}

/** A footer action-bar pill. Used to override the default Ask Mage / Source /
 *  Mark-difficult trio — e.g. flashcards drive deck navigation ("Previous")
 *  from here. */
export interface ShellSecondaryAction {
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}

interface QuizPlayerShellProps {
  /** Crumbs, root → leaf, e.g. ['Biology Exam Prep', 'Cell Organelles']. */
  breadcrumb: string[];
  title: string;
  /** Right-side pill, e.g. 'Quick Check · Step 2 of 4'. */
  stepLabel?: string;
  session: QuizSession | null;
  /** Graded slot (assessment/final_exam): locked attempts, no per-question retry. */
  graded?: boolean;
  /** Sealed (exam) run: the CTA is "Submit answer" and no per-question verdict is
   *  shown — QuizViewer must be in `sealed` mode for the two to stay in lockstep. */
  sealed?: boolean;
  sources: QuizSource[];
  mission: MissionStep[];
  mageSubtitle: string;
  mageActions: MageQuickAction[];
  /** Per-question source chip in the card (Phase D fills the real provenance). */
  questionSource?: QuizSource;
  /** Noun for the mobile Sources accordion subtitle ("grounding this <noun>").
   *  Quizzes/exams/practice ground a question (default); theory grounds a lesson. */
  sourcesNoun?: string;
  /** Theory / non-quiz mode: render children directly — the activity supplies its
   *  own card (TheoryActivityCard) — instead of wrapping them in QuestionCard. */
  customCard?: boolean;
  /** Explicit action-bar CTA, overriding the session-driven one. The theory
   *  screen has no QuizSession, so it drives its "Continue" button this way. */
  primaryCta?: { label: string; onClick: () => void; disabled?: boolean } | null;
  /** Override the footer's default secondary pills (Ask Mage · Source · Mark
   *  difficult). When provided — even as [] — these replace the trio. Flashcards
   *  pass a "Previous" deck-nav pill; Ask Mage / Sources stay in the sidebar. */
  secondaryActions?: ShellSecondaryAction[];
  /** Hide the Mission-progress panel (sidebar card + mobile accordion). The
   *  flashcard deck has no per-slot mission rail, so it opts out. */
  hideMission?: boolean;
  /** Header progress segments when there's no QuizSession (theory mission step).
   *  The "Question N of M" count line stays session-only. */
  progress?: { current: number; total: number };
  /** Dialog aria-label; defaults to `<title> quiz`. Theory passes a lesson label. */
  ariaLabel?: string;
  /** Phase 3 — timed mock-exam chrome (timer · navigator · flag · submit-all).
   *  Present only for the mock run surface; absent everywhere else. */
  mock?: MockChrome | null;
  onAskMage: () => void;
  onShowSource?: () => void;
  onMarkDifficult?: () => void;
  onClose: () => void;
  /** Non-quiz body (loading skeleton / error / graded result): render children
   *  full-width with no sidebar and no action bar, keeping the cream frame. */
  bodyOnly?: boolean;
  /** The QuizViewer, rendered in external-chrome mode. */
  children: React.ReactNode;
}

type Cta = { label: string; onClick: () => void; disabled?: boolean } | null;

function ctaFor(session: QuizSession | null, graded: boolean, sealed: boolean): Cta {
  if (!session || session.mode === 'results') return null;
  if (session.mode === 'review') return null;
  // Sealed (exam) flow: a single "Submit answer" records the answer and moves on
  // WITHOUT revealing the verdict — QuizViewer auto-advances (or finishes on the
  // last question), so the answered-state branches below are never reached.
  if (sealed) {
    return { label: 'Submit answer', onClick: session.submit, disabled: !session.canSubmit };
  }
  if (!session.isAnswered) {
    return { label: 'Check answer', onClick: session.submit, disabled: !session.canSubmit };
  }
  if (session.isLast) return { label: 'Finish', onClick: session.finish };
  // Formative + wrong → re-attempt; everything else → advance.
  if (!graded && session.isCorrect === false) {
    return { label: 'Try again', onClick: session.retry };
  }
  return { label: 'Continue', onClick: session.next };
}

export default function QuizPlayerShell({
  breadcrumb,
  title,
  stepLabel,
  session,
  graded = false,
  sealed = false,
  sources,
  mission,
  mageSubtitle,
  mageActions,
  questionSource,
  sourcesNoun = 'question',
  customCard = false,
  primaryCta,
  secondaryActions,
  hideMission = false,
  progress,
  ariaLabel,
  mock = null,
  onAskMage,
  onShowSource,
  onMarkDifficult,
  onClose,
  bodyOnly = false,
  children,
}: QuizPlayerShellProps) {
  const { isDesktop } = useBreakpoint();
  const isPhone = !isDesktop;
  // Mobile accordions — Sources open by default (matches Figma 12); the mock
  // player opens the question navigator first instead.
  const [openPanel, setOpenPanel] = useState<'sources' | 'mage' | 'mission' | 'navigator' | null>(
    mock ? 'navigator' : 'sources',
  );
  const [markedDifficult, setMarkedDifficult] = useState(false);
  // Source reader drawer (Phase D) — null = closed; otherwise the index into
  // `readableSources` to show. Only sources with a `quote` are readable; a
  // source without one (e.g. the path-level fallback) defers to Ask Mage.
  const [readerIndex, setReaderIndex] = useState<number | null>(null);
  const readableSources = useMemo(() => sources.filter((s) => !!s.quote), [sources]);

  // Move focus into the overlay on open + restore it on close (the dialog root
  // is focusable via tabIndex below).
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    rootRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  const total = session?.total ?? progress?.total ?? 0;
  const current = session ? session.index + 1 : (progress?.current ?? 0);
  // "Plain body" — loading / error / graded result: no question card, no
  // sidebar, no action bar (the result panel carries its own buttons).
  const plain = bodyOnly || session?.mode === 'results';
  // Theory drives the CTA explicitly (no QuizSession); quizzes derive it from state.
  const cta: Cta = primaryCta ?? ctaFor(session, graded, sealed);

  // Open the reader on the clicked source if it carries a passage; otherwise, if
  // any source is readable, open the first; otherwise defer to Ask Mage (the
  // path-level fallback source has no passage to highlight).
  const openSourceReader = (clicked?: QuizSource) => {
    let idx = -1;
    if (clicked?.quote) idx = readableSources.findIndex((r) => r.id === clicked.id);
    if (idx < 0 && readableSources.length > 0) idx = 0;
    if (idx >= 0) {
      setReaderIndex(idx);
    } else {
      onShowSource?.();
    }
  };
  const canOpenSource = readableSources.length > 0 || !!onShowSource;
  const sidebarOnOpen = canOpenSource ? openSourceReader : undefined;
  const handleMarkDifficult = () => {
    setMarkedDifficult((v) => !v);
    onMarkDifficult?.();
  };

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? `${title} quiz`}
      tabIndex={-1}
      className="quiz-shell"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1300,
        outline: 'none',
        background: 'var(--quiz-bg)',
        color: 'var(--on-surface)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'inherit',
      }}
    >
      <style>{`
        .quiz-shell { animation: qShellIn 0.22s var(--ease-spring) both; }
        @keyframes qShellIn { from { opacity: 0; } to { opacity: 1; } }
        .qs-btn { transition: background-color 0.15s var(--ease-spring), border-color 0.15s var(--ease-spring), transform 0.15s var(--ease-spring), color 0.15s var(--ease-spring); }
        .qs-btn:active { transform: translateY(1px); }
        .qs-btn:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
        .qs-secondary:hover { background: var(--quiz-card); border-color: var(--nm-primary); color: var(--on-surface); }
        .qs-cta:not(:disabled):hover { filter: brightness(1.06); }
        .qs-cta:disabled { opacity: 0.45; cursor: not-allowed; }
        .qs-back:hover { background: var(--quiz-card); border-color: var(--nm-primary); }
        .qs-acc:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) {
          .quiz-shell { animation: none; }
          .qs-btn { transition: none; }
          .qs-btn:active { transform: none; }
        }
      `}</style>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <header
        style={{
          flexShrink: 0,
          borderBottom: '1px solid var(--quiz-card-border)',
          // iOS safe area: the fixed inset-0 shell would tuck its header under the
          // notch / status bar, so add the top inset; max() guards the landscape
          // side notch without over-insetting in portrait (insets are 0 there).
          padding: isPhone
            ? 'calc(12px + env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 12px max(16px, env(safe-area-inset-left))'
            : '16px 24px',
        }}
      >
        <div
          style={{
            maxWidth: '1120px',
            margin: '0 auto',
            display: 'flex',
            alignItems: isPhone ? 'stretch' : 'flex-start',
            flexDirection: isPhone ? 'column' : 'row',
            gap: isPhone ? '10px' : '16px',
          }}
        >
          {/* Left: back + breadcrumb + title */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close quiz"
              className="qs-btn qs-back"
              style={{
                width: '40px',
                height: '40px',
                flexShrink: 0,
                borderRadius: 'var(--radius-full)',
                border: '1px solid var(--quiz-card-border)',
                background: 'transparent',
                color: 'var(--on-surface)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'inherit',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 22 }} aria-hidden>
                arrow_back
              </span>
            </button>
            <div style={{ minWidth: 0, flex: 1 }}>
              {breadcrumb.length > 0 ? (
                <nav
                  aria-label="Breadcrumb"
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--nm-primary-on-light)',
                    marginBottom: '2px',
                  }}
                >
                  {breadcrumb.map((crumb, i) => (
                    <span key={`${crumb}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                      {i > 0 ? (
                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--on-surface-variant)' }} aria-hidden>
                          chevron_right
                        </span>
                      ) : null}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '40vw' }}>
                        {crumb}
                      </span>
                    </span>
                  ))}
                </nav>
              ) : null}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <h1
                  style={{
                    margin: 0,
                    fontFamily: 'var(--font-display)',
                    fontSize: isPhone ? '24px' : '28px',
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                    color: 'var(--on-surface)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {title}
                </h1>
                {isPhone && session && total > 0 ? (
                  <span style={{ flexShrink: 0, fontSize: '12px', color: 'var(--on-surface-variant)', fontVariantNumeric: 'tabular-nums' }}>
                    Question {current} of {total}
                  </span>
                ) : null}
              </div>
              {isPhone && total > 0 ? (
                <div style={{ marginTop: '10px' }}>
                  <ProgressSegments current={current} total={total} />
                </div>
              ) : null}
            </div>
          </div>

          {/* Right: step pill + question count + progress (desktop) */}
          <div
            style={{
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: isPhone ? 'flex-start' : 'flex-end',
              gap: '8px',
              order: isPhone ? -1 : 0,
            }}
          >
            {stepLabel ? (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 13px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--nm-primary-light)',
                  color: 'var(--nm-primary-on-light)',
                  fontSize: '12px',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>
                  bolt
                </span>
                {stepLabel}
              </span>
            ) : null}
            {!isPhone && total > 0 ? (
              <>
                {session ? (
                  <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)', fontVariantNumeric: 'tabular-nums' }}>
                    Question {current} of {total}
                  </span>
                ) : null}
                <div style={{ width: '210px' }}>
                  <ProgressSegments current={current} total={total} />
                </div>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {/* ── Mock timer band ───────────────────────────────────────────── */}
      {mock?.timer ? (
        <div
          style={{
            flexShrink: 0,
            borderBottom: '1px solid var(--quiz-card-border)',
            background: 'var(--quiz-card)',
            padding: isPhone
              ? '10px max(16px, env(safe-area-inset-right)) 10px max(16px, env(safe-area-inset-left))'
              : '10px 24px',
          }}
        >
          <div style={{ maxWidth: '1120px', margin: '0 auto' }}>
            <TimerBar
              remainingSec={mock.timer.remainingSec}
              totalSec={mock.timer.totalSec}
              paused={mock.timer.paused}
              compact={isPhone}
            />
          </div>
        </div>
      ) : null}

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <div
          style={{
            maxWidth: '1120px',
            margin: '0 auto',
            padding: isPhone
              ? '16px max(16px, env(safe-area-inset-right)) 16px max(16px, env(safe-area-inset-left))'
              : '28px 24px',
            display: 'grid',
            gridTemplateColumns: isDesktop && !plain ? 'minmax(0, 1fr) 320px' : 'minmax(0, 1fr)',
            gap: isDesktop ? '20px' : '14px',
            alignItems: 'start',
          }}
        >
          {/* Content */}
          <div style={{ minWidth: 0 }}>
            {plain || customCard ? (
              children
            ) : (
              <QuestionCard
                kindLabel={session?.questionKind ? QUIZ_KIND_LABEL[session.questionKind] : 'Question'}
                source={questionSource}
                isPhone={isPhone}
                onAskMage={onAskMage}
              >
                {children}
              </QuestionCard>
            )}
          </div>

          {/* Sidebar (desktop) / accordions (mobile) */}
          {!plain ? (
            isDesktop ? (
              <aside style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'sticky', top: '0' }}>
                {mock ? (
                  <SidebarCard>
                    <NavigatorPanel
                      items={mock.navigatorItems}
                      onJump={mock.onJump}
                      answeredCount={mock.answeredCount}
                      total={total}
                    />
                  </SidebarCard>
                ) : null}
                <SidebarCard>
                  <SourcesPanel sources={sources} onOpenSource={sidebarOnOpen} />
                </SidebarCard>
                <SidebarCard>
                  <AskMageCard subtitle={mageSubtitle} actions={mageActions} />
                </SidebarCard>
                {!hideMission ? (
                  <SidebarCard>
                    <MissionProgress steps={mission} />
                  </SidebarCard>
                ) : null}
              </aside>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {mock ? (
                  <Accordion
                    title="Questions"
                    subtitle={`${mock.answeredCount} of ${total} answered`}
                    open={openPanel === 'navigator'}
                    onToggle={() => setOpenPanel((p) => (p === 'navigator' ? null : 'navigator'))}
                  >
                    <NavigatorPanel
                      items={mock.navigatorItems}
                      onJump={mock.onJump}
                      answeredCount={mock.answeredCount}
                      total={total}
                      hideHeader
                    />
                  </Accordion>
                ) : null}
                <Accordion
                  title="Sources"
                  subtitle={`${sources.length} ${sources.length === 1 ? 'file' : 'files'} · grounding this ${sourcesNoun}`}
                  open={openPanel === 'sources'}
                  onToggle={() => setOpenPanel((p) => (p === 'sources' ? null : 'sources'))}
                >
                  <SourcesPanel sources={sources} onOpenSource={sidebarOnOpen} hideHeader />
                </Accordion>
                <Accordion
                  title="Ask Mage"
                  subtitle={mageActions.map((a) => a.label).join(' · ')}
                  open={openPanel === 'mage'}
                  onToggle={() => setOpenPanel((p) => (p === 'mage' ? null : 'mage'))}
                >
                  <AskMageCard subtitle={mageSubtitle} actions={mageActions} hideHeader />
                </Accordion>
                {!hideMission ? (
                  <Accordion
                    title="Mission progress"
                    subtitle={stepLabel ?? `${mission.filter((s) => s.status === 'done').length} / ${mission.length}`}
                    open={openPanel === 'mission'}
                    onToggle={() => setOpenPanel((p) => (p === 'mission' ? null : 'mission'))}
                  >
                    <MissionProgress steps={mission} hideHeader />
                  </Accordion>
                ) : null}
              </div>
            )
          ) : null}
        </div>
      </div>

      {/* ── Action bar ─────────────────────────────────────────────────── */}
      {!plain && mock ? (
        <MockActionBar
          isPhone={isPhone}
          session={session}
          mock={mock}
          onAskMage={onAskMage}
          onShowSource={canOpenSource ? () => openSourceReader() : undefined}
        />
      ) : null}
      {!plain && !mock ? (
      <footer
        style={{
          flexShrink: 0,
          borderTop: '1px solid var(--quiz-card-border)',
          background: 'var(--quiz-card)',
          padding: isPhone
            ? '12px max(16px, env(safe-area-inset-right)) calc(12px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))'
            : '14px 24px',
        }}
      >
        <div
          style={{
            maxWidth: '1120px',
            margin: '0 auto',
            display: 'flex',
            flexDirection: isPhone ? 'column' : 'row',
            alignItems: isPhone ? 'stretch' : 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: isPhone ? 'center' : 'flex-start' }}>
            {secondaryActions ? (
              secondaryActions.map((a) => (
                <SecondaryButton
                  key={a.label}
                  icon={a.icon}
                  label={a.label}
                  onClick={a.onClick}
                  active={a.active}
                  disabled={a.disabled}
                />
              ))
            ) : (
              <>
                <SecondaryButton icon="auto_awesome" label="Ask Mage" onClick={onAskMage} />
                {/* Phone shortens the two secondary labels (the icons carry the
                    meaning) so all three fit the Figma single-row action bar at
                    ≤414px instead of wrapping a lone pill to a second row. */}
                <SecondaryButton
                  icon="description"
                  label={isPhone ? 'Source' : 'Show source'}
                  onClick={() => openSourceReader()}
                />
                <SecondaryButton
                  icon={markedDifficult ? 'flag' : 'outlined_flag'}
                  label={isPhone ? 'Difficult' : 'Mark as difficult'}
                  onClick={handleMarkDifficult}
                  active={markedDifficult}
                />
              </>
            )}
          </div>
          {cta ? (
            <button
              type="button"
              onClick={cta.onClick}
              disabled={cta.disabled}
              className="qs-btn qs-cta"
              style={{
                padding: isPhone ? '14px 20px' : '12px 28px',
                width: isPhone ? '100%' : 'auto',
                minWidth: isPhone ? undefined : '160px',
                borderRadius: 'var(--radius-full)',
                border: 'none',
                background: 'var(--accent-strong)',
                color: 'var(--on-primary-container)',
                fontSize: '15px',
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {cta.label}
            </button>
          ) : null}
        </div>
      </footer>
      ) : null}

      {/* Source reader drawer (Phase D) — rides above the shell (z 1400). Its
          "Ask Mage about this" closes the drawer first so the Mage panel is
          never left covered by it. */}
      <SourceReaderDrawer
        open={readerIndex !== null}
        sources={readableSources}
        activeIndex={readerIndex ?? 0}
        onNavigate={setReaderIndex}
        questionNumber={session ? session.index + 1 : undefined}
        onAskMage={
          onAskMage
            ? () => {
                setReaderIndex(null);
                onAskMage();
              }
            : undefined
        }
        onClose={() => setReaderIndex(null)}
      />
    </div>
  );
}

function ProgressSegments({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: '4px', width: '100%' }} aria-hidden>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          style={{
            flex: 1,
            height: '6px',
            borderRadius: 'var(--radius-full)',
            background: i < current ? 'var(--nm-primary)' : 'var(--nm-primary-light)',
          }}
        />
      ))}
    </div>
  );
}

function SecondaryButton({
  icon,
  label,
  onClick,
  active,
  disabled,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className="qs-btn qs-secondary"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        flexShrink: 0,
        whiteSpace: 'nowrap',
        padding: '8px 12px',
        borderRadius: 'var(--radius-full)',
        border: `1px solid ${active ? 'var(--nm-primary)' : 'var(--quiz-card-border)'}`,
        background: active ? 'var(--nm-primary-light)' : 'transparent',
        color: active ? 'var(--nm-primary-on-light)' : 'var(--on-surface-variant)',
        fontSize: '13px',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        fontFamily: 'inherit',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 17 }} aria-hidden>
        {icon}
      </span>
      {label}
    </button>
  );
}

function Accordion({
  title,
  subtitle,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <SidebarCard>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="qs-acc"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          width: '100%',
          padding: 0,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'inherit',
        }}
      >
        <span style={{ minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontFamily: 'var(--font-display)',
              fontSize: '15px',
              fontWeight: 800,
              color: 'var(--on-surface)',
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </span>
          <span
            style={{
              display: 'block',
              fontSize: '12px',
              color: 'var(--on-surface-variant)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {subtitle}
          </span>
        </span>
        <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--on-surface-variant)', flexShrink: 0 }} aria-hidden>
          {open ? 'remove' : 'add'}
        </span>
      </button>
      {open ? <div style={{ marginTop: '14px' }}>{children}</div> : null}
    </SidebarCard>
  );
}

const noop = () => {};

/** Phase 3 — the question-navigator sidebar panel (desktop card / mobile accordion). */
function NavigatorPanel({
  items,
  onJump,
  answeredCount,
  total,
  hideHeader = false,
}: {
  items: QuestionNavigatorItem[];
  onJump: (i: number) => void;
  answeredCount: number;
  total: number;
  hideHeader?: boolean;
}) {
  return (
    <div>
      {!hideHeader ? (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', marginBottom: '12px' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 800, color: 'var(--on-surface)', letterSpacing: '-0.01em' }}>
            Questions
          </span>
          <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)', fontVariantNumeric: 'tabular-nums' }}>
            {answeredCount} / {total} answered
          </span>
        </div>
      ) : null}
      <QuestionNavigator items={items} onJump={onJump} showLegend />
    </div>
  );
}

/** A Prev / Next nav pill for the mock action bar. */
function NavButton({
  icon,
  label,
  onClick,
  disabled,
  iconRight = false,
  full = false,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  iconRight?: boolean;
  full?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="qs-btn qs-secondary"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        width: full ? '100%' : 'auto',
        flexDirection: iconRight ? 'row-reverse' : 'row',
        padding: '10px 16px',
        borderRadius: 'var(--radius-full)',
        border: '1px solid var(--quiz-card-border)',
        background: 'transparent',
        color: disabled ? 'var(--on-surface-variant)' : 'var(--on-surface)',
        fontSize: '14px',
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 19 }} aria-hidden>
        {icon}
      </span>
      {label}
    </button>
  );
}

/** Phase 3 — the mock-exam action bar: Prev/Next free-nav · Flag · Ask Mage ·
 *  Source · a single "Submit exam" that grades the whole set at once. */
function MockActionBar({
  isPhone,
  session,
  mock,
  onAskMage,
  onShowSource,
}: {
  isPhone: boolean;
  session: QuizSession | null;
  mock: MockChrome;
  onAskMage: () => void;
  onShowSource?: () => void;
}) {
  const index = session?.index ?? 0;
  const total = session?.total ?? 0;
  const isLast = session?.isLast ?? false;
  const submitting = !!mock.submitting;
  const canPrev = index > 0 && !submitting;
  const canNext = !isLast && total > 0 && !submitting;

  const pills = (
    <>
      <SecondaryButton
        icon={mock.flagged ? 'flag' : 'outlined_flag'}
        label={isPhone ? 'Flag' : 'Flag for review'}
        onClick={mock.onToggleFlag}
        active={mock.flagged}
      />
      <SecondaryButton icon="auto_awesome" label={isPhone ? 'Mage' : 'Ask Mage'} onClick={onAskMage} />
      {onShowSource ? <SecondaryButton icon="description" label="Source" onClick={onShowSource} /> : null}
    </>
  );

  const submitBtn = (full: boolean) => (
    <button
      type="button"
      onClick={mock.onSubmitAll}
      disabled={submitting}
      className="qs-btn qs-cta"
      style={{
        padding: isPhone ? '14px 20px' : '12px 28px',
        width: full ? '100%' : 'auto',
        minWidth: full ? undefined : '170px',
        borderRadius: 'var(--radius-full)',
        border: 'none',
        background: 'var(--accent-strong)',
        color: 'var(--on-primary-container)',
        fontSize: '15px',
        fontWeight: 800,
        cursor: submitting ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {submitting ? 'Submitting…' : 'Submit exam'}
    </button>
  );

  const footerStyle: React.CSSProperties = {
    flexShrink: 0,
    borderTop: '1px solid var(--quiz-card-border)',
    background: 'var(--quiz-card)',
    padding: isPhone
      ? '12px max(16px, env(safe-area-inset-right)) calc(12px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))'
      : '14px 24px',
  };

  if (isPhone) {
    return (
      <footer style={footerStyle}>
        <div style={{ maxWidth: '1120px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <NavButton icon="arrow_back" label="Previous" onClick={session?.prev ?? noop} disabled={!canPrev} full />
            </div>
            <div style={{ flex: 1 }}>
              <NavButton icon="arrow_forward" label="Next" iconRight onClick={session?.next ?? noop} disabled={!canNext} full />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>{pills}</div>
          {submitBtn(true)}
        </div>
      </footer>
    );
  }

  return (
    <footer style={footerStyle}>
      <div style={{ maxWidth: '1120px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <NavButton icon="arrow_back" label="Previous" onClick={session?.prev ?? noop} disabled={!canPrev} />
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{pills}</div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '13px', color: 'var(--on-surface-variant)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {mock.answeredCount} of {total} answered
        </span>
        <NavButton icon="arrow_forward" label="Next" iconRight onClick={session?.next ?? noop} disabled={!canNext} />
        {submitBtn(false)}
      </div>
    </footer>
  );
}
