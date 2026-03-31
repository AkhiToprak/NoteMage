'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, RotateCcw, Download,
  Pencil, Plus, Trash2, X, Check, BookPlus, ChevronDown, Loader2, BookCheck, Copy, ImagePlus,
  Brain,
} from 'lucide-react';
import { useNotebookWorkspace } from '@/components/notebook/NotebookWorkspaceContext';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import SlideEditorModal, { SlideData } from './SlideEditorModal';

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
}

export default function FlashcardViewer({ notebookId, setId, title, initialCards, assignedSectionId }: FlashcardViewerProps) {
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
  const { refreshSections } = useNotebookWorkspace();

  // Section picker state
  const [showSectionPicker, setShowSectionPicker] = useState(false);
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [loadingSections, setLoadingSections] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(assignedSectionId ?? null);
  const [savingSection, setSavingSection] = useState(false);
  const [sectionSaved, setSectionSaved] = useState(!!assignedSectionId);
  const [showSlideEditor, setShowSlideEditor] = useState(false);

  // Study mode (spaced repetition)
  const [studyMode, setStudyMode] = useState(false);
  const [studyCards, setStudyCards] = useState<StudyFlashcard[]>([]);
  const [studyIndex, setStudyIndex] = useState(0);
  const [studyFlipped, setStudyFlipped] = useState(false);
  const [studyResults, setStudyResults] = useState<{ correct: number; total: number } | null>(null);
  const [loadingStudy, setLoadingStudy] = useState(false);
  const [dueCount, setDueCount] = useState<number | null>(null);
  const studyCorrectRef = useRef(0);

  const card = cards[currentIndex];

  const flashcardSlides: SlideData[] = useMemo(() => {
    const slides: SlideData[] = [];
    cards.forEach((c, i) => {
      slides.push({ title: `Card ${i + 1} — Question`, content: c.question });
      slides.push({ title: `Card ${i + 1} — Answer`, content: c.answer });
    });
    return slides;
  }, [cards]);

  const flip = useCallback(() => setIsFlipped(v => !v), []);
  const next = useCallback(() => {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(i => i + 1);
      setIsFlipped(false);
    }
  }, [currentIndex, cards.length]);
  const prev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(i => i - 1);
      setIsFlipped(false);
    }
  }, [currentIndex]);
  const reset = useCallback(() => { setCurrentIndex(0); setIsFlipped(false); }, []);

  const downloadCSV = useCallback(() => {
    let csv = 'question,answer\n';
    cards.forEach(c => {
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

  const openSlideEditor = useCallback(() => {
    setShowSlideEditor(true);
  }, []);

  const downloadPdf = useCallback(() => {
    const a = document.createElement('a');
    a.href = `/api/notebooks/${notebookId}/flashcard-sets/${setId}/export-pdf`;
    a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_flashcards.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [notebookId, setId, title]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture keys when editing
      if (editingId || isAdding) return;
      if (e.code === 'Space') { e.preventDefault(); flip(); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); next(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [flip, prev, next, editingId, isAdding]);

  // ── Fetch due cards count ──
  useEffect(() => {
    fetch(`/api/notebooks/${notebookId}/flashcard-sets/${setId}/study-session`)
      .then(r => r.json())
      .then(res => {
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
      if (Array.isArray(dueCards) && dueCards.length > 0) {
        setStudyCards(dueCards);
        setStudyIndex(0);
        setStudyFlipped(false);
        setStudyResults(null);
        studyCorrectRef.current = 0;
        setStudyMode(true);
      }
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

    if (quality >= 3) studyCorrectRef.current++;

    if (studyIndex < studyCards.length - 1) {
      setStudyIndex(i => i + 1);
      setStudyFlipped(false);
    } else {
      setStudyResults({ correct: studyCorrectRef.current, total: studyCards.length });
    }
  };

  const exitStudyMode = () => {
    setStudyMode(false);
    setStudyCards([]);
    setStudyIndex(0);
    setStudyFlipped(false);
    setStudyResults(null);
    studyCorrectRef.current = 0;
    // Re-fetch due count
    fetch(`/api/notebooks/${notebookId}/flashcard-sets/${setId}/study-session`)
      .then(r => r.json())
      .then(res => {
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
      const res = await fetch(`/api/notebooks/${notebookId}/flashcard-sets/${setId}/flashcards/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: editQuestion, answer: editAnswer }),
      });
      const json = await res.json();
      if (json.success) {
        setCards(prev => prev.map(c => c.id === editingId ? { ...c, question: editQuestion, answer: editAnswer } : c));
      }
    } catch { /* silent */ }
    setEditingId(null);
  };

  // ── Delete card ──
  const deleteCard = async (cardId: string) => {
    if (!window.confirm('Delete this flashcard?')) return;
    try {
      await fetch(`/api/notebooks/${notebookId}/flashcard-sets/${setId}/flashcards/${cardId}`, { method: 'DELETE' });
      const newCards = cards.filter(c => c.id !== cardId);
      setCards(newCards);
      if (currentIndex >= newCards.length) setCurrentIndex(Math.max(0, newCards.length - 1));
      setIsFlipped(false);
    } catch { /* silent */ }
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
      setCards(prev => [...prev, createdCard]);
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
        body: JSON.stringify({ question: cardToDuplicate.question, answer: cardToDuplicate.answer }),
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
      const formData = new FormData();
      formData.append('file', file);
      formData.append('side', side);
      const res = await fetch(
        `/api/notebooks/${notebookId}/flashcard-sets/${setId}/flashcards/${cardId}/images`,
        { method: 'POST', body: formData }
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
        setCards(prev => prev.map(c =>
          c.id === cardId ? { ...c, images: [...(c.images || []), newImage] } : c
        ));
      }
    } catch { /* silent */ }
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
        setCards(prev => prev.map(c =>
          c.id === cardId
            ? { ...c, images: (c.images || []).filter(img => img.id !== imageId) }
            : c
        ));
      }
    } catch { /* silent */ }
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
        flat.forEach(s => map.set(s.id, { ...s, children: [] }));
        flat.forEach(s => {
          const node = map.get(s.id)!;
          if (s.parentId && map.has(s.parentId)) {
            map.get(s.parentId)!.children!.push(node);
          } else {
            roots.push(node);
          }
        });
        setSections(roots);
      }
    } catch { /* silent */ }
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
    } catch { /* silent */ }
    setSavingSection(false);
  };

  if (cards.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: 'rgba(237,233,255,0.4)', fontFamily: 'inherit',
      }}>
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
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100%', padding: '24px 16px', fontFamily: 'inherit',
        }}>
          <div style={{
            background: '#1a1833', borderRadius: '24px', padding: '48px 40px',
            border: '1px solid rgba(140,82,255,0.2)', textAlign: 'center',
            maxWidth: '400px', width: '100%',
          }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '50%',
              background: pct >= 70 ? 'rgba(74,222,128,0.15)' : 'rgba(251,191,36,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
            }}>
              <Brain size={28} style={{ color: pct >= 70 ? '#4ade80' : '#fbbf24' }} />
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#ede9ff', margin: '0 0 8px' }}>
              Session Complete
            </h2>
            <p style={{ fontSize: '14px', color: 'rgba(237,233,255,0.5)', margin: '0 0 24px' }}>
              You reviewed {studyResults.total} {studyResults.total === 1 ? 'card' : 'cards'}
            </p>
            <div style={{
              display: 'flex', gap: '16px', justifyContent: 'center', marginBottom: '24px',
            }}>
              <div style={{
                padding: '16px 20px', borderRadius: '12px',
                background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)',
              }}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#4ade80' }}>{studyResults.correct}</div>
                <div style={{ fontSize: '11px', color: 'rgba(74,222,128,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Correct</div>
              </div>
              <div style={{
                padding: '16px 20px', borderRadius: '12px',
                background: 'rgba(252,165,165,0.1)', border: '1px solid rgba(252,165,165,0.2)',
              }}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#fca5a5' }}>{studyResults.total - studyResults.correct}</div>
                <div style={{ fontSize: '11px', color: 'rgba(252,165,165,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Wrong</div>
              </div>
              <div style={{
                padding: '16px 20px', borderRadius: '12px',
                background: 'rgba(140,82,255,0.1)', border: '1px solid rgba(140,82,255,0.2)',
              }}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#c4a9ff' }}>{pct}%</div>
                <div style={{ fontSize: '11px', color: 'rgba(196,169,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Accuracy</div>
              </div>
            </div>
            <button
              onClick={exitStudyMode}
              style={{
                padding: '12px 32px', borderRadius: '12px',
                background: 'linear-gradient(135deg, #8c52ff, #5170ff)',
                border: 'none', color: '#fff', fontSize: '14px', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Done
            </button>
          </div>
        </div>
      );
    }

    // Active study session — show one card at a time
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        height: '100%', padding: '24px 16px', fontFamily: 'inherit', overflow: 'auto',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', maxWidth: '400px', marginBottom: '16px',
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#ede9ff', margin: 0 }}>
            Study Mode
          </h2>
          <button
            onClick={exitStudyMode}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '6px 12px', borderRadius: '8px',
              border: '1px solid rgba(140,82,255,0.2)',
              background: 'transparent', color: 'rgba(237,233,255,0.5)',
              fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <X size={14} /> Exit
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ width: '100%', maxWidth: '400px', marginBottom: '20px' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', fontSize: '11px',
            color: 'rgba(237,233,255,0.4)', marginBottom: '6px',
          }}>
            <span>Card {studyIndex + 1} of {studyCards.length}</span>
            <span>{Math.round(((studyIndex) / studyCards.length) * 100)}% done</span>
          </div>
          <div style={{
            height: '4px', background: 'rgba(140,82,255,0.15)', borderRadius: '2px', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', width: `${(studyIndex / studyCards.length) * 100}%`,
              background: 'linear-gradient(90deg, #8c52ff, #5170ff)',
              borderRadius: '2px', transition: 'width 0.3s ease',
            }} />
          </div>
        </div>

        {/* Study card */}
        {studyCard && (
          <div
            onClick={() => !studyFlipped && setStudyFlipped(true)}
            style={{
              width: '100%', maxWidth: '360px', minHeight: '400px',
              borderRadius: '16px', padding: '32px 24px',
              background: studyFlipped
                ? 'linear-gradient(135deg, #1a1040, #0f1535)'
                : 'linear-gradient(135deg, #1a1833, #141230)',
              border: `1px solid ${studyFlipped ? 'rgba(81,112,255,0.3)' : 'rgba(140,82,255,0.2)'}`,
              cursor: studyFlipped ? 'default' : 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              textAlign: 'center', marginBottom: '20px',
            }}
          >
            <div style={{
              fontSize: '10px', color: 'rgba(237,233,255,0.3)', textTransform: 'uppercase',
              letterSpacing: '0.1em', marginBottom: '16px',
            }}>
              {studyFlipped ? 'Answer' : 'Question — tap to reveal'}
            </div>
            <div style={{
              fontSize: '16px', lineHeight: 1.6, color: '#ede9ff',
              wordBreak: 'break-word', maxWidth: '100%',
            }}>
              <MarkdownRenderer content={studyFlipped ? studyCard.answer : studyCard.question} />
            </div>
          </div>
        )}

        {/* Rating buttons — show only after flipping */}
        {studyFlipped && (
          <div style={{
            display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center',
          }}>
            {[
              { quality: 0, label: 'Again', color: '#fca5a5', bg: 'rgba(252,165,165,0.1)', border: 'rgba(252,165,165,0.25)' },
              { quality: 3, label: 'Hard', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.25)' },
              { quality: 4, label: 'Good', color: '#4ade80', bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.25)' },
              { quality: 5, label: 'Easy', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.25)' },
            ].map(({ quality, label, color, bg, border }) => (
              <button
                key={quality}
                onClick={() => rateCard(quality)}
                style={{
                  padding: '10px 20px', borderRadius: '10px',
                  background: bg, border: `1px solid ${border}`,
                  color, fontSize: '13px', fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'opacity 0.15s ease',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.8'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      height: '100%', padding: '24px 16px',
      fontFamily: 'inherit',
      overflow: 'auto',
    }}>
      {/* Title */}
      <h2 style={{
        fontSize: '20px', fontWeight: 700, color: '#ede9ff',
        margin: '0 0 8px', textAlign: 'center',
        fontFamily: 'inherit',
      }}>
        {title}
      </h2>

      {/* Progress */}
      <div style={{
        fontSize: '13px', color: 'rgba(237,233,255,0.4)', marginBottom: '24px',
      }}>
        <span style={{ color: '#c4a9ff', fontWeight: 600 }}>{currentIndex + 1}</span>
        {' / '}
        {cards.length}
      </div>

      {/* Card container */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '360px',
        height: '520px',
        perspective: '1000px',
        marginBottom: '24px',
        flexShrink: 0,
      }}>
        {/* Edit overlay */}
        {editingId === card?.id ? (
          <div style={{
            width: '100%', height: '100%',
            borderRadius: '16px',
            background: '#1a1833',
            border: '1px solid rgba(140,82,255,0.3)',
            padding: '24px',
            display: 'flex', flexDirection: 'column', gap: '12px',
          }}>
            <label style={{ fontSize: '11px', color: 'rgba(237,233,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Question</label>
            <textarea
              value={editQuestion}
              onChange={e => setEditQuestion(e.target.value)}
              style={{
                flex: 1, resize: 'none',
                background: 'rgba(140,82,255,0.08)',
                border: '1px solid rgba(140,82,255,0.2)',
                borderRadius: '8px', padding: '12px',
                fontSize: '14px', color: '#ede9ff',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
            <label style={{ fontSize: '11px', color: 'rgba(237,233,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Answer</label>
            <textarea
              value={editAnswer}
              onChange={e => setEditAnswer(e.target.value)}
              style={{
                flex: 1, resize: 'none',
                background: 'rgba(140,82,255,0.08)',
                border: '1px solid rgba(140,82,255,0.2)',
                borderRadius: '8px', padding: '12px',
                fontSize: '14px', color: '#ede9ff',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
            {/* Image management */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(['front', 'back'] as const).map(side => (
                <div key={side}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: '4px',
                  }}>
                    <label style={{
                      fontSize: '11px', color: 'rgba(237,233,255,0.4)',
                      textTransform: 'uppercase', letterSpacing: '0.08em',
                    }}>
                      {side} images
                    </label>
                    <button
                      onClick={() => side === 'front' ? frontFileInputRef.current?.click() : backFileInputRef.current?.click()}
                      disabled={uploadingSide === side}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        padding: '3px 8px', borderRadius: '6px',
                        border: '1px solid rgba(140,82,255,0.2)',
                        background: 'rgba(140,82,255,0.08)',
                        color: 'rgba(237,233,255,0.5)',
                        fontSize: '11px', cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {uploadingSide === side ? <Loader2 size={10} className="animate-spin" /> : <ImagePlus size={10} />}
                      Add
                    </button>
                  </div>
                  {card?.images?.filter(img => img.side === side).length ? (
                    <div style={{
                      display: 'flex', flexWrap: 'wrap', gap: '6px',
                    }}>
                      {card.images.filter(img => img.side === side).map(img => (
                        <div key={img.id} style={{ position: 'relative' }}>
                          <img
                            src={`/api/uploads/flashcard-images/${img.id}`}
                            alt={img.fileName}
                            style={{
                              width: '56px', height: '56px',
                              borderRadius: '6px', objectFit: 'cover',
                              border: '1px solid rgba(140,82,255,0.15)',
                            }}
                          />
                          <button
                            onClick={() => deleteImage(card.id, img.id)}
                            style={{
                              position: 'absolute', top: '-4px', right: '-4px',
                              width: '16px', height: '16px',
                              borderRadius: '50%',
                              border: 'none',
                              background: '#ef4444',
                              color: '#fff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: 'pointer', padding: 0,
                              fontSize: '10px',
                            }}
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{
                      fontSize: '11px', color: 'rgba(237,233,255,0.2)',
                      padding: '4px 0',
                    }}>
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
                onChange={e => handleFileSelect(e, 'front')}
              />
              <input
                ref={backFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                style={{ display: 'none' }}
                onChange={e => handleFileSelect(e, 'back')}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEditingId(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '8px 14px', borderRadius: '8px',
                  border: '1px solid rgba(237,233,255,0.1)',
                  background: 'transparent', color: 'rgba(237,233,255,0.5)',
                  fontSize: '13px', cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <X size={14} /> Cancel
              </button>
              <button
                onClick={saveEdit}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '8px 14px', borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #8c52ff, #5170ff)',
                  color: '#fff', fontSize: '13px', cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <Check size={14} /> Save
              </button>
            </div>
          </div>
        ) : (
          /* 3D flip card */
          <div
            onClick={flip}
            style={{
              width: '100%', height: '100%',
              position: 'relative',
              transformStyle: 'preserve-3d',
              transition: 'transform 0.6s cubic-bezier(0.4, 0.0, 0.2, 1)',
              transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              cursor: 'pointer',
            }}
          >
            {/* Front (question) */}
            <div style={{
              position: 'absolute', width: '100%', height: '100%',
              backfaceVisibility: 'hidden',
              borderRadius: '16px',
              overflow: 'hidden',
              display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
              padding: '40px',
              boxShadow: '0 8px 32px rgba(140,82,255,0.15), 0 2px 8px rgba(0,0,0,0.3)',
              background: 'linear-gradient(145deg, #1a1833 0%, #1a1a36 50%, #120f24 100%)',
              border: '1px solid rgba(140,82,255,0.25)',
              color: '#ede9ff',
            }}>
              <div style={{
                fontSize: '18px', maxWidth: '100%', wordWrap: 'break-word',
                textAlign: 'center',
              }}>
                {card && <MarkdownRenderer content={card.question} />}
              </div>
              {card?.images?.filter(img => img.side === 'front').length ? (
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: '8px',
                  justifyContent: 'center', marginTop: '12px', maxWidth: '100%',
                }}>
                  {card.images.filter(img => img.side === 'front').map(img => (
                    <img
                      key={img.id}
                      src={`/api/uploads/flashcard-images/${img.id}`}
                      alt={img.fileName}
                      style={{
                        maxWidth: '100%', maxHeight: '150px',
                        borderRadius: '8px', objectFit: 'contain',
                        border: '1px solid rgba(140,82,255,0.15)',
                      }}
                    />
                  ))}
                </div>
              ) : null}
              <div style={{
                position: 'absolute', bottom: '20px',
                fontSize: '11px', color: 'rgba(196,169,255,0.3)',
                fontFamily: 'inherit',
              }}>
                Click or press Space to flip
              </div>
            </div>

            {/* Back (answer) */}
            <div style={{
              position: 'absolute', width: '100%', height: '100%',
              backfaceVisibility: 'hidden',
              borderRadius: '16px',
              overflow: 'auto',
              display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
              padding: '40px',
              boxShadow: '0 8px 32px rgba(81,112,255,0.12), 0 2px 8px rgba(0,0,0,0.3)',
              background: 'linear-gradient(145deg, #1e1a3a 0%, #1a1a36 50%, #131128 100%)',
              border: '1px solid rgba(81,112,255,0.2)',
              color: 'rgba(237,233,255,0.85)',
              transform: 'rotateY(180deg)',
            }}>
              <div style={{
                fontSize: '16px', maxWidth: '100%', wordWrap: 'break-word',
                textAlign: 'left',
                paddingLeft: '8px', paddingRight: '8px',
              }}>
                {card && <MarkdownRenderer content={card.answer} />}
              </div>
              {card?.images?.filter(img => img.side === 'back').length ? (
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: '8px',
                  justifyContent: 'center', marginTop: '12px', maxWidth: '100%',
                }}>
                  {card.images.filter(img => img.side === 'back').map(img => (
                    <img
                      key={img.id}
                      src={`/api/uploads/flashcard-images/${img.id}`}
                      alt={img.fileName}
                      style={{
                        maxWidth: '100%', maxHeight: '150px',
                        borderRadius: '8px', objectFit: 'contain',
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
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        marginBottom: '16px',
      }}>
        <NavButton onClick={prev} disabled={currentIndex === 0} title="Previous (←)">
          <ChevronLeft size={20} />
        </NavButton>
        <NavButton onClick={reset} title="Reset">
          <RotateCcw size={16} />
        </NavButton>
        <NavButton onClick={next} disabled={currentIndex === cards.length - 1} title="Next (→)">
          <ChevronRight size={20} />
        </NavButton>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {card && editingId !== card.id && (
          <SmallButton onClick={() => startEdit(card)} icon={<Pencil size={12} />} label="Edit" />
        )}
        <SmallButton onClick={() => duplicateCard()} icon={<Copy size={12} />} label="Duplicate" />
        <SmallButton onClick={downloadCSV} icon={<Download size={12} />} label="CSV" />
        <SmallButton onClick={openSlideEditor} icon={<Download size={12} />} label="PPTX" />
        <SmallButton onClick={downloadPdf} icon={<Download size={12} />} label="PDF" />
        <SmallButton onClick={() => setIsAdding(true)} icon={<Plus size={12} />} label="Add" />
        {sectionSaved ? (
          <SmallButton onClick={openSectionPicker} icon={<BookCheck size={12} />} label="In Notebook" />
        ) : (
          <SmallButton onClick={openSectionPicker} icon={<BookPlus size={12} />} label="Add to Notebook" />
        )}
        <SmallButton
          onClick={startStudyMode}
          icon={loadingStudy ? <Loader2 size={12} className="animate-spin" /> : <Brain size={12} />}
          label={dueCount !== null ? `Study (${dueCount})` : 'Study'}
        />
        {card && (
          <SmallButton onClick={() => deleteCard(card.id)} icon={<Trash2 size={12} />} label="Delete" danger />
        )}
      </div>

      {/* Section picker modal */}
      {showSectionPicker && (
        <div
          onClick={() => setShowSectionPicker(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '380px', maxHeight: '420px',
              background: '#1a1a36',
              border: '1px solid rgba(140,82,255,0.25)',
              borderRadius: '16px',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid rgba(140,82,255,0.15)',
            }}>
              <h3 style={{
                fontSize: '15px', fontWeight: 700, color: '#ede9ff', margin: 0,
                fontFamily: 'inherit',
              }}>
                Add to Section
              </h3>
              <button
                onClick={() => setShowSectionPicker(false)}
                style={{
                  background: 'none', border: 'none', color: 'rgba(237,233,255,0.4)',
                  cursor: 'pointer', padding: '4px', display: 'flex',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Section list */}
            <div style={{
              flex: 1, overflowY: 'auto', padding: '8px 12px',
            }}>
              {loadingSections ? (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '40px 0', color: 'rgba(237,233,255,0.3)',
                }}>
                  <Loader2 size={20} className="animate-spin" />
                </div>
              ) : sections.length === 0 ? (
                <div style={{
                  padding: '32px 16px', textAlign: 'center',
                  fontSize: '13px', color: 'rgba(237,233,255,0.3)',
                }}>
                  No sections in this notebook yet.
                </div>
              ) : (
                sections.map(s => (
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
        <div style={{
          marginTop: '20px', width: '100%', maxWidth: '360px',
          background: '#1a1833',
          border: '1px solid rgba(140,82,255,0.3)',
          borderRadius: '12px', padding: '16px',
          display: 'flex', flexDirection: 'column', gap: '10px',
        }}>
          <label style={{ fontSize: '11px', color: 'rgba(237,233,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>New Question</label>
          <textarea
            value={newQuestion}
            onChange={e => setNewQuestion(e.target.value)}
            placeholder="Enter question..."
            rows={3}
            style={{
              resize: 'none',
              background: 'rgba(140,82,255,0.08)',
              border: '1px solid rgba(140,82,255,0.2)',
              borderRadius: '8px', padding: '10px',
              fontSize: '14px', color: '#ede9ff',
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
          <label style={{ fontSize: '11px', color: 'rgba(237,233,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Answer</label>
          <textarea
            value={newAnswer}
            onChange={e => setNewAnswer(e.target.value)}
            placeholder="Enter answer..."
            rows={3}
            style={{
              resize: 'none',
              background: 'rgba(140,82,255,0.08)',
              border: '1px solid rgba(140,82,255,0.2)',
              borderRadius: '8px', padding: '10px',
              fontSize: '14px', color: '#ede9ff',
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              onClick={() => { setIsAdding(false); setNewQuestion(''); setNewAnswer(''); }}
              style={{
                padding: '7px 12px', borderRadius: '8px',
                border: '1px solid rgba(237,233,255,0.1)',
                background: 'transparent', color: 'rgba(237,233,255,0.5)',
                fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
            <button
              onClick={addCard}
              style={{
                padding: '7px 12px', borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #8c52ff, #5170ff)',
                color: '#fff', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Add Card
            </button>
          </div>
        </div>
      )}

      {/* Slide editor modal */}
      {showSlideEditor && (
        <SlideEditorModal
          initialSlides={flashcardSlides}
          presentationTitle={title}
          onExport={() => setShowSlideEditor(false)}
          onClose={() => setShowSlideEditor(false)}
        />
      )}
    </div>
  );
}

/** Section picker tree node */
function SectionPickerNode({ section, depth, selectedId, saving, onSelect }: {
  section: SectionItem; depth: number; selectedId: string | null;
  saving: boolean; onSelect: (id: string) => void;
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
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 12px',
          paddingLeft: `${12 + depth * 16}px`,
          borderRadius: '8px',
          cursor: saving ? 'not-allowed' : 'pointer',
          background: isSelected
            ? 'rgba(140,82,255,0.2)'
            : hovered ? 'rgba(140,82,255,0.08)' : 'transparent',
          border: isSelected ? '1px solid rgba(140,82,255,0.4)' : '1px solid transparent',
          transition: 'background 0.12s ease',
          marginBottom: '2px',
        }}
      >
        {hasChildren && (
          <button
            onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
            style={{
              background: 'none', border: 'none', padding: '0', cursor: 'pointer',
              color: 'rgba(237,233,255,0.3)', display: 'flex',
            }}
          >
            <ChevronDown size={14} style={{
              transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.15s ease',
            }} />
          </button>
        )}
        {!hasChildren && <div style={{ width: '14px' }} />}
        <span style={{
          fontSize: '13px', color: isSelected ? '#c4a9ff' : '#ede9ff',
          fontWeight: isSelected ? 600 : 400,
          fontFamily: 'inherit',
          flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {section.title}
        </span>
        {isSelected && <Check size={14} style={{ color: '#8c52ff', flexShrink: 0 }} />}
      </div>
      {hasChildren && expanded && section.children!.map(child => (
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
function NavButton({ onClick, disabled, title, children }: {
  onClick: () => void; disabled?: boolean; title: string; children: React.ReactNode;
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
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '44px', height: '44px', borderRadius: '12px',
        border: '1px solid rgba(140,82,255,0.2)',
        background: hovered && !disabled ? 'rgba(140,82,255,0.15)' : 'rgba(140,82,255,0.06)',
        color: disabled ? 'rgba(237,233,255,0.15)' : '#c4a9ff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s ease',
      }}
    >
      {children}
    </button>
  );
}

/** Small action button */
function SmallButton({ onClick, icon, label, danger }: {
  onClick: () => void; icon: React.ReactNode; label: string; danger?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '5px',
        padding: '6px 12px', borderRadius: '8px',
        border: `1px solid ${danger ? 'rgba(252,165,165,0.2)' : 'rgba(140,82,255,0.15)'}`,
        background: hovered
          ? (danger ? 'rgba(252,165,165,0.1)' : 'rgba(140,82,255,0.1)')
          : 'transparent',
        color: danger
          ? (hovered ? '#fca5a5' : 'rgba(252,165,165,0.6)')
          : (hovered ? '#c4a9ff' : 'rgba(237,233,255,0.4)'),
        fontSize: '12px', cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 0.12s ease, color 0.12s ease',
      }}
    >
      {icon} {label}
    </button>
  );
}
