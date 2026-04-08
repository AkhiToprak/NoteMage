'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Download,
  Pencil,
  Plus,
  Trash2,
  X,
  Check,
  BookPlus,
  ChevronDown,
  Loader2,
  BookCheck,
  Lightbulb,
  CheckCircle2,
  XCircle,
  Clock,
  History,
  TrendingUp,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useNotebookWorkspace } from '@/components/notebook/NotebookWorkspaceContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import SlideEditorModal, { SlideData } from './SlideEditorModal';

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  hint: string | null;
  correctExplanation: string | null;
  wrongExplanation: string | null;
  sortOrder: number;
}

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
}

type QuizMode = 'quiz' | 'review' | 'results';

export default function QuizViewer({
  notebookId,
  setId,
  title,
  initialQuestions,
  assignedSectionId,
}: QuizViewerProps) {
  const { isPhone, isTablet } = useBreakpoint();
  const [questions, setQuestions] = useState<QuizQuestion[]>(initialQuestions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<number, number>>(new Map());
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
  const { refreshSections, refreshChats } = useNotebookWorkspace();

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
    return questions.map((q, i) => ({
      title: `Question ${i + 1}`,
      content: `${q.question}\n\n${q.options.map((o, j) => `${LABELS[j]}. ${o}`).join('\n')}`,
      notes: `Answer: ${LABELS[q.correctIndex]}. ${q.options[q.correctIndex]}`,
    }));
  }, [questions]);
  const currentAnswer = answers.get(currentIndex);
  const isAnswered = currentAnswer !== undefined;
  const isCorrect = isAnswered && currentAnswer === question?.correctIndex;

  // Stats
  const totalAnswered = answers.size;
  const correctCount = Array.from(answers.entries()).filter(
    ([idx, ans]) => questions[idx]?.correctIndex === ans
  ).length;
  const wrongCount = totalAnswered - correctCount;
  const skippedCount = questions.length - totalAnswered;

  const next = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1);
      setShowHint(false);
    }
  }, [currentIndex, questions.length]);

  const prev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setShowHint(false);
    }
  }, [currentIndex]);

  const reset = useCallback(() => {
    setCurrentIndex(0);
    setAnswers(new Map());
    setShowHint(false);
    setMode('quiz');
  }, []);

  const selectAnswer = useCallback(
    (optionIndex: number) => {
      if (mode !== 'quiz' || isAnswered) return;
      setAnswers((prev) => new Map(prev).set(currentIndex, optionIndex));
    },
    [mode, isAnswered, currentIndex]
  );

  const finish = useCallback(async () => {
    setMode('results');
    setSubmitting(true);
    try {
      const timeSpent = Math.round((Date.now() - quizStartTime) / 1000);
      const answersPayload = Array.from(answers.entries()).map(([idx, selectedIdx]) => ({
        questionId: questions[idx].id,
        selectedIdx,
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
      }
    } catch {
      /* silent */
    }
    setSubmitting(false);
  }, [answers, questions, notebookId, setId, quizStartTime, bestScore]);

  const startReview = useCallback(() => {
    setMode('review');
    setCurrentIndex(0);
    setShowHint(false);
  }, []);

  // Elapsed time ticker
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds(Math.round((Date.now() - quizStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [quizStartTime]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editingId) return;
      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        prev();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        next();
      } else if (e.code === 'Digit1' || e.code === 'KeyA') {
        e.preventDefault();
        selectAnswer(0);
      } else if (e.code === 'Digit2' || e.code === 'KeyB') {
        e.preventDefault();
        selectAnswer(1);
      } else if (e.code === 'Digit3' || e.code === 'KeyC') {
        e.preventDefault();
        selectAnswer(2);
      } else if (e.code === 'Digit4' || e.code === 'KeyD') {
        e.preventDefault();
        selectAnswer(3);
      } else if (e.code === 'KeyH') {
        e.preventDefault();
        setShowHint((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [prev, next, selectAnswer, editingId]);

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
      refreshSections();
      refreshChats();
      router.push(`/notebooks/${notebookId}`);
    } catch {
      /* silent */
    }
  }, [notebookId, setId, refreshSections, refreshChats, router]);

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
        refreshSections();
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
          color: 'rgba(237,233,255,0.4)',
          fontFamily: 'inherit',
        }}
      >
        <p style={{ fontSize: '16px', marginBottom: '16px' }}>No questions in this quiz.</p>
      </div>
    );
  }

  // ── Results screen ──
  if (mode === 'results') {
    const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
    return (
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
            color: '#ede9ff',
            margin: '0 0 8px',
            textAlign: 'center',
            fontFamily: 'inherit',
          }}
        >
          Quiz Complete
        </h2>
        <p style={{ fontSize: '14px', color: 'rgba(237,233,255,0.4)', margin: '0 0 32px' }}>
          {title}
        </p>

        {/* Score circle */}
        <div
          style={{
            width: '140px',
            height: '140px',
            borderRadius: '50%',
            background:
              accuracy >= 70
                ? 'linear-gradient(135deg, rgba(74,222,128,0.15), rgba(74,222,128,0.05))'
                : accuracy >= 40
                  ? 'linear-gradient(135deg, rgba(251,191,36,0.15), rgba(251,191,36,0.05))'
                  : 'linear-gradient(135deg, rgba(252,165,165,0.15), rgba(252,165,165,0.05))',
            border: `2px solid ${accuracy >= 70 ? 'rgba(74,222,128,0.4)' : accuracy >= 40 ? 'rgba(251,191,36,0.4)' : 'rgba(252,165,165,0.4)'}`,
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
              color: accuracy >= 70 ? '#4ade80' : accuracy >= 40 ? '#fbbf24' : '#fca5a5',
            }}
          >
            {accuracy}%
          </span>
          <span style={{ fontSize: '12px', color: 'rgba(237,233,255,0.4)' }}>accuracy</span>
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
            { label: 'Score', value: `${correctCount}/${questions.length}`, color: '#c4a9ff' },
            { label: 'Right', value: `${correctCount}`, color: '#4ade80' },
            { label: 'Wrong', value: `${wrongCount}`, color: '#fca5a5' },
            { label: 'Skipped', value: `${skippedCount}`, color: 'rgba(237,233,255,0.4)' },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '12px',
                padding: '14px 8px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '20px', fontWeight: 700, color: stat.color }}>
                {stat.value}
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(237,233,255,0.35)', marginTop: '2px' }}>
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
              color: 'rgba(237,233,255,0.4)',
              marginBottom: '16px',
            }}
          >
            <Clock size={14} />
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
            <TrendingUp size={14} style={{ color: '#c4a9ff' }} />
            <span style={{ color: 'rgba(237,233,255,0.6)' }}>
              Previous best: <strong style={{ color: '#c4a9ff' }}>{bestScore}%</strong>
              {' · '}
              Attempts: <strong style={{ color: '#c4a9ff' }}>{attemptHistory.length}</strong>
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <ActionButton onClick={reset} label="Retake Quiz" primary />
          <ActionButton onClick={startReview} label="Review Answers" />
          <ActionButton onClick={downloadJSON} label="Download JSON" />
          <ActionButton onClick={openSlideEditor} label="Download PPTX" />
          <ActionButton onClick={downloadPdf} label="Download PDF" />
          {attemptHistory.length > 0 && (
            <ActionButton onClick={() => setShowHistory(true)} label="View History" />
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
                background: '#1a1a36',
                border: '1px solid rgba(140,82,255,0.25)',
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
                  borderBottom: '1px solid rgba(140,82,255,0.15)',
                }}
              >
                <h3
                  style={{
                    fontSize: '15px',
                    fontWeight: 700,
                    color: '#ede9ff',
                    margin: 0,
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <History size={16} /> Quiz History
                </h3>
                <button
                  onClick={() => setShowHistory(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(237,233,255,0.4)',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                  }}
                >
                  <X size={16} />
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
                {attemptHistory.length === 0 ? (
                  <div
                    style={{
                      padding: '32px 16px',
                      textAlign: 'center',
                      fontSize: '13px',
                      color: 'rgba(237,233,255,0.3)',
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
                          background: i === 0 ? 'rgba(140,82,255,0.08)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${i === 0 ? 'rgba(140,82,255,0.2)' : 'rgba(255,255,255,0.06)'}`,
                        }}
                      >
                        <div
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '10px',
                            background:
                              attempt.percentage >= 70
                                ? 'rgba(74,222,128,0.1)'
                                : attempt.percentage >= 40
                                  ? 'rgba(251,191,36,0.1)'
                                  : 'rgba(252,165,165,0.1)',
                            border: `1px solid ${
                              attempt.percentage >= 70
                                ? 'rgba(74,222,128,0.3)'
                                : attempt.percentage >= 40
                                  ? 'rgba(251,191,36,0.3)'
                                  : 'rgba(252,165,165,0.3)'
                            }`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '14px',
                            fontWeight: 700,
                            color:
                              attempt.percentage >= 70
                                ? '#4ade80'
                                : attempt.percentage >= 40
                                  ? '#fbbf24'
                                  : '#fca5a5',
                          }}
                        >
                          {Math.round(attempt.percentage)}%
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', color: '#ede9ff', fontWeight: 600 }}>
                            {attempt.score}/{attempt.total} correct
                            {i === 0 && (
                              <span style={{ color: '#c4a9ff', fontSize: '11px', marginLeft: '6px' }}>
                                Latest
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: '11px',
                              color: 'rgba(237,233,255,0.3)',
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
    );
  }

  // ── Quiz / Review mode ──
  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        height: '100%',
        padding: '24px 16px',
        fontFamily: 'inherit',
        overflow: 'auto',
      }}
    >
      {/* Title */}
      <h2
        style={{
          fontSize: '20px',
          fontWeight: 700,
          color: '#ede9ff',
          margin: '0 0 4px',
          textAlign: 'center',
          fontFamily: 'inherit',
        }}
      >
        {title}
      </h2>

      {bestScore !== null && (
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: bestScore >= 70 ? '#4ade80' : bestScore >= 40 ? '#fbbf24' : '#fca5a5',
            background:
              bestScore >= 70
                ? 'rgba(74,222,128,0.1)'
                : bestScore >= 40
                  ? 'rgba(251,191,36,0.1)'
                  : 'rgba(252,165,165,0.1)',
            border: `1px solid ${bestScore >= 70 ? 'rgba(74,222,128,0.2)' : bestScore >= 40 ? 'rgba(251,191,36,0.2)' : 'rgba(252,165,165,0.2)'}`,
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
            color: '#fbbf24',
            fontWeight: 600,
            background: 'rgba(251,191,36,0.1)',
            border: '1px solid rgba(251,191,36,0.2)',
            borderRadius: '9999px',
            padding: '2px 10px',
            marginBottom: '4px',
          }}
        >
          Review Mode
        </span>
      )}

      {/* Progress */}
      <div style={{ fontSize: '13px', color: 'rgba(237,233,255,0.4)', marginBottom: '20px' }}>
        <span style={{ color: '#c4a9ff', fontWeight: 600 }}>{currentIndex + 1}</span>
        {' / '}
        {questions.length}
      </div>

      {/* Question card */}
      {editingId === question?.id ? (
        /* Edit overlay */
        <div
          style={{
            width: '100%',
            maxWidth: isPhone ? '100%' : '480px',
            borderRadius: '16px',
            background: '#1a1833',
            border: '1px solid rgba(140,82,255,0.3)',
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
                  border: `2px solid ${editCorrectIndex === i ? '#4ade80' : 'rgba(140,82,255,0.3)'}`,
                  background: editCorrectIndex === i ? 'rgba(74,222,128,0.15)' : 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: editCorrectIndex === i ? '#4ade80' : 'transparent',
                  fontSize: '12px',
                  fontWeight: 700,
                }}
              >
                {editCorrectIndex === i && <Check size={12} />}
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
                  color: '#ede9ff',
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
              <X size={14} /> Cancel
            </button>
            <button onClick={saveEdit} style={saveBtnStyle}>
              <Check size={14} /> Save
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            width: '100%',
            maxWidth: isPhone ? '100%' : '480px',
            marginBottom: '20px',
          }}
        >
          {/* Question text */}
          <div
            style={{
              background: 'linear-gradient(145deg, #1a1833 0%, #1a1a36 50%, #120f24 100%)',
              border: '1px solid rgba(140,82,255,0.25)',
              borderRadius: '16px',
              padding: isPhone ? '20px 16px' : '28px 24px',
              marginBottom: '16px',
              boxShadow: '0 8px 32px rgba(140,82,255,0.1), 0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ fontSize: '18px', color: '#ede9ff', lineHeight: 1.6 }}>
              <MarkdownRenderer content={question.question} />
            </div>
          </div>

          {/* Options */}
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}
          >
            {question.options.map((option, i) => {
              const letter = String.fromCharCode(65 + i);
              const isSelected = currentAnswer === i;
              const isCorrectOption = question.correctIndex === i;
              const showResult = isAnswered || mode === 'review';
              const reviewAnswer = mode === 'review' ? answers.get(currentIndex) : undefined;
              const reviewSelected = mode === 'review' && reviewAnswer === i;

              let borderColor = 'rgba(140,82,255,0.15)';
              let bg = 'rgba(255,255,255,0.07)';
              let textColor = 'rgba(237,233,255,0.7)';

              if (showResult) {
                if (isCorrectOption) {
                  borderColor = 'rgba(74,222,128,0.5)';
                  bg = 'rgba(74,222,128,0.08)';
                  textColor = '#4ade80';
                } else if (isSelected || reviewSelected) {
                  borderColor = 'rgba(252,165,165,0.5)';
                  bg = 'rgba(252,165,165,0.08)';
                  textColor = '#fca5a5';
                }
              } else if (isSelected) {
                borderColor = 'rgba(140,82,255,0.5)';
                bg = 'rgba(140,82,255,0.12)';
                textColor = '#c4a9ff';
              }

              return (
                <button
                  key={i}
                  onClick={() => selectAnswer(i)}
                  disabled={isAnswered || mode === 'review'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: isPhone ? '10px' : '12px',
                    padding: isPhone ? '12px 14px' : '14px 16px',
                    minHeight: '44px',
                    borderRadius: '12px',
                    border: `1px solid ${borderColor}`,
                    background: bg,
                    cursor: isAnswered || mode === 'review' ? 'default' : 'pointer',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    transition: 'background 0.15s, border-color 0.15s',
                    width: '100%',
                  }}
                >
                  <span
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      border: `2px solid ${borderColor}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 700,
                      flexShrink: 0,
                      color: textColor,
                      background:
                        showResult && isCorrectOption
                          ? 'rgba(74,222,128,0.15)'
                          : showResult && (isSelected || reviewSelected)
                            ? 'rgba(252,165,165,0.15)'
                            : 'transparent',
                    }}
                  >
                    {showResult && isCorrectOption ? (
                      <CheckCircle2 size={14} />
                    ) : showResult && (isSelected || reviewSelected) ? (
                      <XCircle size={14} />
                    ) : (
                      letter
                    )}
                  </span>
                  <span style={{ fontSize: '16px', color: textColor, flex: 1, lineHeight: 1.5 }}>
                    {option}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Hint */}
          {question.hint && !isAnswered && mode === 'quiz' && (
            <button
              onClick={() => setShowHint((v) => !v)}
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

          {/* Feedback */}
          {isAnswered && (
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
                    <CheckCircle2 size={16} /> Correct!
                  </>
                ) : (
                  <>
                    <XCircle size={16} /> Not quite
                  </>
                )}
              </div>
              <div style={{ fontSize: '13px', color: 'rgba(237,233,255,0.6)', lineHeight: 1.6 }}>
                {isCorrect
                  ? question.correctExplanation ||
                    `The answer is ${question.options[question.correctIndex]}.`
                  : question.wrongExplanation ||
                    `The correct answer is ${question.options[question.correctIndex]}.`}
              </div>
            </div>
          )}

          {/* Review mode feedback */}
          {mode === 'review' && (
            <div
              style={{
                padding: '14px 18px',
                borderRadius: '12px',
                marginBottom: '12px',
                background: answers.has(currentIndex)
                  ? answers.get(currentIndex) === question.correctIndex
                    ? 'rgba(74,222,128,0.06)'
                    : 'rgba(252,165,165,0.06)'
                  : 'rgba(255,255,255,0.07)',
                border: `1px solid ${
                  answers.has(currentIndex)
                    ? answers.get(currentIndex) === question.correctIndex
                      ? 'rgba(74,222,128,0.2)'
                      : 'rgba(252,165,165,0.2)'
                    : 'rgba(255,255,255,0.06)'
                }`,
              }}
            >
              {answers.has(currentIndex) ? (
                <>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '14px',
                      fontWeight: 700,
                      marginBottom: '6px',
                      color:
                        answers.get(currentIndex) === question.correctIndex ? '#4ade80' : '#fca5a5',
                    }}
                  >
                    {answers.get(currentIndex) === question.correctIndex ? (
                      <>
                        <CheckCircle2 size={16} /> You answered correctly
                      </>
                    ) : (
                      <>
                        <XCircle size={16} /> You answered incorrectly
                      </>
                    )}
                  </div>
                  <div
                    style={{ fontSize: '13px', color: 'rgba(237,233,255,0.6)', lineHeight: 1.6 }}
                  >
                    {answers.get(currentIndex) === question.correctIndex
                      ? question.correctExplanation ||
                        `The answer is ${question.options[question.correctIndex]}.`
                      : question.wrongExplanation ||
                        `The correct answer is ${question.options[question.correctIndex]}.`}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '13px', color: 'rgba(237,233,255,0.4)' }}>
                  You skipped this question. The correct answer is{' '}
                  <strong style={{ color: '#4ade80' }}>
                    {question.options[question.correctIndex]}
                  </strong>
                  .
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Navigation controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <NavButton onClick={prev} disabled={currentIndex === 0} title="Previous (←)">
          <ChevronLeft size={20} />
        </NavButton>
        <NavButton onClick={reset} title="Reset">
          <RotateCcw size={16} />
        </NavButton>
        {currentIndex === questions.length - 1 && mode === 'quiz' ? (
          <NavButton onClick={finish} title="Finish Quiz" highlight>
            <Check size={18} />
          </NavButton>
        ) : (
          <NavButton
            onClick={next}
            disabled={currentIndex === questions.length - 1}
            title="Next (→)"
          >
            <ChevronRight size={20} />
          </NavButton>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {question && editingId !== question.id && mode !== 'review' && (
          <SmallButton
            onClick={() => startEdit(question)}
            icon={<Pencil size={12} />}
            label="Edit"
          />
        )}
        <SmallButton onClick={downloadJSON} icon={<Download size={12} />} label="JSON" />
        <SmallButton onClick={openSlideEditor} icon={<Download size={12} />} label="PPTX" />
        <SmallButton onClick={downloadPdf} icon={<Download size={12} />} label="PDF" />
        {sectionSaved ? (
          <SmallButton
            onClick={openSectionPicker}
            icon={<BookCheck size={12} />}
            label="In Notebook"
          />
        ) : (
          <SmallButton
            onClick={openSectionPicker}
            icon={<BookPlus size={12} />}
            label="Add to Notebook"
          />
        )}
        {question && mode !== 'review' && (
          <SmallButton
            onClick={() => deleteQuestion(question.id)}
            icon={<Trash2 size={12} />}
            label="Delete Question"
            danger
          />
        )}
        <SmallButton onClick={deleteSet} icon={<Trash2 size={12} />} label="Delete Set" danger />
      </div>

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
              background: '#1a1a36',
              border: '1px solid rgba(140,82,255,0.25)',
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
                borderBottom: '1px solid rgba(140,82,255,0.15)',
              }}
            >
              <h3
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: '#ede9ff',
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
                  color: 'rgba(237,233,255,0.4)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                }}
              >
                <X size={16} />
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
                    color: 'rgba(237,233,255,0.3)',
                  }}
                >
                  <Loader2 size={20} className="animate-spin" />
                </div>
              ) : sections.length === 0 ? (
                <div
                  style={{
                    padding: '32px 16px',
                    textAlign: 'center',
                    fontSize: '13px',
                    color: 'rgba(237,233,255,0.3)',
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
              background: '#1a1a36',
              border: '1px solid rgba(140,82,255,0.25)',
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
                borderBottom: '1px solid rgba(140,82,255,0.15)',
              }}
            >
              <h3
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: '#ede9ff',
                  margin: 0,
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <History size={16} /> Quiz History
              </h3>
              <button
                onClick={() => setShowHistory(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(237,233,255,0.4)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
              {attemptHistory.length === 0 ? (
                <div
                  style={{
                    padding: '32px 16px',
                    textAlign: 'center',
                    fontSize: '13px',
                    color: 'rgba(237,233,255,0.3)',
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
                        background: i === 0 ? 'rgba(140,82,255,0.08)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${i === 0 ? 'rgba(140,82,255,0.2)' : 'rgba(255,255,255,0.06)'}`,
                      }}
                    >
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '10px',
                          background:
                            attempt.percentage >= 70
                              ? 'rgba(74,222,128,0.1)'
                              : attempt.percentage >= 40
                                ? 'rgba(251,191,36,0.1)'
                                : 'rgba(252,165,165,0.1)',
                          border: `1px solid ${
                            attempt.percentage >= 70
                              ? 'rgba(74,222,128,0.3)'
                              : attempt.percentage >= 40
                                ? 'rgba(251,191,36,0.3)'
                                : 'rgba(252,165,165,0.3)'
                          }`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '14px',
                          fontWeight: 700,
                          color:
                            attempt.percentage >= 70
                              ? '#4ade80'
                              : attempt.percentage >= 40
                                ? '#fbbf24'
                                : '#fca5a5',
                        }}
                      >
                        {Math.round(attempt.percentage)}%
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', color: '#ede9ff', fontWeight: 600 }}>
                          {attempt.score}/{attempt.total} correct
                          {i === 0 && (
                            <span style={{ color: '#c4a9ff', fontSize: '11px', marginLeft: '6px' }}>
                              Latest
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'rgba(237,233,255,0.3)',
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
  );
}

// ── Shared styles ──
const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'rgba(237,233,255,0.4)',
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
  color: '#ede9ff',
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
  border: '1px solid rgba(237,233,255,0.1)',
  background: 'transparent',
  color: 'rgba(237,233,255,0.5)',
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
  background: 'linear-gradient(135deg, #8c52ff, #5170ff)',
  color: '#fff',
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
              color: 'rgba(237,233,255,0.3)',
              display: 'flex',
            }}
          >
            <ChevronDown
              size={14}
              style={{
                transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 0.15s ease',
              }}
            />
          </button>
        )}
        {!hasChildren && <div style={{ width: '14px' }} />}
        <span
          style={{
            fontSize: '13px',
            color: isSelected ? '#c4a9ff' : '#ede9ff',
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
        {isSelected && <Check size={14} style={{ color: '#8c52ff', flexShrink: 0 }} />}
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
        border: highlight ? 'none' : '1px solid rgba(140,82,255,0.2)',
        background: highlight
          ? 'linear-gradient(135deg, #8c52ff, #5170ff)'
          : hovered && !disabled
            ? 'rgba(140,82,255,0.15)'
            : 'rgba(140,82,255,0.06)',
        color: highlight ? '#fff' : disabled ? 'rgba(237,233,255,0.15)' : '#c4a9ff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s ease',
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
        border: `1px solid ${danger ? 'rgba(252,165,165,0.2)' : 'rgba(140,82,255,0.15)'}`,
        background: hovered
          ? danger
            ? 'rgba(252,165,165,0.1)'
            : 'rgba(140,82,255,0.1)'
          : 'transparent',
        color: danger
          ? hovered
            ? '#fca5a5'
            : 'rgba(252,165,165,0.6)'
          : hovered
            ? '#c4a9ff'
            : 'rgba(237,233,255,0.4)',
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
        background: primary
          ? 'linear-gradient(135deg, #8c52ff, #5170ff)'
          : hovered
            ? 'rgba(140,82,255,0.1)'
            : 'transparent',
        color: primary ? '#fff' : '#c4a9ff',
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
