'use client';

import { useState, useCallback } from 'react';
import { X, Trash2, Plus, Loader2 } from 'lucide-react';

interface FlashcardSetCreatorProps {
  notebookId: string;
  sectionId?: string;
  onCreated: (setId: string) => void;
  onClose: () => void;
}

interface CardDraft {
  question: string;
  answer: string;
}

export default function FlashcardSetCreator({
  notebookId,
  sectionId,
  onCreated,
  onClose,
}: FlashcardSetCreatorProps) {
  const [title, setTitle] = useState('');
  const [cards, setCards] = useState<CardDraft[]>([{ question: '', answer: '' }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canSubmit =
    title.trim().length > 0 &&
    cards.length >= 1 &&
    cards.every((c) => c.question.trim() && c.answer.trim()) &&
    !isSubmitting;

  const addCard = useCallback(() => {
    setCards((prev) => [...prev, { question: '', answer: '' }]);
  }, []);

  const removeCard = useCallback((index: number) => {
    setCards((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const updateCard = useCallback((index: number, field: 'question' | 'answer', value: string) => {
    setCards((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/flashcard-sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          sectionId,
          cards: cards.map((c) => ({ question: c.question.trim(), answer: c.answer.trim() })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        onCreated(json.data.id);
      } else {
        setError(json.message || 'Failed to create flashcard set');
        setIsSubmitting(false);
      }
    } catch {
      setError('Failed to create flashcard set. Please try again.');
      setIsSubmitting(false);
    }
  }, [canSubmit, notebookId, sectionId, title, cards, onCreated]);

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
          width: '480px',
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
            Create Flashcard Set
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
              Set Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Chapter 5 Vocabulary"
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

          {/* Card rows */}
          {cards.map((card, index) => (
            <div
              key={index}
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
                  Card {index + 1}
                </span>
                {cards.length > 1 && (
                  <button
                    onClick={() => removeCard(index)}
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
              <textarea
                value={card.question}
                onChange={(e) => updateCard(index, 'question', e.target.value)}
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
              <textarea
                value={card.answer}
                onChange={(e) => updateCard(index, 'answer', e.target.value)}
                placeholder="Answer..."
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
            </div>
          ))}

          {/* Add Card button */}
          <button
            onClick={addCard}
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
            <Plus size={14} /> Add Card
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
            {isSubmitting ? 'Creating...' : 'Create Set'}
          </button>
        </div>

        {/* Spinner keyframes */}
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
