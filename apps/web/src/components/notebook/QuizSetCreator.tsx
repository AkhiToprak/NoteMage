'use client';

import { useState, useCallback } from 'react';
import { X, Trash2, Plus, Loader2 } from 'lucide-react';

interface QuizSetCreatorProps {
  notebookId: string;
  sectionId?: string;
  onCreated: (setId: string) => void;
  onClose: () => void;
}

interface QuestionDraft {
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  hint: string;
}

function emptyQuestion(): QuestionDraft {
  return { question: '', options: ['', '', '', ''], correctIndex: 0, hint: '' };
}

export default function QuizSetCreator({
  notebookId,
  sectionId,
  onCreated,
  onClose,
}: QuizSetCreatorProps) {
  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState<QuestionDraft[]>([emptyQuestion()]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canSubmit =
    title.trim().length > 0 &&
    questions.length >= 1 &&
    questions.every(
      (q) =>
        q.question.trim() &&
        q.options.every((o) => o.trim()) &&
        q.correctIndex >= 0 &&
        q.correctIndex <= 3
    ) &&
    !isSubmitting;

  const addQuestion = useCallback(() => {
    setQuestions((prev) => [...prev, emptyQuestion()]);
  }, []);

  const removeQuestion = useCallback((index: number) => {
    setQuestions((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const updateQuestion = useCallback((index: number, field: 'question' | 'hint', value: string) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, [field]: value } : q)));
  }, []);

  const updateOption = useCallback((qIndex: number, oIndex: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        const opts = [...q.options] as [string, string, string, string];
        opts[oIndex] = value;
        return { ...q, options: opts };
      })
    );
  }, []);

  const setCorrectIndex = useCallback((qIndex: number, correctIndex: number) => {
    setQuestions((prev) => prev.map((q, i) => (i === qIndex ? { ...q, correctIndex } : q)));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/quiz-sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          sectionId,
          questions: questions.map((q) => ({
            question: q.question.trim(),
            options: q.options.map((o) => o.trim()),
            correctIndex: q.correctIndex,
            hint: q.hint.trim() || undefined,
          })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        onCreated(json.data.id);
      } else {
        setError(json.message || 'Failed to create quiz');
        setIsSubmitting(false);
      }
    } catch {
      setError('Failed to create quiz. Please try again.');
      setIsSubmitting(false);
    }
  }, [canSubmit, notebookId, sectionId, title, questions, onCreated]);

  const optionLabels = ['A', 'B', 'C', 'D'];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
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
          width: '540px',
          maxHeight: '85vh',
          background: '#1e1d35',
          border: '1px solid rgba(140,82,255,0.25)',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          fontFamily: 'inherit',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid rgba(140,82,255,0.15)',
            flexShrink: 0,
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
            Create Quiz
          </h3>
          <button
            onClick={onClose}
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

        {/* Body (scrollable) */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Title input */}
          <div>
            <label
              style={{
                fontSize: '11px',
                color: 'rgba(237,233,255,0.4)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                display: 'block',
                marginBottom: '6px',
              }}
            >
              Quiz Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Chapter 5 Review Quiz"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                background: 'rgba(140,82,255,0.08)',
                border: '1px solid rgba(140,82,255,0.2)',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '14px',
                color: '#ede9ff',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </div>

          {/* Question rows */}
          {questions.map((q, qIndex) => (
            <div
              key={qIndex}
              style={{
                background: 'rgba(140,82,255,0.04)',
                border: '1px solid rgba(140,82,255,0.12)',
                borderRadius: '10px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              {/* Question header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    color: 'rgba(237,233,255,0.3)',
                    fontWeight: 600,
                  }}
                >
                  Question {qIndex + 1}
                </span>
                {questions.length > 1 && (
                  <button
                    onClick={() => removeQuestion(qIndex)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'rgba(252,165,165,0.5)',
                      cursor: 'pointer',
                      padding: '2px',
                      display: 'flex',
                      transition: 'color 0.12s ease',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.color = 'rgba(252,165,165,0.5)';
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>

              {/* Question text */}
              <textarea
                value={q.question}
                onChange={(e) => updateQuestion(qIndex, 'question', e.target.value)}
                placeholder="Question..."
                rows={2}
                style={{
                  resize: 'none',
                  background: 'rgba(140,82,255,0.08)',
                  border: '1px solid rgba(140,82,255,0.2)',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  fontSize: '13px',
                  color: '#ede9ff',
                  fontFamily: 'inherit',
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              />

              {/* Options with radio */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span
                  style={{
                    fontSize: '10px',
                    color: 'rgba(237,233,255,0.25)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Options (select correct answer)
                </span>
                {q.options.map((opt, oIndex) => (
                  <div
                    key={oIndex}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setCorrectIndex(qIndex, oIndex)}
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        border:
                          q.correctIndex === oIndex
                            ? '2px solid #8c52ff'
                            : '2px solid rgba(140,82,255,0.25)',
                        background:
                          q.correctIndex === oIndex ? 'rgba(140,82,255,0.3)' : 'transparent',
                        cursor: 'pointer',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        transition: 'border-color 0.12s ease, background 0.12s ease',
                      }}
                    >
                      {q.correctIndex === oIndex && (
                        <div
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: '#8c52ff',
                          }}
                        />
                      )}
                    </button>
                    <span
                      style={{
                        fontSize: '12px',
                        color: 'rgba(196,169,255,0.5)',
                        fontWeight: 600,
                        width: '14px',
                        flexShrink: 0,
                      }}
                    >
                      {optionLabels[oIndex]}
                    </span>
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                      placeholder={`Option ${optionLabels[oIndex]}...`}
                      style={{
                        flex: 1,
                        background: 'rgba(140,82,255,0.08)',
                        border: '1px solid rgba(140,82,255,0.2)',
                        borderRadius: '6px',
                        padding: '7px 10px',
                        fontSize: '13px',
                        color: '#ede9ff',
                        fontFamily: 'inherit',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Hint (optional) */}
              <input
                type="text"
                value={q.hint}
                onChange={(e) => updateQuestion(qIndex, 'hint', e.target.value)}
                placeholder="Hint (optional)..."
                style={{
                  background: 'rgba(140,82,255,0.08)',
                  border: '1px solid rgba(140,82,255,0.15)',
                  borderRadius: '6px',
                  padding: '7px 10px',
                  fontSize: '12px',
                  color: 'rgba(237,233,255,0.6)',
                  fontFamily: 'inherit',
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          ))}

          {/* Add Question button */}
          <button
            onClick={addQuestion}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px',
              borderRadius: '8px',
              border: '1px dashed rgba(140,82,255,0.25)',
              background: 'transparent',
              color: 'rgba(196,169,255,0.6)',
              fontSize: '13px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'background 0.12s ease, color 0.12s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(140,82,255,0.08)';
              (e.currentTarget as HTMLButtonElement).style.color = '#c4a9ff';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(196,169,255,0.6)';
            }}
          >
            <Plus size={14} /> Add Question
          </button>

          {/* Error */}
          {error && (
            <div
              style={{
                fontSize: '12px',
                color: '#f87171',
                textAlign: 'center',
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '8px',
            padding: '12px 20px',
            borderTop: '1px solid rgba(140,82,255,0.15)',
            flexShrink: 0,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid rgba(237,233,255,0.1)',
              background: 'transparent',
              color: 'rgba(237,233,255,0.5)',
              fontSize: '13px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: canSubmit
                ? 'linear-gradient(135deg, #8c52ff, #5170ff)'
                : 'rgba(140,82,255,0.2)',
              color: canSubmit ? '#fff' : 'rgba(237,233,255,0.3)',
              fontSize: '13px',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              fontWeight: 600,
            }}
          >
            {isSubmitting && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
            {isSubmitting ? 'Creating...' : 'Create Quiz'}
          </button>
        </div>

        {/* Spinner keyframes */}
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
