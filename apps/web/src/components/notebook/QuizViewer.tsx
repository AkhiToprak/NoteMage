'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useCoarsePointer } from '@/hooks/useCoarsePointer';
import PlayerBottomBar from '@/components/quiz/PlayerBottomBar';
import { RENDERERS } from '@/components/quiz/questionRenderers';
import type { UserAnswer } from '@/components/quiz/questionRenderers/types';
import { grade } from '@/lib/quiz-grading';
import {
  QuizReactionLayer,
  type QuizReactionLayerHandle,
} from '@/components/quiz/QuizReactionLayer';
import { StreakTakeover } from '@/components/streak/StreakTakeover';
import { FireStreakTakeover } from '@/components/streak/FireStreakTakeover';
import { computeReaction, type ReactionMode } from '@/lib/quiz-reactions';
import { trackEvent } from '@/lib/telemetry';
import { haptics } from '@/lib/haptics';
import type { QuestionKind } from '@notemage/shared';
import SlideEditorModal, { SlideData } from './SlideEditorModal';

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

// Human label per kind for the non-MC PDF/PPTX placeholder + edit-disabled tooltip.
const KIND_LABEL: Record<QuestionKind, string> = {
  mc: 'Multiple choice',
  true_false: 'True/False',
  fill_blank: 'Fill-in-the-blank',
  word_bank: 'Word bank',
  match_pairs: 'Match pairs',
  sentence_reorder: 'Sentence reorder',
  equation: 'Equation',
  translation: 'Translation',
  code_output: 'Code output',
  timeline: 'Timeline',
  code_write: 'Code writing',
  diagram_cloze: 'Diagram',
};

interface SectionItem {
  id: string;
  title: string;
  parentId: string | null;
  children?: SectionItem[];
}

interface QuizViewerProps {
  notebookId: string;
  setId: string;
  title: string;
  initialQuestions: QuizQuestion[];
  assignedSectionId?: string | null;
  // Phase 10 — re-used by the checkpoint drawer (Phase 10.6) for assessment-
  // kind slots; defaults to false for direct quiz-player access.
  isCheckpoint?: boolean;
  // Hides all notebook-management chrome (edit / export / delete /
  // add-to-notebook) independent of grading. The learning-path viewer sets
  // this for every path quiz — including ungraded review slots — so the path
  // stays focused on answering, not authoring.
  hideManagementActions?: boolean;
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
  assignedSectionId,
  isCheckpoint = false,
  hideManagementActions = false,
  onComplete,
}: QuizViewerProps) {
  const { isPhone, isTablet } = useBreakpoint();
  // Touch-capability signal — gates the per-renderer tap-first interaction swaps.
  const coarsePointer = useCoarsePointer();
  const [questions, setQuestions] = useState<QuizQuestion[]>(initialQuestions);
  const [currentIndex, setCurrentIndex] = useState(0);
  // Full-screen streak takeover gates the jump to the next question. 'small' =
  // the 3-in-a-row dash takeover, 'mid' = the 5-in-a-row fire takeover.
  const [streakTakeover, setStreakTakeover] = useState<'small' | 'mid' | null>(null);
  const [answers, setAnswers] = useState<Map<number, AnswerEntry>>(new Map());
  // Per-set sessionStorage key for the in-progress draft (persisted below).
  const draftKey = `notemage:quiz-draft:${setId}`;
  const [showHint, setShowHint] = useState(false);
  const [mode, setMode] = useState<QuizMode>('quiz');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuestion, setEditQuestion] = useState('');
  const [editOptions, setEditOptions] = useState<string[]>(['', '', '', '']);
  const [editCorrectIndex, setEditCorrectIndex] = useState(0);
  const [editHint, setEditHint] = useState('');
  const [editCorrectExplanation, setEditCorrectExplanation] = useState('');
  const [editWrongExplanation, setEditWrongExplanation] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Section picker state
  const [showSectionPicker, setShowSectionPicker] = useState(false);
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [loadingSections, setLoadingSections] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    assignedSectionId ?? null
  );
  const [savingSection, setSavingSection] = useState(false);
  const [sectionSaved, setSectionSaved] = useState(!!assignedSectionId);
  const [showSlideEditor, setShowSlideEditor] = useState(false);

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
  const [attemptHistory, setAttemptHistory] = useState<
    Array<{
      id: string;
      score: number;
      total: number;
      percentage: number;
      timeSpent: number | null;
      createdAt: string;
    }>
  >([]);
  const [showHistory, setShowHistory] = useState(false);
  const [bestScore, setBestScore] = useState<number | null>(null);

  const question = questions[currentIndex];

  const quizSlides: SlideData[] = useMemo(() => {
    const LABELS = ['A', 'B', 'C', 'D'];
    return questions.map((q, i) => {
      const kind: QuestionKind = q.kind ?? 'mc';
      if (kind === 'mc') {
        return {
          title: `Question ${i + 1}`,
          content: `${q.question}\n\n${q.options.map((o, j) => `${LABELS[j]}. ${o}`).join('\n')}`,
          notes: `Answer: ${LABELS[q.correctIndex]}. ${q.options[q.correctIndex]}`,
        };
      }
      return {
        title: `Question ${i + 1}`,
        content: `${q.question}\n\n[${KIND_LABEL[kind]} question — answer in the NoteMage app]`,
        notes: `This is a ${KIND_LABEL[kind].toLowerCase()} question — full answer key is only viewable in-app.`,
      };
    });
  }, [questions]);
  const currentEntry = answers.get(currentIndex);
  const currentAnswer = currentEntry?.answer;
  const isAnswered = currentEntry !== undefined;

  // Stats
  const totalAnswered = answers.size;
  const correctCount = Array.from(answers.values()).filter((a) => a.isCorrect).length;
  const wrongCount = totalAnswered - correctCount;
  const skippedCount = questions.length - totalAnswered;
  // Graded checkpoints block "Finish" until every question has an answer — a
  // skipped question counts as wrong, so an accidental partial submission would
  // be an instant fail. Self-study (non-checkpoint) quizzes stay skip-friendly.
  const allAnswered = totalAnswered >= questions.length;

  // Commit an answer for one question and fire any matching mascot reaction.
  // Idempotent per index (the committedRef guard handles re-presses and
  // prev/next round-trips). Skipped outside the active quiz mode so review
  // navigation never triggers reactions.
  // Returns true when it opened the full-screen streak takeover, which *gates*
  // the advance to the next question (the takeover's Continue button advances).
  const commitFor = useCallback(
    (idx: number, isCorrect: boolean, hint: string | null): boolean => {
      if (mode !== 'quiz') return false;
      if (committedRef.current.has(idx)) return false;
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
        reactionMode,
      );
      let gated = false;
      if (reaction) {
        if (reaction.display === 'takeover') {
          // Show the takeover only when there's a next question to advance to —
          // never on the final question (the quiz should just finish there).
          if (idx < questions.length - 1) {
            setStreakTakeover(reaction.kind === 'streak_mid' ? 'mid' : 'small');
            gated = true;
          }
        } else {
          reactionLayerRef.current?.fire(reaction);
        }
      }

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
      return gated;
    },
    [mode, reactionMode, setId, questions.length],
  );

  const next = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      // Non-MC commit point. No-op for MC (already in committedRef) and for
      // unanswered/skipped questions.
      const entry = answers.get(currentIndex);
      const q = questions[currentIndex];
      const gated = entry && q ? commitFor(currentIndex, entry.isCorrect, q.hint) : false;
      // If this commit opened the streak takeover, don't advance yet — the
      // takeover's Continue button advances (so it shows before the next question).
      if (gated) return;
      setCurrentIndex((i) => i + 1);
      setShowHint(false);
      setLiveAnnouncement('');
    }
  }, [currentIndex, questions, answers, commitFor]);

  // Continue from a streak takeover (3-in-a-row dash or 5-in-a-row fire) →
  // advance to the next question. commitFor is idempotent, so the current
  // question won't re-trigger it.
  const continueAfterStreak = useCallback(() => {
    setStreakTakeover(null);
    setCurrentIndex((i) => (i < questions.length - 1 ? i + 1 : i));
    setShowHint(false);
    setLiveAnnouncement('');
  }, [questions.length]);

  const prev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setShowHint(false);
      setLiveAnnouncement('');
    }
  }, [currentIndex]);

  const reset = useCallback(() => {
    setCurrentIndex(0);
    setStreakTakeover(null);
    setAnswers(new Map());
    setShowHint(false);
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
      const { isCorrect } = grade(
        kind,
        q.payload,
        { options: q.options, correctIndex: q.correctIndex },
        answer
      );
      setAnswers((prev) => new Map(prev).set(currentIndex, { answer, isCorrect }));
      setLiveAnnouncement(isCorrect ? 'Correct.' : 'Not quite. The answer is shown below.');
      // Commit the instant the answer is *finalised*, so the streak reaction /
      // takeover fires immediately on a correct answer — not after the learner
      // taps Next. MC / true-false / diagram_cloze and every Submit-style kind
      // lock on their single selection/submit; match_pairs is incremental, so
      // it's only final once every pair is connected. commitFor is idempotent
      // (committedRef), so next()/finish() never double-commit.
      const pairCount =
        kind === 'match_pairs'
          ? (q.payload as { pairs?: unknown[] } | null)?.pairs?.length ?? 0
          : 0;
      const isFinalAnswer =
        kind === 'match_pairs'
          ? answer.kind === 'match_pairs' &&
            pairCount > 0 &&
            answer.connections.length >= pairCount
          : true;
      if (isFinalAnswer) commitFor(currentIndex, isCorrect, q.hint);
    },
    [mode, isAnswered, currentIndex, questions, commitFor]
  );

  // POST the attempt. Returns true on success; on any failure (network or a
  // non-success body) sets saveError so the results screen can offer a retry.
  // Separated from finish() so the retry button can re-run it without
  // re-entering the results transition.
  const submitAttempt = useCallback(async (): Promise<boolean> => {
    setSubmitting(true);
    setSaveError(false);
    try {
      const timeSpent = Math.round((Date.now() - quizStartTime) / 1000);
      const answersPayload = Array.from(answers.entries()).map(([idx, entry]) => ({
        questionId: questions[idx].id,
        userAnswer: entry.answer,
      }));
      const res = await fetch(`/api/notebooks/${notebookId}/quiz-sets/${setId}/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: answersPayload, timeSpent }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setAttemptHistory((prev) => [json.data, ...prev]);
        if (bestScore === null || json.data.percentage > bestScore) {
          setBestScore(json.data.percentage);
        }
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
          reactionMode,
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
  }, [
    answers,
    questions,
    notebookId,
    setId,
    quizStartTime,
    bestScore,
    isCheckpoint,
    reactionMode,
    onComplete,
  ]);

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
        }),
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
      if (editingId) return;
      // While the streak takeover is up it owns the keyboard (Esc/Enter = Continue);
      // don't let ←/→ advance the quiz behind it.
      if (streakTakeover) return;
      // Don't hijack keys while the learner is typing into a text-input question
      // (fill-blank, translation, equation, code). Otherwise ←/→ would move
      // between questions instead of the caret, and A/B/C/D would be captured as
      // MC answers instead of reaching the field.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        prev();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        next();
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
  }, [prev, next, selectAnswer, editingId, questions, currentIndex, streakTakeover]);

  // Warm the streak-takeover hero art into cache on mount, so when a 3-/5-streak
  // fires the full-screen takeover the mascot is already loaded (no "pop in" wait
  // on the ~650KB fire PNG over mobile data).
  useEffect(() => {
    ['/streak/fire-hero.png', '/streak/streak-hero.png'].forEach((src) => {
      const img = new window.Image();
      img.src = src;
    });
  }, []);

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

  // Fetch attempt history
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/quiz-sets/${setId}/attempts`);
        const json = await res.json();
        if (json.success && json.data) {
          setAttemptHistory(json.data);
          if (json.data.length > 0) {
            const best = Math.max(...json.data.map((a: { percentage: number }) => a.percentage));
            setBestScore(best);
          }
        }
      } catch {
        /* silent */
      }
    };
    fetchHistory();
  }, [notebookId, setId]);

  const downloadJSON = useCallback(() => {
    const data = {
      title,
      questions: questions.map((q) => ({
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
        hint: q.hint,
        correctExplanation: q.correctExplanation,
        wrongExplanation: q.wrongExplanation,
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_quiz.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, [questions, title]);

  const openSlideEditor = useCallback(() => {
    setShowSlideEditor(true);
  }, []);

  const downloadPdf = useCallback(() => {
    const a = document.createElement('a');
    a.href = `/api/notebooks/${notebookId}/quiz-sets/${setId}/export-pdf`;
    a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_quiz.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [notebookId, setId, title]);

  const deleteSet = useCallback(async () => {
    if (!window.confirm('Delete this entire quiz set? This cannot be undone.')) return;
    try {
      await fetch(`/api/notebooks/${notebookId}/quiz-sets/${setId}`, { method: 'DELETE' });
      router.push(`/study-packs/${notebookId}`);
    } catch {
      /* silent */
    }
  }, [notebookId, setId, router]);

  // ── Edit question ──
  const startEdit = (q: QuizQuestion) => {
    setEditingId(q.id);
    setEditQuestion(q.question);
    setEditOptions([...q.options]);
    setEditCorrectIndex(q.correctIndex);
    setEditHint(q.hint ?? '');
    setEditCorrectExplanation(q.correctExplanation ?? '');
    setEditWrongExplanation(q.wrongExplanation ?? '');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      const res = await fetch(
        `/api/notebooks/${notebookId}/quiz-sets/${setId}/questions/${editingId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: editQuestion,
            options: editOptions,
            correctIndex: editCorrectIndex,
            hint: editHint || null,
            correctExplanation: editCorrectExplanation || null,
            wrongExplanation: editWrongExplanation || null,
          }),
        }
      );
      const json = await res.json();
      if (json.success) {
        setQuestions((prev) =>
          prev.map((q) =>
            q.id === editingId
              ? {
                  ...q,
                  question: editQuestion,
                  options: editOptions,
                  correctIndex: editCorrectIndex,
                  hint: editHint || null,
                  correctExplanation: editCorrectExplanation || null,
                  wrongExplanation: editWrongExplanation || null,
                }
              : q
          )
        );
      }
    } catch {
      /* silent */
    }
    setEditingId(null);
  };

  // ── Delete question ──
  const deleteQuestion = async (questionId: string) => {
    if (!window.confirm('Delete this quiz question?')) return;
    try {
      await fetch(`/api/notebooks/${notebookId}/quiz-sets/${setId}/questions/${questionId}`, {
        method: 'DELETE',
      });
      const newQuestions = questions.filter((q) => q.id !== questionId);
      setQuestions(newQuestions);
      if (currentIndex >= newQuestions.length)
        setCurrentIndex(Math.max(0, newQuestions.length - 1));
    } catch {
      /* silent */
    }
  };

  // ── Section picker ──
  const openSectionPicker = async () => {
    setShowSectionPicker(true);
    setLoadingSections(true);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/sections`);
      const json = await res.json();
      if (json.success) {
        const flat: SectionItem[] = json.data;
        const map = new Map<string, SectionItem>();
        const roots: SectionItem[] = [];
        flat.forEach((s) => map.set(s.id, { ...s, children: [] }));
        flat.forEach((s) => {
          const node = map.get(s.id)!;
          if (s.parentId && map.has(s.parentId)) {
            map.get(s.parentId)!.children!.push(node);
          } else {
            roots.push(node);
          }
        });
        setSections(roots);
      }
    } catch {
      /* silent */
    }
    setLoadingSections(false);
  };

  const assignToSection = async (sectionId: string) => {
    setSavingSection(true);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/quiz-sets/${setId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId }),
      });
      const json = await res.json();
      if (json.success) {
        setSelectedSectionId(sectionId);
        setSectionSaved(true);
        setTimeout(() => setShowSectionPicker(false), 600);
      }
    } catch {
      /* silent */
    }
    setSavingSection(false);
  };

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
    const accuracy =
      questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;
    return (
      <>
        <QuizReactionLayer ref={reactionLayerRef} audioEnabled={audioEnabled} />
      <div
        ref={containerRef}
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
              color: accuracy >= 70 ? 'var(--success)' : accuracy >= 40 ? 'var(--warning)' : 'var(--error)',
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
            { label: 'Score', value: `${correctCount}/${questions.length}`, color: 'var(--md-h3)' },
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
            <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>schedule</span>
            <span>{elapsedSeconds}s</span>
          </div>
        )}

        {/* Previous best comparison */}
        {attemptHistory.length > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              borderRadius: '10px',
              background: 'rgba(140,82,255,0.06)',
              border: '1px solid rgba(140,82,255,0.15)',
              marginBottom: '16px',
              fontSize: '13px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--md-h3)' }} aria-hidden>trending_up</span>
            <span style={{ color: 'var(--ink-60)' }}>
              Previous best: <strong style={{ color: 'var(--md-h3)' }}>{bestScore}%</strong>
              {' · '}
              Attempts: <strong style={{ color: 'var(--md-h3)' }}>{attemptHistory.length}</strong>
            </span>
          </div>
        )}

        {/* Action buttons — management actions (download / history) are
            notebook-only chrome. The checkpoint context renders its own
            result panel via the parent, so we hide them here when
            `isCheckpoint`. */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <ActionButton onClick={reset} label="Retake Quiz" primary />
          <ActionButton onClick={startReview} label="Review Answers" />
          {!isCheckpoint && !hideManagementActions && (
            <>
              <ActionButton onClick={downloadJSON} label="Download JSON" />
              <ActionButton onClick={openSlideEditor} label="Download PPTX" />
              <ActionButton onClick={downloadPdf} label="Download PDF" />
              {attemptHistory.length > 0 && (
                <ActionButton onClick={() => setShowHistory(true)} label="View History" />
              )}
            </>
          )}
        </div>

        {/* History modal */}
        {showHistory && (
          <div
            onClick={() => setShowHistory(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1000,
              background: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '420px',
                maxHeight: '500px',
                background: 'var(--background)',
                border: '1px solid rgba(174,137,255,0.45)',
                borderRadius: '16px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 20px',
                  borderBottom: '1px solid rgba(174,137,255,0.30)',
                }}
              >
                <h3
                  style={{
                    fontSize: '15px',
                    fontWeight: 700,
                    color: 'var(--on-surface)',
                    margin: 0,
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>history</span> Quiz History
                </h3>
                <button
                  onClick={() => setShowHistory(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--ink-40)',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>close</span>
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
                {attemptHistory.length === 0 ? (
                  <div
                    style={{
                      padding: '32px 16px',
                      textAlign: 'center',
                      fontSize: '13px',
                      color: 'var(--ink-30)',
                    }}
                  >
                    No attempts yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {attemptHistory.map((attempt, i) => (
                      <div
                        key={attempt.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '12px 14px',
                          borderRadius: '10px',
                          background: i === 0 ? 'rgba(140,82,255,0.08)' : 'var(--ink-04)',
                          border: `1px solid ${i === 0 ? 'rgba(140,82,255,0.2)' : 'var(--ink-08)'}`,
                        }}
                      >
                        <div
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '10px',
                            background:
                              attempt.percentage >= 70
                                ? 'rgb(var(--verdict-pass-rgb) / 0.1)'
                                : attempt.percentage >= 40
                                  ? 'rgb(var(--verdict-warn-rgb) / 0.1)'
                                  : 'rgb(var(--verdict-fail-rgb) / 0.1)',
                            border: `1px solid ${
                              attempt.percentage >= 70
                                ? 'rgb(var(--verdict-pass-rgb) / 0.3)'
                                : attempt.percentage >= 40
                                  ? 'rgb(var(--verdict-warn-rgb) / 0.3)'
                                  : 'rgb(var(--verdict-fail-rgb) / 0.3)'
                            }`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '14px',
                            fontWeight: 700,
                            color:
                              attempt.percentage >= 70
                                ? 'var(--success)'
                                : attempt.percentage >= 40
                                  ? 'var(--warning)'
                                  : 'var(--error)',
                          }}
                        >
                          {Math.round(attempt.percentage)}%
                        </div>
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              fontSize: '13px',
                              color: 'var(--on-surface)',
                              fontWeight: 600,
                            }}
                          >
                            {attempt.score}/{attempt.total} correct
                            {i === 0 && (
                              <span
                                style={{ color: 'var(--md-h3)', fontSize: '11px', marginLeft: '6px' }}
                              >
                                Latest
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: '11px',
                              color: 'var(--ink-30)',
                              marginTop: '2px',
                            }}
                          >
                            {new Date(attempt.createdAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {attempt.timeSpent && ` · ${attempt.timeSpent}s`}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      </>
    );
  }

  // ── Quiz / Review mode ──
  const showCheckpointWarn =
    isCheckpoint && mode === 'quiz' && currentIndex === questions.length - 1 && !allAnswered;
  // Pin the nav to the bottom on phones where nothing renders after it (path
  // checkpoints, or management actions hidden) — but not when the checkpoint
  // warning would otherwise render below it.
  const pinNav = isPhone && (isCheckpoint || hideManagementActions) && !showCheckpointWarn;
  return (
    <>
      <QuizReactionLayer ref={reactionLayerRef} audioEnabled={audioEnabled} />
      {streakTakeover === 'small' && (
        <StreakTakeover audioEnabled={audioEnabled} onDismiss={continueAfterStreak} />
      )}
      {streakTakeover === 'mid' && (
        <FireStreakTakeover audioEnabled={audioEnabled} onDismiss={continueAfterStreak} />
      )}
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
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        height: '100%',
        padding: pinNav ? '24px 16px 0' : '24px 16px',
        fontFamily: 'inherit',
        overflow: 'auto',
      }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {/* Title */}
      <h2
        style={{
          fontSize: '20px',
          fontWeight: 700,
          color: 'var(--on-surface)',
          margin: '0 0 4px',
          textAlign: 'center',
          fontFamily: 'inherit',
          letterSpacing: '-0.02em',
        }}
      >
        {title}
      </h2>

      {bestScore !== null && (
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: bestScore >= 70 ? 'var(--success)' : bestScore >= 40 ? 'var(--warning)' : 'var(--error)',
            background:
              bestScore >= 70
                ? 'rgb(var(--verdict-pass-rgb) / 0.1)'
                : bestScore >= 40
                  ? 'rgb(var(--verdict-warn-rgb) / 0.1)'
                  : 'rgb(var(--verdict-fail-rgb) / 0.1)',
            border: `1px solid ${bestScore >= 70 ? 'rgb(var(--verdict-pass-rgb) / 0.2)' : bestScore >= 40 ? 'rgb(var(--verdict-warn-rgb) / 0.2)' : 'rgb(var(--verdict-fail-rgb) / 0.2)'}`,
            borderRadius: '9999px',
            padding: '2px 10px',
            marginBottom: '4px',
          }}
        >
          Best: {Math.round(bestScore)}%
        </span>
      )}

      {mode === 'review' && (
        <span
          style={{
            fontSize: '11px',
            color: 'var(--warning)',
            fontWeight: 600,
            background: 'rgb(var(--verdict-warn-rgb) / 0.1)',
            border: '1px solid rgb(var(--verdict-warn-rgb) / 0.2)',
            borderRadius: '9999px',
            padding: '2px 10px',
            marginBottom: '4px',
          }}
        >
          Review Mode
        </span>
      )}

      {/* Progress */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'baseline',
          gap: '4px',
          padding: '5px 12px',
          marginBottom: '20px',
          borderRadius: '999px',
          border: '1px solid rgba(174,137,255,0.22)',
          background: 'rgba(174,137,255,0.06)',
          fontSize: '12px',
          color: 'var(--ink-50)',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.04em',
        }}
      >
        <span style={{ color: 'var(--md-em)', fontWeight: 700 }}>{currentIndex + 1}</span>
        <span style={{ color: 'var(--ink-30)' }}>/</span>
        <span>{questions.length}</span>
      </div>

      {/* Question card */}
      {editingId === question?.id ? (
        /* Edit overlay */
        <div
          style={{
            width: '100%',
            maxWidth: isPhone ? '100%' : '480px',
            borderRadius: '16px',
            background: 'var(--surface-container-lowest)',
            border: '1px solid rgba(174,137,255,0.45)',
            padding: isPhone ? '16px' : '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            marginBottom: '20px',
          }}
        >
          <label style={labelStyle}>Question</label>
          <textarea
            value={editQuestion}
            onChange={(e) => setEditQuestion(e.target.value)}
            rows={3}
            style={textareaStyle}
          />
          {editOptions.map((opt, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => setEditCorrectIndex(i)}
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  flexShrink: 0,
                  border: `2px solid ${editCorrectIndex === i ? 'var(--success)' : 'rgba(140,82,255,0.3)'}`,
                  background: editCorrectIndex === i ? 'rgb(var(--verdict-pass-rgb) / 0.15)' : 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: editCorrectIndex === i ? 'var(--success)' : 'transparent',
                  fontSize: '12px',
                  fontWeight: 700,
                }}
              >
                {editCorrectIndex === i && <span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>check</span>}
              </button>
              <input
                value={opt}
                onChange={(e) => {
                  const newOpts = [...editOptions];
                  newOpts[i] = e.target.value;
                  setEditOptions(newOpts);
                }}
                placeholder={`Option ${String.fromCharCode(65 + i)}`}
                style={{
                  flex: 1,
                  background: 'rgba(140,82,255,0.08)',
                  border: '1px solid rgba(140,82,255,0.2)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  fontSize: '13px',
                  color: 'var(--on-surface)',
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
            </div>
          ))}
          <label style={labelStyle}>Hint (optional)</label>
          <input
            value={editHint}
            onChange={(e) => setEditHint(e.target.value)}
            style={inputStyle}
          />
          <label style={labelStyle}>Correct Explanation (optional)</label>
          <textarea
            value={editCorrectExplanation}
            onChange={(e) => setEditCorrectExplanation(e.target.value)}
            rows={2}
            style={textareaStyle}
          />
          <label style={labelStyle}>Wrong Explanation (optional)</label>
          <textarea
            value={editWrongExplanation}
            onChange={(e) => setEditWrongExplanation(e.target.value)}
            rows={2}
            style={textareaStyle}
          />
          <div
            style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}
          >
            <button onClick={() => setEditingId(null)} style={cancelBtnStyle}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>close</span> Cancel
            </button>
            <button onClick={saveEdit} style={saveBtnStyle}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>check</span> Save
            </button>
          </div>
        </div>
      ) : (
        (() => {
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
              {/* Figure-reuse (P4): exhibit image above the prompt, in both
                  quiz and review modes. Keyed so it swaps with the question. */}
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
                currentAnswer={currentAnswer}
                reviewAnswer={mode === 'review' ? answers.get(currentIndex)?.answer : undefined}
                gradedCorrect={currentEntry?.isCorrect}
                showHint={showHint}
                onToggleHint={() => setShowHint((v) => !v)}
                onSelectAnswer={selectAnswer}
                isPhone={isPhone}
                coarsePointer={coarsePointer}
              />
            </>
          );
        })()
      )}

      {/* Navigation controls — pinned to the bottom on touch checkpoint surfaces */}
      <PlayerBottomBar pinned={pinNav}>
        <NavButton onClick={prev} disabled={currentIndex === 0} title="Previous (←)">
          <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden>chevron_left</span>
        </NavButton>
        <NavButton onClick={reset} title="Reset">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>replay</span>
        </NavButton>
        {currentIndex === questions.length - 1 && mode === 'quiz' ? (
          <NavButton
            onClick={finish}
            disabled={isCheckpoint && !allAnswered}
            highlight={!isCheckpoint || allAnswered}
            title={
              isCheckpoint && !allAnswered
                ? `Answer every question to finish (${skippedCount} unanswered)`
                : 'Finish Quiz'
            }
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>check</span>
          </NavButton>
        ) : (
          <NavButton
            onClick={next}
            disabled={currentIndex === questions.length - 1}
            title="Next (→)"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden>chevron_right</span>
          </NavButton>
        )}
      </PlayerBottomBar>

      {showCheckpointWarn && (
          <p
            role="status"
            style={{
              fontSize: '12px',
              color: 'var(--warning)',
              margin: '0 0 16px',
              textAlign: 'center',
              maxWidth: '320px',
            }}
          >
            Answer all {questions.length} questions to finish — {skippedCount}{' '}
            {skippedCount === 1 ? 'still needs' : 'still need'} an answer.
          </p>
        )}

      {/* Per-question action bar — all notebook-management UI
          (edit / export / delete / add-to-notebook). Hidden entirely
          inside the learning-path viewer (graded or not) so it stays
          focused on answering questions. */}
      {!isCheckpoint && !hideManagementActions && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {question &&
            editingId !== question.id &&
            mode !== 'review' &&
            (question.kind ?? 'mc') === 'mc' && (
              <SmallButton
                onClick={() => startEdit(question)}
                icon={<span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>edit</span>}
                label="Edit"
              />
            )}
          <SmallButton onClick={downloadJSON} icon={<span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>download</span>} label="JSON" />
          <SmallButton onClick={openSlideEditor} icon={<span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>download</span>} label="PPTX" />
          <SmallButton onClick={downloadPdf} icon={<span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>download</span>} label="PDF" />
          {sectionSaved ? (
            <SmallButton
              onClick={openSectionPicker}
              icon={<span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>task_alt</span>}
              label="In Study Pack"
            />
          ) : (
            <SmallButton
              onClick={openSectionPicker}
              icon={<span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>library_add</span>}
              label="Add to Study Pack"
            />
          )}
          {question && mode !== 'review' && (
            <SmallButton
              onClick={() => deleteQuestion(question.id)}
              icon={<span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>delete</span>}
              label="Delete Question"
              danger
            />
          )}
          <SmallButton onClick={deleteSet} icon={<span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>delete</span>} label="Delete Set" danger />
        </div>
      )}

      {/* Section picker modal */}
      {showSectionPicker && (
        <div
          onClick={() => setShowSectionPicker(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '380px',
              maxHeight: '420px',
              background: 'var(--background)',
              border: '1px solid rgba(174,137,255,0.45)',
              borderRadius: '16px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid rgba(174,137,255,0.30)',
              }}
            >
              <h3
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: 'var(--on-surface)',
                  margin: 0,
                  fontFamily: 'inherit',
                }}
              >
                Add to Section
              </h3>
              <button
                onClick={() => setShowSectionPicker(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--ink-40)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>close</span>
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
              {loadingSections ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '40px 0',
                    color: 'var(--ink-30)',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20, animation: 'spin 1s linear infinite' }} aria-hidden>progress_activity</span>
                </div>
              ) : sections.length === 0 ? (
                <div
                  style={{
                    padding: '32px 16px',
                    textAlign: 'center',
                    fontSize: '13px',
                    color: 'var(--ink-30)',
                  }}
                >
                  No sections in this notebook yet.
                </div>
              ) : (
                sections.map((s) => (
                  <SectionPickerNode
                    key={s.id}
                    section={s}
                    depth={0}
                    selectedId={selectedSectionId}
                    saving={savingSection}
                    onSelect={assignToSection}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Slide editor modal */}
      {showSlideEditor && (
        <SlideEditorModal
          initialSlides={quizSlides}
          presentationTitle={title}
          onExport={() => setShowSlideEditor(false)}
          onClose={() => setShowSlideEditor(false)}
        />
      )}

      {/* History modal */}
      {showHistory && (
        <div
          onClick={() => setShowHistory(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '420px',
              maxHeight: '500px',
              background: 'var(--background)',
              border: '1px solid rgba(174,137,255,0.45)',
              borderRadius: '16px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid rgba(174,137,255,0.30)',
              }}
            >
              <h3
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: 'var(--on-surface)',
                  margin: 0,
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>history</span> Quiz History
              </h3>
              <button
                onClick={() => setShowHistory(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--ink-40)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>close</span>
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
              {attemptHistory.length === 0 ? (
                <div
                  style={{
                    padding: '32px 16px',
                    textAlign: 'center',
                    fontSize: '13px',
                    color: 'var(--ink-30)',
                  }}
                >
                  No attempts yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {attemptHistory.map((attempt, i) => (
                    <div
                      key={attempt.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px 14px',
                        borderRadius: '10px',
                        background: i === 0 ? 'rgba(140,82,255,0.08)' : 'var(--ink-04)',
                        border: `1px solid ${i === 0 ? 'rgba(140,82,255,0.2)' : 'var(--ink-08)'}`,
                      }}
                    >
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '10px',
                          background:
                            attempt.percentage >= 70
                              ? 'rgb(var(--verdict-pass-rgb) / 0.1)'
                              : attempt.percentage >= 40
                                ? 'rgb(var(--verdict-warn-rgb) / 0.1)'
                                : 'rgb(var(--verdict-fail-rgb) / 0.1)',
                          border: `1px solid ${
                            attempt.percentage >= 70
                              ? 'rgb(var(--verdict-pass-rgb) / 0.3)'
                              : attempt.percentage >= 40
                                ? 'rgb(var(--verdict-warn-rgb) / 0.3)'
                                : 'rgb(var(--verdict-fail-rgb) / 0.3)'
                          }`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '14px',
                          fontWeight: 700,
                          color:
                            attempt.percentage >= 70
                              ? 'var(--success)'
                              : attempt.percentage >= 40
                                ? 'var(--warning)'
                                : 'var(--error)',
                        }}
                      >
                        {Math.round(attempt.percentage)}%
                      </div>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{ fontSize: '13px', color: 'var(--on-surface)', fontWeight: 600 }}
                        >
                          {attempt.score}/{attempt.total} correct
                          {i === 0 && (
                            <span style={{ color: 'var(--md-h3)', fontSize: '11px', marginLeft: '6px' }}>
                              Latest
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'var(--ink-30)',
                            marginTop: '2px',
                          }}
                        >
                          {new Date(attempt.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {attempt.timeSpent && ` · ${attempt.timeSpent}s`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

// ── Shared styles ──
const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--ink-40)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

const textareaStyle: React.CSSProperties = {
  resize: 'none',
  background: 'rgba(140,82,255,0.08)',
  border: '1px solid rgba(140,82,255,0.2)',
  borderRadius: '8px',
  padding: '10px',
  fontSize: '13px',
  color: 'var(--on-surface)',
  fontFamily: 'inherit',
  outline: 'none',
};

const inputStyle: React.CSSProperties = {
  ...textareaStyle,
  padding: '8px 12px',
};

const cancelBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '8px 14px',
  borderRadius: '8px',
  border: '1px solid var(--ink-12)',
  background: 'transparent',
  color: 'var(--ink-50)',
  fontSize: '13px',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const saveBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '8px 14px',
  borderRadius: '8px',
  border: 'none',
  background: 'var(--accent-strong)',
  color: 'var(--on-primary-container)',
  fontSize: '13px',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

// ── Sub-components (mirror FlashcardViewer patterns) ──

function SectionPickerNode({
  section,
  depth,
  selectedId,
  saving,
  onSelect,
}: {
  section: SectionItem;
  depth: number;
  selectedId: string | null;
  saving: boolean;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [hovered, setHovered] = useState(false);
  const isSelected = selectedId === section.id;
  const hasChildren = section.children && section.children.length > 0;

  return (
    <div>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => !saving && onSelect(section.id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          paddingLeft: `${12 + depth * 16}px`,
          borderRadius: '8px',
          cursor: saving ? 'not-allowed' : 'pointer',
          background: isSelected
            ? 'rgba(140,82,255,0.2)'
            : hovered
              ? 'rgba(140,82,255,0.08)'
              : 'transparent',
          border: isSelected ? '1px solid rgba(140,82,255,0.4)' : '1px solid transparent',
          transition: 'background 0.12s ease',
          marginBottom: '2px',
        }}
      >
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            style={{
              background: 'none',
              border: 'none',
              padding: '0',
              cursor: 'pointer',
              color: 'var(--ink-30)',
              display: 'flex',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: 14,
                transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 0.15s ease',
              }}
              aria-hidden
            >
              expand_more
            </span>
          </button>
        )}
        {!hasChildren && <div style={{ width: '14px' }} />}
        <span
          style={{
            fontSize: '13px',
            color: isSelected ? 'var(--md-h3)' : 'var(--on-surface)',
            fontWeight: isSelected ? 600 : 400,
            fontFamily: 'inherit',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {section.title}
        </span>
        {isSelected && <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--accent-strong)', flexShrink: 0 }} aria-hidden>check</span>}
      </div>
      {hasChildren &&
        expanded &&
        section.children!.map((child) => (
          <SectionPickerNode
            key={child.id}
            section={child}
            depth={depth + 1}
            selectedId={selectedId}
            saving={saving}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

function NavButton({
  onClick,
  disabled,
  title,
  children,
  highlight,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '44px',
        height: '44px',
        borderRadius: '12px',
        border: highlight
          ? 'none'
          : disabled
            ? '1px solid rgba(174,137,255,0.12)'
            : `1px solid ${hovered ? 'rgba(174,137,255,0.55)' : 'rgba(174,137,255,0.32)'}`,
        background: highlight
          ? 'var(--accent-strong)'
          : disabled
            ? 'rgba(140,82,255,0.03)'
            : hovered
              ? 'rgba(140,82,255,0.18)'
              : 'rgba(140,82,255,0.10)',
        color: highlight
          ? 'var(--on-primary-container)'
          : disabled
            ? 'var(--ink-20)'
            : hovered
              ? 'var(--on-surface)'
              : 'var(--md-em)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease',
      }}
    >
      {children}
    </button>
  );
}

function SmallButton({
  onClick,
  icon,
  label,
  danger,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        padding: '6px 12px',
        borderRadius: '8px',
        border: `1px solid ${danger ? 'rgb(var(--verdict-fail-rgb) / 0.2)' : 'rgba(140,82,255,0.15)'}`,
        background: hovered
          ? danger
            ? 'rgb(var(--verdict-fail-rgb) / 0.1)'
            : 'rgba(140,82,255,0.1)'
          : 'transparent',
        color: danger
          ? hovered
            ? 'var(--error)'
            : 'rgb(var(--verdict-fail-rgb) / 0.6)'
          : hovered
            ? 'var(--md-h3)'
            : 'var(--ink-40)',
        fontSize: '12px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 0.12s ease, color 0.12s ease',
      }}
    >
      {icon} {label}
    </button>
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
        background: primary ? 'var(--accent-strong)' : hovered ? 'rgba(140,82,255,0.1)' : 'transparent',
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
