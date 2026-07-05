'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useCoarsePointer } from '@/hooks/useCoarsePointer';
import { RENDERERS } from '@/components/quiz/questionRenderers';
import type { UserAnswer } from '@/components/quiz/questionRenderers/types';
import type { QuizSession } from '@/components/quiz/player/types';
import { grade } from '@/lib/quiz-grading';
import { buildQuizActivityContext, type QuizActivityQuestion, type QuizActivityState } from '@/lib/mage-types';
import {
  QuizReactionLayer,
  type QuizReactionLayerHandle,
} from '@/components/quiz/QuizReactionLayer';
import { computeReaction, type ReactionMode } from '@/lib/quiz-reactions';
import { trackEvent } from '@/lib/telemetry';
import { haptics } from '@/lib/haptics';
import type { QuestionKind } from '@notemage/shared';

// Figure-reuse (P4): a question's optional exhibit image (0-or-1), served from
// /api/uploads/quiz-images/{id}. Present only on path-generated quizzes whose
// materials carried captioned figures.
interface QuestionImageData {
  id: string;
  caption: string | null;
}

interface QuizQuestion {
  id: string;
  // Phase 2: kind is required on the wire; older callers that haven't
  // upgraded still get a sensible default ('mc') below in the dispatcher.
  kind?: QuestionKind;
  payload?: unknown;
  question: string;
  options: string[];
  correctIndex: number;
  hint: string | null;
  correctExplanation: string | null;
  wrongExplanation: string | null;
  sortOrder: number;
  // Figure-reuse (P4). Absent/null on manually-authored and pre-feature quizzes.
  image?: QuestionImageData | null;
}

interface AnswerEntry {
  answer: UserAnswer;
  isCorrect: boolean;
}

interface QuizViewerProps {
  notebookId: string;
  setId: string;
  title: string;
  initialQuestions: QuizQuestion[];
  // Phase 10 — re-used by the checkpoint drawer (Phase 10.6) for assessment-
  // kind slots; defaults to false for direct quiz-player access.
  isCheckpoint?: boolean;
  // Phase E — sealed (exam) mode. The learner
  // submits each answer WITHOUT seeing whether it was right (no per-question
  // verdict, no streak reactions — a correct-streak takeover would leak the
  // result), and the run is forward-only. Used by the exam run surface; the
  // path-checkpoint and study-pack paths leave it false (verdict shown as today).
  sealed?: boolean;
  // Phase 3 — mock-exam (timed, free-navigation) mode:
  // every answer is STAGED per question (kept in `mockDrafts`, never committed),
  // so no verdict is shown and the learner can revisit/change answers and jump
  // around freely; the whole set grades in one pass via `submitAll`. The shell
  // drives the navigator + timer + single "Submit exam". Distinct from `sealed`
  // (which is forward-only, auto-advance). Used only by the mock run surface.
  mock?: boolean;
  onSession?: (session: QuizSession | null) => void;
  // Phase 10.6 — fires after the attempt POST returns successfully.
  // The checkpoint drawer uses this to PATCH a learning-slot quiz
  // activity as completed, or POST to /assessment for assessment
  // slots (in which case the caller passes `isCheckpoint: true` and
  // does its own star handling on top of this signal).
  onComplete?: (result: {
    attemptId: string;
    score: number;
    total: number;
    percentage: number;
    timeSpent: number | null;
  }) => void;
}

type QuizMode = 'quiz' | 'review' | 'results';

// A single quiz question's exhibit image (figure-reuse P4). Rendered by the
// dispatcher ABOVE the prompt — shared player chrome, not per-renderer, so all
// question kinds get it for free with zero grading impact. Renders on a neutral
// surface (crops are white-background PNGs — matters in dark mode), captions the
// figure, uses the caption as alt text, lazy-loads, and hides itself cleanly if
// the blob 404s mid-quiz. Height-clamped so MatchPairs / sentence-reorder still
// fit on the pinned-nav phone player. Mirrors FlashcardViewer's FlashcardFigure.
function QuestionFigure({ img, isPhone }: { img: QuestionImageData; isPhone: boolean }) {
  const caption = img.caption?.trim();
  return (
    <figure
      style={{
        width: '100%',
        maxWidth: isPhone ? '100%' : '480px',
        margin: '0 0 16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/uploads/quiz-images/${img.id}`}
        alt={caption || 'Question exhibit'}
        loading="lazy"
        onError={(e) => {
          const fig = e.currentTarget.closest('figure');
          if (fig) (fig as HTMLElement).style.display = 'none';
        }}
        style={{
          maxWidth: '100%',
          maxHeight: isPhone ? '160px' : '200px',
          borderRadius: '10px',
          objectFit: 'contain',
          background: 'var(--surface-container-high)',
          border: '1px solid var(--outline-variant)',
          padding: '6px',
        }}
      />
      {caption ? (
        <figcaption
          style={{
            fontSize: '12px',
            lineHeight: 1.4,
            textAlign: 'center',
            color: 'var(--on-surface-variant)',
          }}
        >
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

export default function QuizViewer({
  notebookId,
  setId,
  title,
  initialQuestions,
  isCheckpoint = false,
  sealed = false,
  mock = false,
  onSession,
  onComplete,
}: QuizViewerProps) {
  const { isPhone } = useBreakpoint();
  // Touch-capability signal — gates the per-renderer tap-first interaction swaps.
  const coarsePointer = useCoarsePointer();
  const questions = initialQuestions;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<number, AnswerEntry>>(new Map());
  // Per-set sessionStorage key for the in-progress draft (persisted below).
  const draftKey = `notemage:quiz-draft:${setId}`;
  const [showHint, setShowHint] = useState(false);
  // A selected-but-unsubmitted answer. The shell's "Check answer" CTA commits it.
  const [stagedAnswer, setStagedAnswer] = useState<UserAnswer | undefined>(undefined);
  // Phase 3 — mock mode keeps every answer here (per-index draft), never in
  // `answers`, so `isAnswered` stays false and the renderer paints the selection
  // WITHOUT a verdict (preserving the seal) while still allowing free navigation
  // + answer changes. Graded all at once in `submitAll`. A ref mirror lets the
  // submit-all + nav callbacks read the freshest drafts without stale closures.
  const [mockDrafts, setMockDrafts] = useState<Map<number, UserAnswer>>(new Map());
  const mockDraftsRef = useRef(mockDrafts);
  mockDraftsRef.current = mockDrafts;
  const [mode, setMode] = useState<QuizMode>('quiz');

  // Quiz attempt tracking
  const [quizStartTime] = useState<number>(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  // True when the attempt POST failed (network or server). Surfaces a retry
  // banner on the results screen so a learner never sees a score that silently
  // never saved.
  const [saveError, setSaveError] = useState(false);
  // Politely announced to screen readers when an answer is graded — the verdict
  // banner is otherwise silent to assistive tech (no aria-live anywhere else).
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  // Mascot reaction wiring (Phase 4). Streaks live in refs so the commit
  // helper reads fresh values synchronously and doesn't re-render the player
  // on every answer.
  const reactionLayerRef = useRef<QuizReactionLayerHandle>(null);
  const correctStreakRef = useRef(0);
  const wrongStreakRef = useRef(0);
  const committedRef = useRef<Set<number>>(new Set());
  const [reactionMode, setReactionMode] = useState<ReactionMode>('all');
  const [audioEnabled, setAudioEnabled] = useState(false);
  const question = questions[currentIndex];
  const currentEntry = answers.get(currentIndex);
  const currentAnswer = currentEntry?.answer;
  const isAnswered = currentEntry !== undefined;

  // Stats
  const totalAnswered = answers.size;
  const correctCount = Array.from(answers.values()).filter((a) => a.isCorrect).length;
  const wrongCount = totalAnswered - correctCount;
  const skippedCount = questions.length - totalAnswered;

  // Commit an answer for one question and fire any matching mascot reaction.
  // Idempotent per index (the committedRef guard handles re-presses and
  // prev/next round-trips). Skipped outside the active quiz mode so review
  // navigation never triggers reactions.
  const commitFor = useCallback(
    (idx: number, isCorrect: boolean, hint: string | null): void => {
      if (mode !== 'quiz') return;
      if (committedRef.current.has(idx)) return;
      committedRef.current.add(idx);

      // Outcome haptic — the single authoritative spot a graded answer is
      // finalised, so it covers every question kind exactly once.
      if (isCorrect) haptics.success();
      else haptics.error();

      const newCorrect = isCorrect ? correctStreakRef.current + 1 : 0;
      const newWrong = isCorrect ? 0 : wrongStreakRef.current + 1;
      correctStreakRef.current = newCorrect;
      wrongStreakRef.current = newWrong;

      const reaction = computeReaction(
        {
          correctStreak: newCorrect,
          wrongStreak: newWrong,
          lastAnswerCorrect: isCorrect,
        },
        reactionMode
      );
      if (reaction) reactionLayerRef.current?.fire(reaction);

      // Telemetry — emit at the same milestones the reaction engine fires
      // on (3 / 5 / 7) plus the 10-streak achievement gate and every +5
      // beyond. Keeps the event stream cheap (one ping per milestone) while
      // still surfacing long-tail streaks.
      if (
        isCorrect &&
        (newCorrect === 3 ||
          newCorrect === 5 ||
          newCorrect === 7 ||
          newCorrect === 10 ||
          (newCorrect > 10 && newCorrect % 5 === 0))
      ) {
        trackEvent('quiz.streak_hit', { streak: newCorrect, quizSetId: setId });
      }

      if (!isCorrect && newWrong === 3 && hint) setShowHint(true);
    },
    [mode, reactionMode, setId]
  );

  const next = useCallback(() => {
    if (currentIndex >= questions.length - 1) return;
    // Mock: free-nav, no grading on move — restore the next question's draft.
    if (mock) {
      const ni = currentIndex + 1;
      setCurrentIndex(ni);
      setShowHint(false);
      setStagedAnswer(mockDraftsRef.current.get(ni));
      setLiveAnnouncement('');
      return;
    }
    // Non-MC commit point. No-op for MC (already in committedRef) and for
    // unanswered/skipped questions.
    const entry = answers.get(currentIndex);
    const q = questions[currentIndex];
    if (entry && q) commitFor(currentIndex, entry.isCorrect, q.hint);
    setCurrentIndex((i) => i + 1);
    setShowHint(false);
    setStagedAnswer(undefined);
    setLiveAnnouncement('');
  }, [currentIndex, questions, answers, commitFor, mock]);

  const prev = useCallback(() => {
    // Sealed (exam) runs are forward-only — going back would re-show a recorded
    // answer with its verdict, breaking the seal. Mock runs never commit a
    // verdict, so back-nav is safe (and expected) there.
    if (sealed) return;
    if (currentIndex > 0) {
      const pi = currentIndex - 1;
      setCurrentIndex(pi);
      setShowHint(false);
      // Mock: restore the previous question's draft so it shows the prior pick.
      setStagedAnswer(mock ? mockDraftsRef.current.get(pi) : undefined);
      setLiveAnnouncement('');
    }
  }, [currentIndex, sealed, mock]);

  // Phase 3 — mock free-nav: jump to any question (navigator click). Restores the
  // target's staged draft. Forward-only `sealed` runs never expose this.
  const jumpTo = useCallback(
    (index: number) => {
      if (!mock) return;
      const clamped = Math.min(Math.max(index, 0), questions.length - 1);
      setCurrentIndex(clamped);
      setShowHint(false);
      setStagedAnswer(mockDraftsRef.current.get(clamped));
      setLiveAnnouncement('');
    },
    [mock, questions.length]
  );

  const reset = useCallback(() => {
    setCurrentIndex(0);
    setAnswers(new Map());
    setShowHint(false);
    setStagedAnswer(undefined);
    setMode('quiz');
    correctStreakRef.current = 0;
    wrongStreakRef.current = 0;
    committedRef.current = new Set();
    reactionLayerRef.current?.dismiss();
    try {
      sessionStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  }, [draftKey]);

  const selectAnswer = useCallback(
    (answer: UserAnswer) => {
      if (mode !== 'quiz') return;
      const q = questions[currentIndex];
      if (!q) return;
      const kind: QuestionKind = q.kind ?? 'mc';
      // MC (and diagram_cloze, which is MC-at-heart) lock after the first
      // selection. Multi-step kinds (match_pairs, word_bank, sentence_reorder)
      // and free-text kinds need to allow re-submission while the user is still
      // on the question.
      const locksOnFirstPick = kind === 'mc' || kind === 'diagram_cloze';
      if (locksOnFirstPick && isAnswered) return;
      // The shell owns submission, so selections remain staged until its
      // "Check answer" action commits them.
      if (!isAnswered) {
        setStagedAnswer(answer);
        // Mock mode: persist the pick as a per-index draft so it survives
        // navigation + lights the navigator cell (graded later in submitAll).
        if (mock) setMockDrafts((prev) => new Map(prev).set(currentIndex, answer));
        return;
      }
    },
    [mode, isAnswered, currentIndex, questions, mock]
  );

  // Commit the staged answer ("Check answer" in the shell). Grades + commits
  // exactly like the immediate path in selectAnswer, then clears the stage.
  const submitStaged = useCallback(() => {
    if (stagedAnswer === undefined || isAnswered || mode !== 'quiz') return;
    const q = questions[currentIndex];
    if (!q) return;
    const kind: QuestionKind = q.kind ?? 'mc';
    const { isCorrect } = grade(
      kind,
      q.payload,
      { options: q.options, correctIndex: q.correctIndex },
      stagedAnswer
    );
    setAnswers((prev) => new Map(prev).set(currentIndex, { answer: stagedAnswer, isCorrect }));
    setLiveAnnouncement(isCorrect ? 'Correct.' : 'Not quite. The answer is shown below.');
    commitFor(currentIndex, isCorrect, q.hint);
    setStagedAnswer(undefined);
  }, [stagedAnswer, isAnswered, mode, currentIndex, questions, commitFor]);

  // Re-attempt the current question ("Try again" in the shell). Clears the
  // committed answer + the per-index commit guard so a fresh selection can be
  // staged and re-graded. Formative slots only — graded checkpoints never offer
  // this (the shell hides it), so a learner can't brute-force a graded score.
  const retryCurrent = useCallback(() => {
    setAnswers((prev) => {
      const next = new Map(prev);
      next.delete(currentIndex);
      return next;
    });
    committedRef.current.delete(currentIndex);
    setStagedAnswer(undefined);
    setShowHint(false);
    setLiveAnnouncement('');
  }, [currentIndex]);

  // POST the attempt. Returns true on success; on any failure (network or a
  // non-success body) sets saveError so the results screen can offer a retry.
  // Separated from finish() so the retry button can re-run it without
  // re-entering the results transition.
  const submitAttempt = useCallback(
    async (answersOverride?: Map<number, AnswerEntry>): Promise<boolean> => {
      // Sealed mode records the final answer + finishes in one handler, so it
      // passes the freshly-built map here rather than relying on the still-stale
      // `answers` state closure.
      const answersToSubmit = answersOverride ?? answers;
      setSubmitting(true);
      setSaveError(false);
      try {
        const timeSpent = Math.round((Date.now() - quizStartTime) / 1000);
        const answersPayload = Array.from(answersToSubmit.entries()).map(([idx, entry]) => ({
          questionId: questions[idx].id,
          // Strip code_write `runs` at the network boundary: they're client-only
          // live context for Mage, not answer data. The server persists the
          // answer as a JSON blob and only reads kind+passed, so runs would just
          // bloat the DB and resurface as stale review-answer context later. The
          // in-memory `answers` Map keeps runs so post-submit Mage help still sees them.
          userAnswer:
            entry.answer.kind === 'code_write' && entry.answer.runs
              ? { kind: entry.answer.kind, language: entry.answer.language, code: entry.answer.code, passed: entry.answer.passed }
              : entry.answer,
        }));
        const res = await fetch(`/api/material/${notebookId}/quiz-sets/${setId}/attempts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers: answersPayload, timeSpent }),
        });
        const json = await res.json();
        if (json.success && json.data) {
          // Telemetry — perfect quiz event matches the achievement gate
          // (100% on a ≥5-question set). Fires once per attempt.
          if (json.data.percentage === 100 && questions.length >= 5) {
            trackEvent('quiz.perfect', { quizSetId: setId, total: questions.length });
          }
          const final = computeReaction(
            {
              correctStreak: correctStreakRef.current,
              wrongStreak: wrongStreakRef.current,
              lastAnswerCorrect: null,
              finalResult: {
                percentage: json.data.percentage,
                totalQuestions: questions.length,
                isCheckpoint,
                passed: isCheckpoint ? json.data.percentage >= 80 : undefined,
              },
            },
            reactionMode
          );
          if (final) reactionLayerRef.current?.fire(final);
          // Phase 10.6 — surface the attempt result so the checkpoint
          // drawer can PATCH the activity / POST to /assessment.
          onComplete?.({
            attemptId: json.data.id,
            score: json.data.score,
            total: json.data.total,
            percentage: json.data.percentage,
            timeSpent: json.data.timeSpent ?? null,
          });
          setSubmitting(false);
          return true;
        }
        setSaveError(true);
        setSubmitting(false);
        return false;
      } catch {
        setSaveError(true);
        setSubmitting(false);
        return false;
      }
    },
    [answers, questions, notebookId, setId, quizStartTime, isCheckpoint, reactionMode, onComplete]
  );

  // Phase E — sealed (exam) submit. Grades the staged answer for final scoring
  // but SEALS the verdict: it pre-marks the index committed so no reaction /
  // haptic / hint ever fires (a per-question "correct!" would leak the answer),
  // then advances WITHOUT showing correctness. On the last question it records +
  // finishes in one pass, threading the fresh map straight into submitAttempt so
  // the closing answer isn't lost to the async `answers` state.
  const submitStagedSealed = useCallback(() => {
    if (stagedAnswer === undefined || isAnswered || mode !== 'quiz') return;
    const q = questions[currentIndex];
    if (!q) return;
    const kind: QuestionKind = q.kind ?? 'mc';
    const { isCorrect } = grade(
      kind,
      q.payload,
      { options: q.options, correctIndex: q.correctIndex },
      stagedAnswer
    );
    committedRef.current.add(currentIndex);
    const recorded = new Map(answers).set(currentIndex, { answer: stagedAnswer, isCorrect });
    setAnswers(recorded);
    setStagedAnswer(undefined);
    setShowHint(false);
    setLiveAnnouncement('');
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setMode('results');
      try {
        sessionStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
      void submitAttempt(recorded);
    }
  }, [stagedAnswer, isAnswered, mode, currentIndex, questions, answers, submitAttempt, draftKey]);

  // Phase 3 — mock submit-all. Grades every staged draft (no per-question
  // verdict ever shown), builds one sealed attempt map, and finishes in a single
  // pass. Pre-marks every index committed so no streak reaction fires (the final
  // pass/fail reaction in submitAttempt still does, which is fine at the end).
  const submitAll = useCallback(() => {
    if (mode !== 'quiz') return;
    const drafts = mockDraftsRef.current;
    const recorded = new Map<number, AnswerEntry>();
    questions.forEach((q, idx) => {
      const answer = drafts.get(idx);
      if (answer === undefined) return;
      const kind: QuestionKind = q.kind ?? 'mc';
      const { isCorrect } = grade(
        kind,
        q.payload,
        { options: q.options, correctIndex: q.correctIndex },
        answer
      );
      recorded.set(idx, { answer, isCorrect });
      committedRef.current.add(idx);
    });
    setAnswers(recorded);
    setStagedAnswer(undefined);
    setMode('results');
    try {
      sessionStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
    void submitAttempt(recorded);
  }, [mode, questions, submitAttempt, draftKey]);

  const finish = useCallback(async () => {
    // Commit the current question first (no-op for MC; non-MC may be the
    // very last answered question that hasn't been advanced past yet).
    const lastEntry = answers.get(currentIndex);
    const lastQ = questions[currentIndex];
    if (lastEntry && lastQ) commitFor(currentIndex, lastEntry.isCorrect, lastQ.hint);

    setMode('results');
    try {
      sessionStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
    await submitAttempt();
  }, [answers, currentIndex, questions, commitFor, submitAttempt, draftKey]);

  const startReview = useCallback(() => {
    setMode('review');
    setCurrentIndex(0);
    setShowHint(false);
    setStagedAnswer(undefined);
  }, []);

  // Rehydrate an in-progress attempt once on mount so a refresh or a discarded
  // background tab doesn't wipe answers. Guarded by question count so a
  // regenerated set never restores stale answers.
  useEffect(() => {
    if (mode !== 'quiz') return;
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        count?: number;
        currentIndex?: number;
        answers?: [number, AnswerEntry][];
      };
      if (
        saved.count !== questions.length ||
        !Array.isArray(saved.answers) ||
        saved.answers.length === 0
      ) {
        return;
      }
      const restored = new Map<number, AnswerEntry>(saved.answers);
      setAnswers(restored);
      restored.forEach((_v, k) => committedRef.current.add(k));
      if (typeof saved.currentIndex === 'number') {
        setCurrentIndex(Math.min(Math.max(saved.currentIndex, 0), questions.length - 1));
      }
    } catch {
      /* ignore malformed or blocked storage */
    }
    // Mount-only rehydrate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the draft as the learner answers.
  useEffect(() => {
    if (mode !== 'quiz' || answers.size === 0) return;
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          count: questions.length,
          currentIndex,
          answers: Array.from(answers.entries()),
        })
      );
    } catch {
      /* ignore blocked storage */
    }
  }, [answers, currentIndex, mode, draftKey, questions.length]);

  // Elapsed time ticker
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(Math.round((Date.now() - quizStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [quizStartTime]);

  // Keyboard navigation. MC option keys (1/2/3/4, A/B/C/D) are MC-only —
  // non-MC kinds (text input, drag-drop) handle their own keyboard input.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't hijack keys while the learner is typing into a text-input question
      // (fill-blank, translation, equation, code). Otherwise ←/→ would move
      // between questions instead of the caret, and A/B/C/D would be captured as
      // MC answers instead of reaching the field.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      // Sealed (exam) runs are forward-only and never skip an unanswered
      // question — the ONLY way forward is the shell's "Submit answer" CTA, so
      // arrow-key navigation is suppressed here.
      if (!sealed) {
        if (e.code === 'ArrowLeft') {
          e.preventDefault();
          prev();
        } else if (e.code === 'ArrowRight') {
          e.preventDefault();
          next();
        }
      }
      const q = questions[currentIndex];
      const kind: QuestionKind = q?.kind ?? 'mc';
      if (kind !== 'mc') return;
      if (e.code === 'Digit1' || e.code === 'KeyA') {
        e.preventDefault();
        selectAnswer({ kind: 'mc', selectedIdx: 0 });
      } else if (e.code === 'Digit2' || e.code === 'KeyB') {
        e.preventDefault();
        selectAnswer({ kind: 'mc', selectedIdx: 1 });
      } else if (e.code === 'Digit3' || e.code === 'KeyC') {
        e.preventDefault();
        selectAnswer({ kind: 'mc', selectedIdx: 2 });
      } else if (e.code === 'Digit4' || e.code === 'KeyD') {
        e.preventDefault();
        selectAnswer({ kind: 'mc', selectedIdx: 3 });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [prev, next, selectAnswer, questions, currentIndex, sealed]);

  // Fetch user quiz-reaction preferences (Phase 4).
  useEffect(() => {
    let cancelled = false;
    fetch('/api/user/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (
          data.quizReactionsMode === 'all' ||
          data.quizReactionsMode === 'minimal' ||
          data.quizReactionsMode === 'off'
        ) {
          setReactionMode(data.quizReactionsMode);
        }
        if (typeof data.quizReactionsAudio === 'boolean') {
          setAudioEnabled(data.quizReactionsAudio);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Report session state up to QuizPlayerShell.
  // Held in a ref so a fresh `onSession` identity never re-subscribes; the effect
  // re-fires only on the primitive transitions the shell header + CTA depend on.
  const onSessionRef = useRef(onSession);
  onSessionRef.current = onSession;
  const currentIsCorrect = currentEntry ? currentEntry.isCorrect : null;

  // Mage Real Context (P1) — the CURRENT question's serializer output. Sealed
  // exam commits answers but never reveals to the learner (server also seals
  // it) — keep `isSubmittedOrRevealed` false there so no answer key leaks
  // client-side. Mock only counts as "submitted" once submit-all lands
  // results/review (grading is staged until then).
  // ponytail: no debounce here — the serializer is cheap and
  // useRegisterMageContext is JSON-keyed; add a ~300ms debounce later if
  // profiling shows code_write keystroke churn causing lag.
  const mockDraft = mock ? mockDrafts.get(currentIndex) : undefined;
  const isSubmittedOrRevealed = mock ? mode === 'results' || mode === 'review' : isAnswered && !sealed;
  const activityAnswer: UserAnswer | undefined = mock
    ? isSubmittedOrRevealed
      ? currentEntry?.answer
      : mockDraft
    : isAnswered
      ? currentEntry?.answer
      : stagedAnswer;

  const { activityContext, activityRevealing } = useMemo(() => {
    const q = questions[currentIndex];
    if (!q) return { activityContext: undefined, activityRevealing: undefined };
    const activityQuestion: QuizActivityQuestion = {
      id: q.id,
      kind: q.kind ?? 'mc',
      payload: q.payload,
      question: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      hint: q.hint,
      correctExplanation: q.correctExplanation,
      wrongExplanation: q.wrongExplanation,
      figureCaption: q.image?.caption ?? undefined,
    };
    const state: QuizActivityState = {
      surface: mock ? 'mock-exam' : 'practice',
      isSubmittedOrRevealed,
      answer: activityAnswer,
      isCorrect: currentIsCorrect ?? undefined,
      hintShown: showHint,
      runs: activityAnswer?.kind === 'code_write' ? activityAnswer.runs : undefined,
    };
    const built = buildQuizActivityContext(activityQuestion, state);
    return { activityContext: built.safe, activityRevealing: built.revealing };
  }, [currentIndex, questions, activityAnswer, isSubmittedOrRevealed, currentIsCorrect, showHint, mock]);

  useEffect(() => {
    const q = questions[currentIndex];
    onSessionRef.current?.({
      index: currentIndex,
      total: questions.length,
      mode,
      questionId: q?.id ?? null,
      questionKind: (q?.kind ?? 'mc') as QuestionKind,
      isAnswered,
      isCorrect: currentIsCorrect,
      isLast: currentIndex === questions.length - 1,
      canSubmit: stagedAnswer !== undefined && !isAnswered,
      submit: sealed ? submitStagedSealed : submitStaged,
      next,
      prev,
      retry: retryCurrent,
      finish,
      activityContext,
      activityRevealing,
      isSubmittedOrRevealed,
      ...(mock
        ? {
            isMock: true,
            answeredIndices: Array.from(mockDrafts.keys()),
            jumpTo,
            submitAll,
          }
        : null),
    });
  }, [
    sealed,
    mock,
    mockDrafts,
    jumpTo,
    submitAll,
    currentIndex,
    questions,
    mode,
    isAnswered,
    currentIsCorrect,
    stagedAnswer,
    submitStaged,
    submitStagedSealed,
    next,
    prev,
    retryCurrent,
    finish,
    activityContext,
    activityRevealing,
    isSubmittedOrRevealed,
  ]);

  if (questions.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--ink-40)',
          fontFamily: 'inherit',
        }}
      >
        <p style={{ fontSize: '16px', marginBottom: '16px' }}>No questions in this quiz.</p>
      </div>
    );
  }

  // ── Results screen ──
  if (mode === 'results') {
    // Score against the full question count, not just answered ones — skipped
    // questions count as wrong, so dividing by `totalAnswered` would inflate the
    // headline % (2/2 answered + 8 skipped is 20%, not 100%) and disagree with
    // the server's score/total.
    const accuracy = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;
    return (
      <>
        <QuizReactionLayer ref={reactionLayerRef} audioEnabled={audioEnabled} />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            height: '100%',
            padding: '40px 16px',
            fontFamily: 'inherit',
            overflow: 'auto',
          }}
        >
          <h2
            style={{
              fontSize: '24px',
              fontWeight: 700,
              color: 'var(--on-surface)',
              margin: '0 0 8px',
              textAlign: 'center',
              fontFamily: 'inherit',
            }}
          >
            Quiz Complete
          </h2>
          <p
            style={{
              fontSize: '14px',
              color: 'var(--ink-40)',
              margin: '0 0 32px',
            }}
          >
            {title}
          </p>

          {saveError && (
            <div
              role="alert"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                padding: '12px 16px',
                margin: '0 0 24px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--error)',
                background: 'rgba(254,161,176,0.10)',
                maxWidth: 420,
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--on-surface)', textAlign: 'center' }}>
                We couldn&apos;t save this attempt. Your score below isn&apos;t recorded yet.
              </span>
              <button
                type="button"
                onClick={() => void submitAttempt()}
                disabled={submitting}
                style={{
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  background: 'var(--accent-strong)',
                  color: 'var(--on-primary-container)',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.6 : 1,
                  fontFamily: 'inherit',
                }}
              >
                {submitting ? 'Saving…' : 'Retry saving'}
              </button>
            </div>
          )}

          {/* Score circle */}
          <div
            style={{
              width: '140px',
              height: '140px',
              borderRadius: '50%',
              background:
                accuracy >= 70
                  ? 'rgb(var(--verdict-pass-rgb) / 0.15)'
                  : accuracy >= 40
                    ? 'rgb(var(--verdict-warn-rgb) / 0.15)'
                    : 'rgb(var(--verdict-fail-rgb) / 0.15)',
              border: `2px solid ${accuracy >= 70 ? 'rgb(var(--verdict-pass-rgb) / 0.4)' : accuracy >= 40 ? 'rgb(var(--verdict-warn-rgb) / 0.4)' : 'rgb(var(--verdict-fail-rgb) / 0.4)'}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '32px',
            }}
          >
            <span
              style={{
                fontSize: '36px',
                fontWeight: 800,
                color:
                  accuracy >= 70
                    ? 'var(--success)'
                    : accuracy >= 40
                      ? 'var(--warning)'
                      : 'var(--error)',
              }}
            >
              {accuracy}%
            </span>
            <span style={{ fontSize: '12px', color: 'var(--ink-40)' }}>accuracy</span>
          </div>

          {/* Stats grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isPhone ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
              gap: isPhone ? '8px' : '12px',
              width: '100%',
              maxWidth: isPhone ? '100%' : '400px',
              marginBottom: '32px',
            }}
          >
            {[
              {
                label: 'Score',
                value: `${correctCount}/${questions.length}`,
                color: 'var(--md-h3)',
              },
              { label: 'Right', value: `${correctCount}`, color: 'var(--success)' },
              { label: 'Wrong', value: `${wrongCount}`, color: 'var(--error)' },
              {
                label: 'Skipped',
                value: `${skippedCount}`,
                color: 'var(--ink-40)',
              },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  background: 'var(--ink-08)',
                  border: '1px solid var(--ink-12)',
                  borderRadius: '12px',
                  padding: '14px 8px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '20px', fontWeight: 700, color: stat.color }}>
                  {stat.value}
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    color: 'var(--ink-30)',
                    marginTop: '2px',
                  }}
                >
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {/* Time spent */}
          {quizStartTime && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                color: 'var(--ink-40)',
                marginBottom: '16px',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>
                schedule
              </span>
              <span>{elapsedSeconds}s</span>
            </div>
          )}

          {/* The shared shell owns navigation; results keep only session actions. */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <ActionButton onClick={reset} label="Retake Quiz" primary />
            <ActionButton onClick={startReview} label="Review Answers" />
          </div>
        </div>
      </>
    );
  }

  // The staged selection stands in for the committed answer until the shell's
  // "Check answer" action grades it.
  const displayAnswer = !isAnswered ? stagedAnswer : currentAnswer;
  const renderQuestionBody = () => {
    const kind: QuestionKind = question.kind ?? 'mc';
    const Renderer = RENDERERS[kind];
    if (!Renderer) {
      return (
        <div
          style={{
            width: '100%',
            maxWidth: isPhone ? '100%' : '480px',
            marginBottom: '20px',
            padding: '16px 20px',
            borderRadius: '12px',
            border: '1px solid rgb(var(--verdict-fail-rgb) / 0.3)',
            background: 'rgb(var(--verdict-fail-rgb) / 0.06)',
            color: 'var(--error)',
            fontSize: '13px',
            lineHeight: 1.6,
          }}
        >
          This question uses a type ({kind}) that isn&apos;t supported in this version yet.
        </div>
      );
    }
    return (
      <>
        {question.image ? (
          <QuestionFigure key={`fig-${question.id}`} img={question.image} isPhone={isPhone} />
        ) : null}
        <Renderer
          key={question.id}
          question={{
            id: question.id,
            kind,
            question: question.question,
            options: question.options,
            correctIndex: question.correctIndex,
            payload: question.payload as never,
            hint: question.hint,
            correctExplanation: question.correctExplanation,
            wrongExplanation: question.wrongExplanation,
            sortOrder: question.sortOrder,
          }}
          mode={mode === 'review' ? 'review' : 'quiz'}
          isAnswered={isAnswered}
          currentAnswer={displayAnswer}
          reviewAnswer={mode === 'review' ? answers.get(currentIndex)?.answer : undefined}
          gradedCorrect={currentEntry?.isCorrect}
          showHint={showHint}
          onToggleHint={() => setShowHint((v) => !v)}
          onSelectAnswer={selectAnswer}
          isPhone={isPhone}
          coarsePointer={coarsePointer}
          externalChrome
        />
      </>
    );
  };

  // QuizPlayerShell renders all navigation chrome; QuizViewer owns the body.
  // QuizPlayerShell renders the header, progress, sidebar, and the state-driven
  // action bar; QuizViewer renders only the question body here and reports
  // session state via the effect above. Results mode is handled by the shared
  // results return above (the shell renders it bare, no QuestionCard).
  return (
    <>
      <QuizReactionLayer ref={reactionLayerRef} audioEnabled={audioEnabled} />
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clipPath: 'inset(50%)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {liveAnnouncement}
      </div>
      {renderQuestionBody()}
    </>
  );
}

function ActionButton({
  onClick,
  label,
  primary,
}: {
  onClick: () => void;
  label: string;
  primary?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '10px 20px',
        borderRadius: '10px',
        border: primary ? 'none' : '1px solid rgba(140,82,255,0.3)',
        background: primary
          ? 'var(--accent-strong)'
          : hovered
            ? 'rgba(140,82,255,0.1)'
            : 'transparent',
        color: primary ? 'var(--on-primary-container)' : 'var(--md-h3)',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        boxShadow: primary ? '0 4px 16px rgba(140,82,255,0.3)' : 'none',
        transition: 'background 0.15s',
      }}
    >
      {label}
    </button>
  );
}
