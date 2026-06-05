'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useNotebookWorkspaceOptional } from '@/components/notebook/NotebookWorkspaceContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useCoarsePointer } from '@/hooks/useCoarsePointer';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { useDirectUpload } from '@/hooks/useDirectUpload';

interface FlashcardImageData {
  id: string;
  side: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  sortOrder: number;
}

interface Flashcard {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
  images?: FlashcardImageData[];
}

interface StudyFlashcard extends Flashcard {
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewAt: string | null;
}

interface SectionItem {
  id: string;
  title: string;
  parentId: string | null;
  children?: SectionItem[];
}

interface FlashcardViewerProps {
  notebookId: string;
  setId: string;
  title: string;
  initialCards: Flashcard[];
  assignedSectionId?: string | null;
  // Phase 10.6 — fires when the user finishes a study session (every
  // card answered, post-summary view). The checkpoint drawer uses this
  // to PATCH the activity as completed and advance to the next.
  onComplete?: (result: { correct: number; total: number }) => void;
}

export default function FlashcardViewer({
  notebookId,
  setId,
  title,
  initialCards,
  assignedSectionId,
  onComplete,
}: FlashcardViewerProps) {
  const { upload } = useDirectUpload();
  const { isPhone } = useBreakpoint();
  const coarsePointer = useCoarsePointer();
  const [cards, setCards] = useState<Flashcard[]>(initialCards);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuestion, setEditQuestion] = useState('');
  const [editAnswer, setEditAnswer] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const frontFileInputRef = useRef<HTMLInputElement>(null);
  const backFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingSide, setUploadingSide] = useState<string | null>(null);
  const router = useRouter();
  const workspace = useNotebookWorkspaceOptional();
  const refreshSections = workspace?.refreshSections ?? (() => {});
  const refreshChats = workspace?.refreshChats ?? (() => {});

  // Section picker state
  const [showSectionPicker, setShowSectionPicker] = useState(false);
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [loadingSections, setLoadingSections] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    assignedSectionId ?? null
  );
  const [savingSection, setSavingSection] = useState(false);
  const [sectionSaved, setSectionSaved] = useState(!!assignedSectionId);

  // Study mode (spaced repetition)
  const [studyMode, setStudyMode] = useState(false);
  const [studyCards, setStudyCards] = useState<StudyFlashcard[]>([]);
  const [studyIndex, setStudyIndex] = useState(0);
  const [studyFlipped, setStudyFlipped] = useState(false);
  const [studyResults, setStudyResults] = useState<{ correct: number; total: number } | null>(null);
  const [loadingStudy, setLoadingStudy] = useState(false);
  const [dueCount, setDueCount] = useState<number | null>(null);
  const studyCorrectRef = useRef(0);
  const repeatCardsRef = useRef<Set<string>>(new Set());
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipingDirection, setSwipingDirection] = useState<'left' | 'right' | null>(null);
  const touchStartXRef = useRef(0);

  const card = cards[currentIndex];

  const flip = useCallback(() => setIsFlipped((v) => !v), []);
  const next = useCallback(() => {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex((i) => i + 1);
      setIsFlipped(false);
    }
  }, [currentIndex, cards.length]);
  const prev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setIsFlipped(false);
    }
  }, [currentIndex]);
  const reset = useCallback(() => {
    setCurrentIndex(0);
    setIsFlipped(false);
  }, []);

  const downloadCSV = useCallback(() => {
    let csv = 'question,answer\n';
    cards.forEach((c) => {
      const q = '"' + c.question.replace(/"/g, '""') + '"';
      const a = '"' + c.answer.replace(/"/g, '""') + '"';
      csv += q + ',' + a + '\n';
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_flashcards.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, [cards, title]);

  const deleteSet = useCallback(async () => {
    if (!window.confirm('Delete this entire flashcard set? This cannot be undone.')) return;
    try {
      await fetch(`/api/notebooks/${notebookId}/flashcard-sets/${setId}`, { method: 'DELETE' });
      refreshSections();
      refreshChats();
      router.push(`/notebooks/${notebookId}`);
    } catch {
      /* silent */
    }
  }, [notebookId, setId, refreshSections, refreshChats, router]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture keys when editing
      if (editingId || isAdding) return;
      if (studyMode) {
        if (e.code === 'Space' && !studyFlipped) {
          e.preventDefault();
          setStudyFlipped(true);
        } else if (e.code === 'ArrowLeft' && studyFlipped) {
          e.preventDefault();
          rateCard(0);
        } else if (e.code === 'ArrowRight' && studyFlipped) {
          e.preventDefault();
          rateCard(4);
        }
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        flip();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        prev();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [flip, prev, next, editingId, isAdding, studyMode, studyFlipped]);

  // ── Fetch due cards count ──
  useEffect(() => {
    fetch(`/api/notebooks/${notebookId}/flashcard-sets/${setId}/study-session`)
      .then((r) => r.json())
      .then((res) => {
        const cards = res?.data ?? res;
        if (Array.isArray(cards)) setDueCount(cards.length);
      })
      .catch(() => {});
  }, [notebookId, setId]);

  // ── Study mode ──
  const startStudyMode = async () => {
    setLoadingStudy(true);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/flashcard-sets/${setId}/study-session`);
      const data = await res.json();
      const dueCards = data?.data ?? data;
      const cardsToStudy: StudyFlashcard[] =
        Array.isArray(dueCards) && dueCards.length > 0
          ? dueCards
          : cards.map((c) => ({
              ...c,
              easeFactor: 2.5,
              interval: 0,
              repetitions: 0,
              nextReviewAt: null,
            }));
      setStudyCards(cardsToStudy);
      setStudyIndex(0);
      setStudyFlipped(false);
      setStudyResults(null);
      studyCorrectRef.current = 0;
      repeatCardsRef.current = new Set();
      setSwipeOffset(0);
      setSwipingDirection(null);
      setStudyMode(true);
    } finally {
      setLoadingStudy(false);
    }
  };

  const rateCard = async (quality: number) => {
    const card = studyCards[studyIndex];
    fetch(`/api/notebooks/${notebookId}/flashcard-sets/${setId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flashcardId: card.id, quality }),
    }).catch(() => {});

    if (quality >= 3) {
      studyCorrectRef.current++;
    } else {
      repeatCardsRef.current.add(card.id);
    }

    setSwipeOffset(0);
    setSwipingDirection(null);

    if (studyIndex < studyCards.length - 1) {
      setStudyIndex((i) => i + 1);
      setStudyFlipped(false);
    } else {
      const result = { correct: studyCorrectRef.current, total: studyCards.length };
      setStudyResults(result);
      // Phase 10.6 — surface completion to the checkpoint drawer.
      onComplete?.(result);
    }
  };

  const restartStudyWith = (cardsToStudy: StudyFlashcard[]) => {
    setStudyCards(cardsToStudy);
    setStudyIndex(0);
    setStudyFlipped(false);
    setStudyResults(null);
    studyCorrectRef.current = 0;
    repeatCardsRef.current = new Set();
    setSwipeOffset(0);
    setSwipingDirection(null);
  };

  // Swipe gesture handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!studyFlipped) return;
    const delta = e.touches[0].clientX - touchStartXRef.current;
    setSwipeOffset(delta);
    setSwipingDirection(delta > 0 ? 'right' : delta < 0 ? 'left' : null);
  };

  const handleTouchEnd = () => {
    if (!studyFlipped) {
      setSwipeOffset(0);
      setSwipingDirection(null);
      return;
    }
    if (swipeOffset > 50) {
      rateCard(4); // Known
    } else if (swipeOffset < -50) {
      rateCard(0); // Repeat
    } else {
      setSwipeOffset(0);
      setSwipingDirection(null);
    }
  };

  const exitStudyMode = () => {
    setStudyMode(false);
    setStudyCards([]);
    setStudyIndex(0);
    setStudyFlipped(false);
    setStudyResults(null);
    studyCorrectRef.current = 0;
    repeatCardsRef.current = new Set();
    setSwipeOffset(0);
    setSwipingDirection(null);
    // Re-fetch due count
    fetch(`/api/notebooks/${notebookId}/flashcard-sets/${setId}/study-session`)
      .then((r) => r.json())
      .then((res) => {
        const cards = res?.data ?? res;
        if (Array.isArray(cards)) setDueCount(cards.length);
      })
      .catch(() => {});
  };

  // ── Edit card ──
  const startEdit = (c: Flashcard) => {
    setEditingId(c.id);
    setEditQuestion(c.question);
    setEditAnswer(c.answer);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      const res = await fetch(
        `/api/notebooks/${notebookId}/flashcard-sets/${setId}/flashcards/${editingId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: editQuestion, answer: editAnswer }),
        }
      );
      const json = await res.json();
      if (json.success) {
        setCards((prev) =>
          prev.map((c) =>
            c.id === editingId ? { ...c, question: editQuestion, answer: editAnswer } : c
          )
        );
      }
    } catch {
      /* silent */
    }
    setEditingId(null);
  };

  // ── Delete card ──
  const deleteCard = async (cardId: string) => {
    if (!window.confirm('Delete this flashcard?')) return;
    try {
      await fetch(`/api/notebooks/${notebookId}/flashcard-sets/${setId}/flashcards/${cardId}`, {
        method: 'DELETE',
      });
      const newCards = cards.filter((c) => c.id !== cardId);
      setCards(newCards);
      if (currentIndex >= newCards.length) setCurrentIndex(Math.max(0, newCards.length - 1));
      setIsFlipped(false);
    } catch {
      /* silent */
    }
  };

  // ── Add card ──
  const addCard = async () => {
    if (!newQuestion.trim() || !newAnswer.trim()) return;
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/flashcard-sets/${setId}/flashcards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: newQuestion.trim(), answer: newAnswer.trim() }),
      });
      const json = await res.json();
      if (!json.success) {
        console.error('Failed to create flashcard:', json.message);
        alert(json.message || 'Failed to create flashcard');
        return;
      }
      const createdCard: Flashcard = json.data;
      setCards((prev) => [...prev, createdCard]);
      setCurrentIndex(cards.length); // Navigate to the new card
      setIsFlipped(false);
      setIsAdding(false);
      setNewQuestion('');
      setNewAnswer('');
    } catch (err) {
      console.error('Error creating flashcard:', err);
      alert('Failed to create flashcard. Please try again.');
    }
  };

  // ── Duplicate card ──
  const duplicateCard = async () => {
    const cardToDuplicate = cards[currentIndex];
    if (!cardToDuplicate) return;
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/flashcard-sets/${setId}/flashcards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: cardToDuplicate.question,
          answer: cardToDuplicate.answer,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        console.error('Failed to duplicate flashcard:', json.message);
        return;
      }
      const duplicated: Flashcard = json.data;
      const newCards = [...cards];
      newCards.splice(currentIndex + 1, 0, duplicated);
      setCards(newCards);
      setCurrentIndex(currentIndex + 1);
      setIsFlipped(false);
    } catch (err) {
      console.error('Error duplicating flashcard:', err);
    }
  };

  // ── Image upload ──
  const uploadImage = async (file: File, side: 'front' | 'back', cardId: string) => {
    setUploadingSide(side);
    try {
      const { storagePath } = await upload(file, 'flashcard-image', { notebookId, setId, cardId });
      const res = await fetch(
        `/api/notebooks/${notebookId}/flashcard-sets/${setId}/flashcards/${cardId}/images`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storagePath, fileName: file.name, side }),
        }
      );
      const json = await res.json();
      if (json.success) {
        const newImage: FlashcardImageData = {
          id: json.data.id,
          side: json.data.side,
          fileName: json.data.fileName,
          filePath: '',
          mimeType: json.data.mimeType,
          sortOrder: json.data.sortOrder,
        };
        setCards((prev) =>
          prev.map((c) => (c.id === cardId ? { ...c, images: [...(c.images || []), newImage] } : c))
        );
      }
    } catch {
      /* silent */
    }
    setUploadingSide(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, side: 'front' | 'back') => {
    const file = e.target.files?.[0];
    if (file && card) {
      uploadImage(file, side, card.id);
    }
    e.target.value = '';
  };

  const deleteImage = async (cardId: string, imageId: string) => {
    try {
      const res = await fetch(
        `/api/notebooks/${notebookId}/flashcard-sets/${setId}/flashcards/${cardId}/images/${imageId}`,
        { method: 'DELETE' }
      );
      const json = await res.json();
      if (json.success) {
        setCards((prev) =>
          prev.map((c) =>
            c.id === cardId
              ? { ...c, images: (c.images || []).filter((img) => img.id !== imageId) }
              : c
          )
        );
      }
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
        // Build tree from flat list
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
      const res = await fetch(`/api/notebooks/${notebookId}/flashcard-sets/${setId}`, {
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

  if (cards.length === 0) {
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
        <p style={{ fontSize: '16px', marginBottom: '16px' }}>No flashcards in this set.</p>
      </div>
    );
  }

  // ── Study Mode UI ──
  if (studyMode) {
    const studyCard = studyCards[studyIndex];

    // Session complete — show summary
    if (studyResults) {
      const pct = Math.round((studyResults.correct / studyResults.total) * 100);
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            padding: '24px 16px',
            fontFamily: 'inherit',
          }}
        >
          <div
            style={{
              background: 'var(--surface-container-lowest)',
              borderRadius: '24px',
              padding: isPhone ? '32px 20px' : '48px 40px',
              border: '1px solid rgba(140,82,255,0.2)',
              textAlign: 'center',
              maxWidth: isPhone ? '100%' : '400px',
              width: '100%',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: pct >= 70 ? 'rgb(var(--verdict-pass-rgb) / 0.15)' : 'rgb(var(--verdict-warn-rgb) / 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: pct >= 70 ? 'var(--success)' : 'var(--warning)' }} aria-hidden>psychology</span>
            </div>
            <h2
              style={{
                fontSize: '22px',
                fontWeight: 700,
                color: 'var(--on-surface)',
                margin: '0 0 8px',
              }}
            >
              Session Complete
            </h2>
            <p
              style={{
                fontSize: '14px',
                color: 'var(--ink-50)',
                margin: '0 0 24px',
              }}
            >
              You reviewed {studyResults.total} {studyResults.total === 1 ? 'card' : 'cards'}
            </p>
            <div
              style={{
                display: 'flex',
                gap: '16px',
                justifyContent: 'center',
                marginBottom: '24px',
              }}
            >
              <div
                style={{
                  padding: '16px 20px',
                  borderRadius: '12px',
                  background: 'rgb(var(--verdict-pass-rgb) / 0.1)',
                  border: '1px solid rgb(var(--verdict-pass-rgb) / 0.2)',
                }}
              >
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--success)' }}>
                  {studyResults.correct}
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    color: 'rgb(var(--verdict-pass-rgb) / 0.7)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Correct
                </div>
              </div>
              <div
                style={{
                  padding: '16px 20px',
                  borderRadius: '12px',
                  background: 'rgb(var(--verdict-fail-rgb) / 0.1)',
                  border: '1px solid rgb(var(--verdict-fail-rgb) / 0.2)',
                }}
              >
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--error)' }}>
                  {studyResults.total - studyResults.correct}
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    color: 'rgb(var(--verdict-fail-rgb) / 0.7)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Wrong
                </div>
              </div>
              <div
                style={{
                  padding: '16px 20px',
                  borderRadius: '12px',
                  background: 'rgba(140,82,255,0.1)',
                  border: '1px solid rgba(140,82,255,0.2)',
                }}
              >
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--md-h3)' }}>{pct}%</div>
                <div
                  style={{
                    fontSize: '11px',
                    color: 'var(--md-em)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Accuracy
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
              {repeatCardsRef.current.size > 0 && (
                <button
                  onClick={() => {
                    const missed = studyCards.filter((c) => repeatCardsRef.current.has(c.id));
                    restartStudyWith(missed);
                  }}
                  style={{
                    padding: '12px 24px',
                    borderRadius: '12px',
                    background: 'rgb(var(--verdict-fail-rgb) / 0.12)',
                    border: '1px solid rgb(var(--verdict-fail-rgb) / 0.3)',
                    color: 'var(--error)',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>replay</span> Repeat missed cards ({repeatCardsRef.current.size})
                </button>
              )}
              <button
                onClick={() => {
                  const allAsStudy: StudyFlashcard[] = cards.map((c) => ({
                    ...c,
                    easeFactor: 2.5,
                    interval: 0,
                    repetitions: 0,
                    nextReviewAt: null,
                  }));
                  restartStudyWith(allAsStudy);
                }}
                style={{
                  padding: '12px 24px',
                  borderRadius: '12px',
                  background: 'var(--accent-strong)',
                  border: 'none',
                  color: 'var(--on-primary-container)',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>replay</span> Repeat entire set
              </button>
              <button
                onClick={exitStudyMode}
                style={{
                  padding: '12px 24px',
                  borderRadius: '12px',
                  background: 'transparent',
                  border: '1px solid rgba(140,82,255,0.2)',
                  color: 'var(--ink-60)',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Active study session — show one card at a time
    return (
      <div
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            maxWidth: isPhone ? '100%' : '400px',
            marginBottom: '16px',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}>
            Study Mode
          </h2>
          <button
            onClick={exitStudyMode}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(140,82,255,0.2)',
              background: 'transparent',
              color: 'var(--ink-50)',
              fontSize: '12px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>close</span> Exit
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ width: '100%', maxWidth: isPhone ? '100%' : '400px', marginBottom: '20px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '11px',
              color: 'var(--ink-40)',
              marginBottom: '6px',
            }}
          >
            <span>
              Card {studyIndex + 1} of {studyCards.length}
            </span>
            <span>{Math.round((studyIndex / studyCards.length) * 100)}% done</span>
          </div>
          <div
            style={{
              height: '4px',
              background: 'rgba(140,82,255,0.15)',
              borderRadius: '2px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: '100%',
                transform: `scaleX(${studyIndex / studyCards.length})`,
                transformOrigin: 'left',
                background: 'var(--accent-strong)',
                borderRadius: '2px',
                transition: 'transform 0.3s ease',
              }}
            />
          </div>
        </div>

        {/* Study card */}
        {studyCard && (
          <div
            onClick={() => !studyFlipped && setStudyFlipped(true)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
              width: '100%',
              maxWidth: isPhone ? '100%' : '360px',
              minHeight: isPhone ? '320px' : '400px',
              borderRadius: '16px',
              padding: isPhone ? '24px 16px' : '32px 24px',
              background:
                swipingDirection === 'right'
                  ? 'rgb(var(--verdict-pass-rgb) / 0.15)'
                  : swipingDirection === 'left'
                    ? 'rgb(var(--verdict-fail-rgb) / 0.15)'
                    : studyFlipped
                      ? 'var(--surface-container-high)'
                      : 'var(--surface-container-lowest)',
              border: `1px solid ${
                swipingDirection === 'right'
                  ? 'rgb(var(--verdict-pass-rgb) / 0.4)'
                  : swipingDirection === 'left'
                    ? 'rgb(var(--verdict-fail-rgb) / 0.4)'
                    : studyFlipped
                      ? 'rgba(81,112,255,0.3)'
                      : 'rgba(140,82,255,0.2)'
              }`,
              cursor: studyFlipped ? 'default' : 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              marginBottom: '20px',
              transform: `translateX(${swipeOffset}px) rotate(${swipeOffset * 0.05}deg)`,
              transition: swipingDirection ? 'none' : 'transform 0.3s ease',
            }}
          >
            <div
              style={{
                fontSize: '10px',
                color: 'var(--ink-30)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: '16px',
              }}
            >
              {studyFlipped ? 'Answer — swipe or use buttons' : 'Question — tap to reveal'}
            </div>
            <div
              style={{
                fontSize: '16px',
                lineHeight: 1.6,
                color: 'var(--on-surface)',
                wordBreak: 'break-word',
                maxWidth: '100%',
              }}
            >
              <MarkdownRenderer content={studyFlipped ? studyCard.answer : studyCard.question} />
            </div>
          </div>
        )}

        {/* Rating buttons — show only after flipping */}
        {studyFlipped && (
          <div
            style={{
              display: 'flex',
              gap: '16px',
              justifyContent: 'center',
            }}
          >
            <button
              onClick={() => rateCard(0)}
              style={{
                padding: '14px 28px',
                borderRadius: '12px',
                background: 'rgb(var(--verdict-fail-rgb) / 0.1)',
                border: '1px solid rgb(var(--verdict-fail-rgb) / 0.25)',
                color: 'var(--error)',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'opacity 0.15s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.opacity = '0.8';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.opacity = '1';
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>arrow_back</span> Repeat
            </button>
            <button
              onClick={() => rateCard(4)}
              style={{
                padding: '14px 28px',
                borderRadius: '12px',
                background: 'rgb(var(--verdict-pass-rgb) / 0.1)',
                border: '1px solid rgb(var(--verdict-pass-rgb) / 0.25)',
                color: 'var(--success)',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'opacity 0.15s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.opacity = '0.8';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.opacity = '1';
              }}
            >
              Known <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>arrow_forward</span>
            </button>
          </div>
        )}
      </div>
    );
  }

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
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {/* Title */}
      <h2
        style={{
          fontSize: '20px',
          fontWeight: 700,
          color: 'var(--md-text)',
          margin: '0 0 10px',
          textAlign: 'center',
          fontFamily: 'inherit',
          letterSpacing: '-0.02em',
        }}
      >
        {title}
      </h2>

      {/* Progress */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'baseline',
          gap: '4px',
          padding: '5px 12px',
          marginBottom: '24px',
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
        <span>{cards.length}</span>
      </div>

      {/* Card container */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: isPhone ? '100%' : '360px',
          height: isPhone ? 'min(72vh, 560px)' : '520px',
          perspective: '1000px',
          marginBottom: '24px',
          flexShrink: 0,
        }}
      >
        {/* Edit overlay */}
        {editingId === card?.id ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '16px',
              background: 'var(--surface-container-lowest)',
              border: '1px solid rgba(140,82,255,0.3)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <label
              style={{
                fontSize: '11px',
                color: 'var(--ink-40)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Question
            </label>
            <textarea
              value={editQuestion}
              onChange={(e) => setEditQuestion(e.target.value)}
              style={{
                flex: 1,
                resize: 'none',
                background: 'rgba(140,82,255,0.08)',
                border: '1px solid rgba(140,82,255,0.2)',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '14px',
                color: 'var(--on-surface)',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
            <label
              style={{
                fontSize: '11px',
                color: 'var(--ink-40)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Answer
            </label>
            <textarea
              value={editAnswer}
              onChange={(e) => setEditAnswer(e.target.value)}
              style={{
                flex: 1,
                resize: 'none',
                background: 'rgba(140,82,255,0.08)',
                border: '1px solid rgba(140,82,255,0.2)',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '14px',
                color: 'var(--on-surface)',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
            {/* Image management */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(['front', 'back'] as const).map((side) => (
                <div key={side}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '4px',
                    }}
                  >
                    <label
                      style={{
                        fontSize: '11px',
                        color: 'var(--ink-40)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                      }}
                    >
                      {side} images
                    </label>
                    <button
                      onClick={() =>
                        side === 'front'
                          ? frontFileInputRef.current?.click()
                          : backFileInputRef.current?.click()
                      }
                      disabled={uploadingSide === side}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        border: '1px solid rgba(140,82,255,0.2)',
                        background: 'rgba(140,82,255,0.08)',
                        color: 'var(--ink-50)',
                        fontSize: '11px',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {uploadingSide === side ? (
                        <span className="material-symbols-outlined" style={{ fontSize: 10, animation: 'spin 1s linear infinite' }} aria-hidden>progress_activity</span>
                      ) : (
                        <span className="material-symbols-outlined" style={{ fontSize: 10 }} aria-hidden>add_photo_alternate</span>
                      )}
                      Add
                    </button>
                  </div>
                  {card?.images?.filter((img) => img.side === side).length ? (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '6px',
                      }}
                    >
                      {card.images
                        .filter((img) => img.side === side)
                        .map((img) => (
                          <div key={img.id} style={{ position: 'relative' }}>
                            <img
                              src={`/api/uploads/flashcard-images/${img.id}`}
                              alt={img.fileName}
                              style={{
                                width: '56px',
                                height: '56px',
                                borderRadius: '6px',
                                objectFit: 'cover',
                                border: '1px solid rgba(140,82,255,0.15)',
                              }}
                            />
                            <button
                              onClick={() => deleteImage(card.id, img.id)}
                              style={{
                                position: 'absolute',
                                top: '-4px',
                                right: '-4px',
                                width: '16px',
                                height: '16px',
                                borderRadius: '50%',
                                border: 'none',
                                background: 'var(--error)',
                                color: 'var(--on-error)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                padding: 0,
                                fontSize: '10px',
                              }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 10 }} aria-hidden>close</span>
                            </button>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--ink-20)',
                        padding: '4px 0',
                      }}
                    >
                      No images
                    </div>
                  )}
                </div>
              ))}
              <input
                ref={frontFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => handleFileSelect(e, 'front')}
              />
              <input
                ref={backFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => handleFileSelect(e, 'back')}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEditingId(null)}
                style={{
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
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>close</span> Cancel
              </button>
              <button
                onClick={saveEdit}
                style={{
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
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>check</span> Save
              </button>
            </div>
          </div>
        ) : (
          /* 3D flip card */
          <div
            onClick={flip}
            style={{
              width: '100%',
              height: '100%',
              position: 'relative',
              transformStyle: 'preserve-3d',
              transition: 'transform 0.6s cubic-bezier(0.4, 0.0, 0.2, 1)',
              transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              cursor: 'pointer',
            }}
          >
            {/* Front (question) */}
            <div
              style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                backfaceVisibility: 'hidden',
                borderRadius: '16px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                padding: isPhone ? '24px 20px' : '40px',
                boxShadow: '0 2px 14px rgba(0,0,0,0.55), inset 0 1px 0 rgba(196,169,255,0.10)',
                background: 'var(--background)',
                border: '1px solid rgba(174,137,255,0.38)',
                color: 'var(--md-text)',
              }}
            >
              <div
                style={{
                  fontSize: '18px',
                  maxWidth: '100%',
                  wordWrap: 'break-word',
                  textAlign: 'center',
                  lineHeight: 1.55,
                }}
              >
                {card && <MarkdownRenderer content={card.question} />}
              </div>
              {card?.images?.filter((img) => img.side === 'front').length ? (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    justifyContent: 'center',
                    marginTop: '12px',
                    maxWidth: '100%',
                  }}
                >
                  {card.images
                    .filter((img) => img.side === 'front')
                    .map((img) => (
                      <img
                        key={img.id}
                        src={`/api/uploads/flashcard-images/${img.id}`}
                        alt={img.fileName}
                        style={{
                          maxWidth: '100%',
                          maxHeight: '150px',
                          borderRadius: '8px',
                          objectFit: 'contain',
                          border: '1px solid rgba(140,82,255,0.15)',
                        }}
                      />
                    ))}
                </div>
              ) : null}
              <div
                style={{
                  position: 'absolute',
                  bottom: '18px',
                  fontSize: '10px',
                  color: 'var(--ink-50)',
                  fontFamily: 'inherit',
                  textTransform: 'uppercase',
                  letterSpacing: '0.18em',
                  fontWeight: 600,
                }}
              >
                {coarsePointer ? 'Tap to flip' : 'Space to flip'}
              </div>
            </div>

            {/* Back (answer) */}
            <div
              style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                backfaceVisibility: 'hidden',
                borderRadius: '16px',
                overflow: 'auto',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                padding: isPhone ? '24px 20px' : '40px',
                boxShadow: '0 2px 14px rgba(0,0,0,0.55), inset 0 1px 0 rgba(155,178,255,0.12)',
                background: 'var(--background)',
                border: '1px solid rgba(120,148,255,0.38)',
                color: 'var(--md-text)',
                transform: 'rotateY(180deg)',
              }}
            >
              <div
                style={{
                  fontSize: '16px',
                  maxWidth: '100%',
                  wordWrap: 'break-word',
                  textAlign: 'left',
                  paddingLeft: '8px',
                  paddingRight: '8px',
                }}
              >
                {card && <MarkdownRenderer content={card.answer} />}
              </div>
              {card?.images?.filter((img) => img.side === 'back').length ? (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    justifyContent: 'center',
                    marginTop: '12px',
                    maxWidth: '100%',
                  }}
                >
                  {card.images
                    .filter((img) => img.side === 'back')
                    .map((img) => (
                      <img
                        key={img.id}
                        src={`/api/uploads/flashcard-images/${img.id}`}
                        alt={img.fileName}
                        style={{
                          maxWidth: '100%',
                          maxHeight: '150px',
                          borderRadius: '8px',
                          objectFit: 'contain',
                          border: '1px solid rgba(81,112,255,0.15)',
                        }}
                      />
                    ))}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <NavButton onClick={prev} disabled={currentIndex === 0} title="Previous (←)">
          <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden>chevron_left</span>
        </NavButton>
        <NavButton onClick={reset} title="Reset">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>replay</span>
        </NavButton>
        <NavButton onClick={next} disabled={currentIndex === cards.length - 1} title="Next (→)">
          <span className="material-symbols-outlined" style={{ fontSize: 20 }} aria-hidden>chevron_right</span>
        </NavButton>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <DropdownButton
          icon={<span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>edit</span>}
          label="Edit"
          items={[
            {
              onClick: () => card && startEdit(card),
              icon: <span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>edit</span>,
              label: 'Edit Card',
              hidden: !card || editingId === card?.id,
            },
            { onClick: () => duplicateCard(), icon: <span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>content_copy</span>, label: 'Duplicate' },
            { onClick: () => setIsAdding(true), icon: <span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>add</span>, label: 'Add Card' },
            {
              onClick: () => card && deleteCard(card.id),
              icon: <span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>delete</span>,
              label: 'Delete Card',
              danger: true,
              hidden: !card,
            },
            { onClick: deleteSet, icon: <span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>delete</span>, label: 'Delete Set', danger: true },
          ]}
        />
        <SmallButton onClick={downloadCSV} icon={<span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>download</span>} label="CSV" />
        {sectionSaved ? (
          <SmallButton
            onClick={openSectionPicker}
            icon={<span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>task_alt</span>}
            label="In Notebook"
          />
        ) : (
          <SmallButton
            onClick={openSectionPicker}
            icon={<span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>library_add</span>}
            label="Add to Notebook"
          />
        )}
        <SmallButton
          onClick={startStudyMode}
          icon={loadingStudy ? <span className="material-symbols-outlined" style={{ fontSize: 12, animation: 'spin 1s linear infinite' }} aria-hidden>progress_activity</span> : <span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>psychology</span>}
          label={dueCount !== null && dueCount > 0 ? `Study (${dueCount} due)` : 'Study'}
        />
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
              background: 'var(--background)',
              border: '1px solid rgba(174,137,255,0.45)',
              borderRadius: '16px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            {/* Header */}
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

            {/* Section list */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '8px 12px',
              }}
            >
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

      {/* Add card form */}
      {isAdding && (
        <div
          style={{
            marginTop: '20px',
            width: '100%',
            maxWidth: '360px',
            background: 'var(--surface-container-lowest)',
            border: '1px solid rgba(140,82,255,0.3)',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <label
            style={{
              fontSize: '11px',
              color: 'var(--ink-40)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            New Question
          </label>
          <textarea
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            placeholder="Enter question..."
            rows={3}
            style={{
              resize: 'none',
              background: 'rgba(140,82,255,0.08)',
              border: '1px solid rgba(140,82,255,0.2)',
              borderRadius: '8px',
              padding: '10px',
              fontSize: '14px',
              color: 'var(--on-surface)',
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
          <label
            style={{
              fontSize: '11px',
              color: 'var(--ink-40)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Answer
          </label>
          <textarea
            value={newAnswer}
            onChange={(e) => setNewAnswer(e.target.value)}
            placeholder="Enter answer..."
            rows={3}
            style={{
              resize: 'none',
              background: 'rgba(140,82,255,0.08)',
              border: '1px solid rgba(140,82,255,0.2)',
              borderRadius: '8px',
              padding: '10px',
              fontSize: '14px',
              color: 'var(--on-surface)',
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => {
                setIsAdding(false);
                setNewQuestion('');
                setNewAnswer('');
              }}
              style={{
                padding: '7px 12px',
                borderRadius: '8px',
                border: '1px solid var(--ink-12)',
                background: 'transparent',
                color: 'var(--ink-50)',
                fontSize: '12px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
            <button
              onClick={addCard}
              style={{
                padding: '7px 12px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--accent-strong)',
                color: 'var(--on-primary-container)',
                fontSize: '12px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Add Card
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Section picker tree node */
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

/** Navigation button */
function NavButton({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
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
        border: disabled
          ? '1px solid rgba(174,137,255,0.12)'
          : `1px solid ${hovered ? 'rgba(174,137,255,0.55)' : 'rgba(174,137,255,0.32)'}`,
        background: disabled
          ? 'rgba(140,82,255,0.03)'
          : hovered
            ? 'rgba(140,82,255,0.18)'
            : 'rgba(140,82,255,0.10)',
        color: disabled ? 'var(--ink-20)' : hovered ? 'var(--on-surface)' : 'var(--md-em)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease',
      }}
    >
      {children}
    </button>
  );
}

/** Small action button */
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

/** Dropdown button with menu */
function DropdownButton({
  icon,
  label,
  items,
}: {
  icon: React.ReactNode;
  label: string;
  items: {
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    danger?: boolean;
    hidden?: boolean;
  }[];
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const visibleItems = items.filter((i) => !i.hidden);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '6px 12px',
          borderRadius: '8px',
          border: `1px solid rgba(140,82,255,${open ? '0.3' : '0.15'})`,
          background: open
            ? 'rgba(140,82,255,0.15)'
            : hovered
              ? 'rgba(140,82,255,0.1)'
              : 'transparent',
          color: open || hovered ? 'var(--md-h3)' : 'var(--ink-40)',
          fontSize: '12px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'background 0.12s ease, color 0.12s ease',
        }}
      >
        {icon} {label}{' '}
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: 10,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease',
          }}
          aria-hidden
        >
          expand_more
        </span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: '6px',
            minWidth: '140px',
            background: 'rgba(22,10,46,0.95)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(140,82,255,0.2)',
            borderRadius: '10px',
            padding: '4px',
            zIndex: 50,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {visibleItems.map((item, i) => (
            <DropdownItem key={i} {...item} onClose={() => setOpen(false)} />
          ))}
        </div>
      )}
    </div>
  );
}

function DropdownItem({
  onClick,
  icon,
  label,
  danger,
  onClose,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onClose: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={() => {
        onClick();
        onClose();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        width: '100%',
        padding: '7px 10px',
        borderRadius: '7px',
        border: 'none',
        background: hovered
          ? danger
            ? 'rgb(var(--verdict-fail-rgb) / 0.1)'
            : 'rgba(140,82,255,0.12)'
          : 'transparent',
        color: danger
          ? hovered
            ? 'var(--error)'
            : 'rgb(var(--verdict-fail-rgb) / 0.6)'
          : hovered
            ? 'var(--md-h3)'
            : 'var(--ink-50)',
        fontSize: '12px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
        transition: 'background 0.1s ease, color 0.1s ease',
      }}
    >
      {icon} {label}
    </button>
  );
}
