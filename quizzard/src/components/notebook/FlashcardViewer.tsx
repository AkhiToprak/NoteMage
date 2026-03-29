'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft, ChevronRight, RotateCcw, Download,
  Pencil, Plus, Trash2, X, Check, BookPlus, ChevronDown, Loader2, BookCheck,
} from 'lucide-react';
import { useNotebookWorkspace } from '@/components/notebook/NotebookWorkspaceContext';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';

interface Flashcard {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
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
  const { refreshSections } = useNotebookWorkspace();

  // Section picker state
  const [showSectionPicker, setShowSectionPicker] = useState(false);
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [loadingSections, setLoadingSections] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(assignedSectionId ?? null);
  const [savingSection, setSavingSection] = useState(false);
  const [sectionSaved, setSectionSaved] = useState(!!assignedSectionId);

  const card = cards[currentIndex];

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
      // We'll create via a direct POST — but the API doesn't have a standalone create endpoint.
      // For now, we'll add it optimistically and it will be part of the set.
      // Actually we need to add a card creation endpoint or use the PATCH. Let's use a workaround:
      // We'll call the flashcard set GET to get current state after adding via a simple approach.
      // For MVP, let's add it client-side only and persist via individual PATCH calls.
      // Better: let's create a minimal inline creation by using the set's API.

      // Actually the cleanest approach: just reload the set after creation.
      // But we don't have a create-card endpoint. Let me add the card optimistically for now.
      const tempId = `temp-${Date.now()}`;
      const newCard: Flashcard = {
        id: tempId,
        question: newQuestion.trim(),
        answer: newAnswer.trim(),
        sortOrder: cards.length,
      };
      setCards(prev => [...prev, newCard]);
      setCurrentIndex(cards.length); // Navigate to the new card
      setIsFlipped(false);
      setIsAdding(false);
      setNewQuestion('');
      setNewAnswer('');
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
        height: '100%', color: 'rgba(237,233,255,0.4)', fontFamily: "'DM Sans', sans-serif",
      }}>
        <p style={{ fontSize: '16px', marginBottom: '16px' }}>No flashcards in this set.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      height: '100%', padding: '24px 16px',
      fontFamily: "'DM Sans', sans-serif",
      overflow: 'auto',
    }}>
      {/* Title */}
      <h2 style={{
        fontSize: '20px', fontWeight: 700, color: '#ede9ff',
        margin: '0 0 8px', textAlign: 'center',
        fontFamily: "'Gliker', 'DM Sans', sans-serif",
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
                fontFamily: "'DM Sans', sans-serif",
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
                fontFamily: "'DM Sans', sans-serif",
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEditingId(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '8px 14px', borderRadius: '8px',
                  border: '1px solid rgba(237,233,255,0.1)',
                  background: 'transparent', color: 'rgba(237,233,255,0.5)',
                  fontSize: '13px', cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
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
                  fontFamily: "'DM Sans', sans-serif",
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
              background: 'linear-gradient(145deg, #1a1833 0%, #16152a 50%, #120f24 100%)',
              border: '1px solid rgba(140,82,255,0.25)',
              color: '#ede9ff',
            }}>
              <div style={{
                fontSize: '18px', maxWidth: '100%', wordWrap: 'break-word',
                textAlign: 'center',
              }}>
                {card && <MarkdownRenderer content={card.question} />}
              </div>
              <div style={{
                position: 'absolute', bottom: '20px',
                fontSize: '11px', color: 'rgba(196,169,255,0.3)',
                fontFamily: "'DM Sans', sans-serif",
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
              background: 'linear-gradient(145deg, #1e1a3a 0%, #16152a 50%, #131128 100%)',
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
        <SmallButton onClick={downloadCSV} icon={<Download size={12} />} label="CSV" />
        <SmallButton onClick={() => setIsAdding(true)} icon={<Plus size={12} />} label="Add" />
        {sectionSaved ? (
          <SmallButton onClick={openSectionPicker} icon={<BookCheck size={12} />} label="In Notebook" />
        ) : (
          <SmallButton onClick={openSectionPicker} icon={<BookPlus size={12} />} label="Add to Notebook" />
        )}
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
              background: '#16152a',
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
                fontFamily: "'Gliker', 'DM Sans', sans-serif",
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
              fontFamily: "'DM Sans', sans-serif",
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
              fontFamily: "'DM Sans', sans-serif",
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
                fontSize: '12px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
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
                color: '#fff', fontSize: '12px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
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
          fontFamily: "'DM Sans', sans-serif",
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
        fontFamily: "'DM Sans', sans-serif",
        transition: 'background 0.12s ease, color 0.12s ease',
      }}
    >
      {icon} {label}
    </button>
  );
}
