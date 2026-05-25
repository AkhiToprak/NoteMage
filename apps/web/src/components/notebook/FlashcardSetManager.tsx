'use client';

import { useState, useEffect, useCallback } from 'react';
import FlashcardImportDialog from '@/components/notebook/FlashcardImportDialog';

interface FlashcardSet {
  id: string;
  title: string;
  _count?: { flashcards: number };
  flashcards?: FlashcardCard[];
}

interface FlashcardCard {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
}

interface FlashcardSetManagerProps {
  notebookId: string;
  sectionId?: string;
  onClose: () => void;
  onUpdated: () => void;
}

type Mode = 'browse' | 'merge' | 'split';

export default function FlashcardSetManager({
  notebookId,
  sectionId,
  onClose,
  onUpdated,
}: FlashcardSetManagerProps) {
  const [sets, setSets] = useState<FlashcardSet[]>([]);
  const [selectedSetIds, setSelectedSetIds] = useState<Set<string>>(new Set());
  const [expandedSetId, setExpandedSetId] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<FlashcardCard[]>([]);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>('browse');
  const [loading, setLoading] = useState(true);
  const [loadingCards, setLoadingCards] = useState(false);
  const [mergeTitle, setMergeTitle] = useState('');
  const [splitTitle, setSplitTitle] = useState('');
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [operating, setOperating] = useState(false);
  const [error, setError] = useState('');
  const [showImport, setShowImport] = useState(false);

  // Fetch all flashcard sets
  const fetchSets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/flashcard-sets`);
      const json = await res.json();
      if (json.success) {
        setSets(json.data);
      } else {
        setError(json.message || 'Failed to load flashcard sets');
      }
    } catch {
      setError('Failed to load flashcard sets');
    }
    setLoading(false);
  }, [notebookId]);

  useEffect(() => {
    fetchSets(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [fetchSets]);

  // Fetch cards for a specific set
  const fetchCards = useCallback(
    async (setId: string) => {
      setLoadingCards(true);
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/flashcard-sets/${setId}`);
        const json = await res.json();
        if (json.success && json.data?.flashcards) {
          setExpandedCards(json.data.flashcards);
        }
      } catch {
        /* silent */
      }
      setLoadingCards(false);
    },
    [notebookId]
  );

  const toggleExpand = useCallback(
    (setId: string) => {
      if (expandedSetId === setId) {
        setExpandedSetId(null);
        setExpandedCards([]);
        setSelectedCardIds(new Set());
      } else {
        setExpandedSetId(setId);
        setSelectedCardIds(new Set());
        fetchCards(setId);
      }
    },
    [expandedSetId, fetchCards]
  );

  // Toggle set selection (merge mode)
  const toggleSetSelection = useCallback((setId: string) => {
    setSelectedSetIds((prev) => {
      const next = new Set(prev);
      if (next.has(setId)) next.delete(setId);
      else next.add(setId);
      return next;
    });
  }, []);

  // Toggle card selection (split mode)
  const toggleCardSelection = useCallback((cardId: string) => {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, []);

  // Change mode
  const switchMode = useCallback((newMode: Mode) => {
    setMode(newMode);
    setSelectedSetIds(new Set());
    setSelectedCardIds(new Set());
    setExpandedSetId(null);
    setExpandedCards([]);
    setShowMergeDialog(false);
    setShowSplitDialog(false);
    setError('');
  }, []);

  // Merge operation
  const handleMerge = useCallback(async () => {
    if (selectedSetIds.size < 2 || !mergeTitle.trim()) return;
    setOperating(true);
    setError('');
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/flashcard-sets/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceSetIds: Array.from(selectedSetIds),
          targetTitle: mergeTitle.trim(),
          deleteOriginals: true,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowMergeDialog(false);
        setMergeTitle('');
        setSelectedSetIds(new Set());
        await fetchSets();
        onUpdated();
      } else {
        setError(json.message || 'Merge failed');
      }
    } catch {
      setError('Merge failed. Please try again.');
    }
    setOperating(false);
  }, [notebookId, selectedSetIds, mergeTitle, fetchSets, onUpdated]);

  // Split operation
  const handleSplit = useCallback(async () => {
    if (!expandedSetId || selectedCardIds.size === 0 || !splitTitle.trim()) return;
    // Ensure at least 1 card remains in original set
    if (selectedCardIds.size >= expandedCards.length) {
      setError('At least one card must remain in the original set.');
      return;
    }
    setOperating(true);
    setError('');
    try {
      const res = await fetch(
        `/api/notebooks/${notebookId}/flashcard-sets/${expandedSetId}/split`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cardIds: Array.from(selectedCardIds),
            newTitle: splitTitle.trim(),
          }),
        }
      );
      const json = await res.json();
      if (json.success) {
        setShowSplitDialog(false);
        setSplitTitle('');
        setSelectedCardIds(new Set());
        setExpandedSetId(null);
        setExpandedCards([]);
        await fetchSets();
        onUpdated();
      } else {
        setError(json.message || 'Split failed');
      }
    } catch {
      setError('Split failed. Please try again.');
    }
    setOperating(false);
  }, [
    notebookId,
    expandedSetId,
    selectedCardIds,
    splitTitle,
    expandedCards.length,
    fetchSets,
    onUpdated,
  ]);

  const canMerge = selectedSetIds.size >= 2;
  const canSplit =
    expandedSetId !== null &&
    selectedCardIds.size > 0 &&
    selectedCardIds.size < expandedCards.length;

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
          width: '520px',
          maxHeight: '85vh',
          background: '#1e1d35',
          border: '1px solid rgba(174,137,255,0.45)',
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
            borderBottom: '1px solid rgba(174,137,255,0.30)',
            flexShrink: 0,
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
            Manage Flashcard Sets
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ink-40)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>
              close
            </span>
          </button>
        </div>

        {/* Mode tabs */}
        <div
          style={{
            display: 'flex',
            gap: '4px',
            padding: '12px 20px 8px',
            flexShrink: 0,
            alignItems: 'center',
          }}
        >
          {(['browse', 'merge', 'split'] as Mode[]).map((m) => (
            <ModeTab
              key={m}
              label={m.charAt(0).toUpperCase() + m.slice(1)}
              active={mode === m}
              onClick={() => switchMode(m)}
            />
          ))}
          <div style={{ flex: 1 }} />
          <ImportButton onClick={() => setShowImport(true)} />
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px 20px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          {loading ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px 0',
                color: 'var(--ink-30)',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 20, animation: 'spin 1s linear infinite' }}
                aria-hidden
              >
                progress_activity
              </span>
            </div>
          ) : sets.length === 0 ? (
            <div
              style={{
                padding: '32px 16px',
                textAlign: 'center',
                fontSize: '13px',
                color: 'var(--ink-30)',
              }}
            >
              No flashcard sets in this notebook.
            </div>
          ) : (
            <>
              {/* Mode description */}
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--ink-30)',
                  padding: '0 0 6px',
                  lineHeight: 1.5,
                }}
              >
                {mode === 'browse' && 'Click a set to view its cards.'}
                {mode === 'merge' && 'Select 2 or more sets to merge them into one.'}
                {mode === 'split' && 'Click a set, then select cards to split into a new set.'}
              </div>

              {/* Set list */}
              {sets.map((set) => {
                const cardCount = set._count?.flashcards ?? set.flashcards?.length ?? 0;
                const isExpanded = expandedSetId === set.id;
                const isSelectedForMerge = selectedSetIds.has(set.id);

                return (
                  <div key={set.id}>
                    {/* Set row */}
                    <SetRow
                      set={set}
                      cardCount={cardCount}
                      isExpanded={isExpanded}
                      mode={mode}
                      isSelectedForMerge={isSelectedForMerge}
                      onToggleExpand={() => toggleExpand(set.id)}
                      onToggleMergeSelect={() => toggleSetSelection(set.id)}
                    />

                    {/* Expanded cards */}
                    {isExpanded && (
                      <div
                        style={{
                          marginLeft: '12px',
                          borderLeft: '2px solid rgba(174,137,255,0.30)',
                          paddingLeft: '10px',
                          paddingTop: '4px',
                          paddingBottom: '4px',
                        }}
                      >
                        {loadingCards ? (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '16px 0',
                              color: 'var(--ink-30)',
                            }}
                          >
                            <span
                              className="material-symbols-outlined"
                              style={{ fontSize: 14, animation: 'spin 1s linear infinite' }}
                              aria-hidden
                            >
                              progress_activity
                            </span>
                          </div>
                        ) : expandedCards.length === 0 ? (
                          <div
                            style={{
                              fontSize: '12px',
                              color: 'var(--ink-20)',
                              padding: '8px 0',
                            }}
                          >
                            No cards in this set.
                          </div>
                        ) : (
                          expandedCards.map((card) => (
                            <CardRow
                              key={card.id}
                              card={card}
                              mode={mode}
                              isSelected={selectedCardIds.has(card.id)}
                              onToggleSelect={() => toggleCardSelection(card.id)}
                            />
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {/* Error */}
          {error && (
            <div
              style={{
                fontSize: '12px',
                color: '#f87171',
                textAlign: 'center',
                padding: '4px 0',
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            padding: '12px 20px',
            borderTop: '1px solid rgba(174,137,255,0.30)',
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--ink-30)' }}>
            {mode === 'merge' &&
              selectedSetIds.size > 0 &&
              `${selectedSetIds.size} set${selectedSetIds.size > 1 ? 's' : ''} selected`}
            {mode === 'split' &&
              selectedCardIds.size > 0 &&
              `${selectedCardIds.size} card${selectedCardIds.size > 1 ? 's' : ''} selected`}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid var(--ink-12)',
                background: 'transparent',
                color: 'var(--ink-50)',
                fontSize: '13px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Close
            </button>

            {mode === 'merge' && (
              <button
                onClick={() => {
                  setShowMergeDialog(true);
                  setMergeTitle('');
                }}
                disabled={!canMerge}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: canMerge ? '#8c52ff' : 'rgba(140,82,255,0.2)',
                  color: canMerge ? 'var(--on-surface)' : 'var(--ink-30)',
                  fontSize: '13px',
                  cursor: canMerge ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                }}
              >
                Merge Selected
              </button>
            )}

            {mode === 'split' && (
              <button
                onClick={() => {
                  setShowSplitDialog(true);
                  setSplitTitle('');
                }}
                disabled={!canSplit}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: canSplit ? '#8c52ff' : 'rgba(140,82,255,0.2)',
                  color: canSplit ? 'var(--on-surface)' : 'var(--ink-30)',
                  fontSize: '13px',
                  cursor: canSplit ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                }}
              >
                Split Selected
              </button>
            )}
          </div>
        </div>

        {/* Merge title dialog */}
        {showMergeDialog && (
          <TitleDialog
            title="Merge Sets"
            placeholder="Name for merged set..."
            value={mergeTitle}
            onChange={setMergeTitle}
            onConfirm={handleMerge}
            onCancel={() => setShowMergeDialog(false)}
            confirmLabel={operating ? 'Merging...' : 'Merge'}
            operating={operating}
          />
        )}

        {/* Split title dialog */}
        {showSplitDialog && (
          <TitleDialog
            title="Split Cards to New Set"
            placeholder="Name for new set..."
            value={splitTitle}
            onChange={setSplitTitle}
            onConfirm={handleSplit}
            onCancel={() => setShowSplitDialog(false)}
            confirmLabel={operating ? 'Splitting...' : 'Split'}
            operating={operating}
          />
        )}

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>

      {/* Import dialog */}
      {showImport && (
        <FlashcardImportDialog
          notebookId={notebookId}
          sectionId={sectionId}
          onImported={() => {
            setShowImport(false);
            fetchSets();
            onUpdated();
          }}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}

/* ── Import Button ── */
function ImportButton({ onClick }: { onClick: () => void }) {
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
        border: '1px solid rgba(140,82,255,0.25)',
        background: hovered ? 'rgba(140,82,255,0.15)' : 'rgba(140,82,255,0.08)',
        color: hovered ? '#c4a9ff' : 'var(--ink-50)',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 0.12s ease, color 0.12s ease, border-color 0.12s ease',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 13 }} aria-hidden>
        upload_file
      </span>
      Import
    </button>
  );
}

/* ── Mode Tab ── */
function ModeTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '6px 14px',
        borderRadius: '8px',
        border: active ? '1px solid rgba(140,82,255,0.4)' : '1px solid rgba(140,82,255,0.12)',
        background: active
          ? 'rgba(140,82,255,0.2)'
          : hovered
            ? 'rgba(140,82,255,0.08)'
            : 'transparent',
        color: active ? '#c4a9ff' : hovered ? 'var(--ink-60)' : 'var(--ink-40)',
        fontSize: '12px',
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 0.12s ease, color 0.12s ease, border-color 0.12s ease',
      }}
    >
      {label}
    </button>
  );
}

/* ── Set Row ── */
function SetRow({
  set,
  cardCount,
  isExpanded,
  mode,
  isSelectedForMerge,
  onToggleExpand,
  onToggleMergeSelect,
}: {
  set: FlashcardSet;
  cardCount: number;
  isExpanded: boolean;
  mode: Mode;
  isSelectedForMerge: boolean;
  onToggleExpand: () => void;
  onToggleMergeSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const handleClick = () => {
    if (mode === 'merge') {
      onToggleMergeSelect();
    } else {
      onToggleExpand();
    }
  };

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 10px',
        borderRadius: '8px',
        cursor: 'pointer',
        background: isSelectedForMerge
          ? 'rgba(140,82,255,0.15)'
          : isExpanded
            ? 'rgba(140,82,255,0.08)'
            : hovered
              ? 'var(--ink-04)'
              : 'transparent',
        border: isSelectedForMerge ? '1px solid rgba(140,82,255,0.35)' : '1px solid transparent',
        transition: 'background 0.12s ease, border-color 0.12s ease',
      }}
    >
      {/* Checkbox for merge mode */}
      {mode === 'merge' && (
        <div
          style={{
            width: '16px',
            height: '16px',
            borderRadius: '4px',
            border: isSelectedForMerge ? '2px solid #8c52ff' : '2px solid var(--ink-20)',
            background: isSelectedForMerge ? 'rgba(140,82,255,0.3)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'border-color 0.12s ease, background 0.12s ease',
          }}
        >
          {isSelectedForMerge && (
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 10, color: '#c4a9ff' }}
              aria-hidden
            >
              check
            </span>
          )}
        </div>
      )}

      {/* Expand chevron for browse/split */}
      {mode !== 'merge' && (
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: 13,
            color: 'var(--ink-30)',
            transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 0.15s ease',
            flexShrink: 0,
          }}
          aria-hidden
        >
          expand_more
        </span>
      )}

      <span
        className="material-symbols-outlined"
        style={{ fontSize: 13, color: '#8c52ff', flexShrink: 0 }}
        aria-hidden
      >
        layers
      </span>

      <span
        style={{
          flex: 1,
          fontSize: '13px',
          fontWeight: 500,
          color: 'var(--on-surface)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}
      >
        {set.title}
      </span>

      <span
        style={{
          fontSize: '11px',
          color: 'var(--ink-30)',
          flexShrink: 0,
        }}
      >
        {cardCount} card{cardCount !== 1 ? 's' : ''}
      </span>
    </div>
  );
}

/* ── Card Row ── */
function CardRow({
  card,
  mode,
  isSelected,
  onToggleSelect,
}: {
  card: FlashcardCard;
  mode: Mode;
  isSelected: boolean;
  onToggleSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={mode === 'split' ? onToggleSelect : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        padding: '6px 8px',
        borderRadius: '6px',
        cursor: mode === 'split' ? 'pointer' : 'default',
        background: isSelected
          ? 'rgba(140,82,255,0.12)'
          : hovered && mode === 'split'
            ? 'var(--ink-04)'
            : 'transparent',
        border: isSelected ? '1px solid rgba(140,82,255,0.3)' : '1px solid transparent',
        transition: 'background 0.12s ease, border-color 0.12s ease',
        marginBottom: '2px',
      }}
    >
      {/* Checkbox for split mode */}
      {mode === 'split' && (
        <div
          style={{
            width: '14px',
            height: '14px',
            borderRadius: '3px',
            border: isSelected ? '2px solid #8c52ff' : '2px solid var(--ink-20)',
            background: isSelected ? 'rgba(140,82,255,0.3)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: '2px',
            transition: 'border-color 0.12s ease, background 0.12s ease',
          }}
        >
          {isSelected && (
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 8, color: '#c4a9ff' }}
              aria-hidden
            >
              check
            </span>
          )}
        </div>
      )}

      {mode !== 'split' && (
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 11, color: 'rgba(140,82,255,0.4)', flexShrink: 0, marginTop: '2px' }}
          aria-hidden
        >
          credit_card
        </span>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '12px',
            color: 'var(--on-surface)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {card.question}
        </div>
        <div
          style={{
            fontSize: '11px',
            color: 'var(--ink-30)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginTop: '1px',
          }}
        >
          {card.answer}
        </div>
      </div>
    </div>
  );
}

/* ── Title Input Dialog (overlay within modal) ── */
function TitleDialog({
  title,
  placeholder,
  value,
  onChange,
  onConfirm,
  onCancel,
  confirmLabel,
  operating,
}: {
  title: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel: string;
  operating: boolean;
}) {
  const canConfirm = value.trim().length > 0 && !operating;

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '16px',
        zIndex: 1,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '340px',
          background: 'var(--background)',
          border: '1px solid rgba(174,137,255,0.45)',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
          fontFamily: 'inherit',
        }}
      >
        <h4
          style={{
            fontSize: '14px',
            fontWeight: 700,
            color: 'var(--on-surface)',
            margin: '0 0 12px',
            fontFamily: 'inherit',
          }}
        >
          {title}
        </h4>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canConfirm) onConfirm();
            if (e.key === 'Escape') onCancel();
          }}
          placeholder={placeholder}
          autoFocus
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: 'rgba(140,82,255,0.08)',
            border: '1px solid rgba(140,82,255,0.2)',
            borderRadius: '8px',
            padding: '10px 12px',
            fontSize: '14px',
            color: 'var(--on-surface)',
            fontFamily: 'inherit',
            outline: 'none',
            marginBottom: '14px',
          }}
        />
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
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
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              border: 'none',
              background: canConfirm ? '#8c52ff' : 'rgba(140,82,255,0.2)',
              color: canConfirm ? 'var(--on-surface)' : 'var(--ink-30)',
              fontSize: '13px',
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              fontWeight: 600,
            }}
          >
            {operating && (
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 14, animation: 'spin 1s linear infinite' }}
                aria-hidden
              >
                progress_activity
              </span>
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
