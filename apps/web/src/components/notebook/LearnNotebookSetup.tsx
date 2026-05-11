'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ImportNotebookDialog from '@/components/notebook/ImportNotebookDialog';

// Phase 8 — single entry point for turning a notebook into a Learn Path.
// File selection is a shared step at the top: the user picks (or unchecks)
// which notes are in scope for the path, and can upload more without
// leaving the modal. The bottom of the modal has two modes for HOW to
// build from that scope:
//
//   1. AI — duration + optional goals. The backend feeds the selected
//      materials (and only those) into the AI prompt.
//   2. Manual — title + dates + a phase composer. The phase picker is
//      drawn exclusively from the selected scope. The last quiz in each
//      phase auto-becomes the checkpoint (gateStrategy='checkpoint');
//      phases without a trailing quiz use 'sequential'.
//
// Both modes route to /learn on success.

type InventoryItem = {
  id: string;
  type: 'page' | 'flashcard_set' | 'quiz_set' | 'document';
  title: string;
  sectionTitle?: string;
};

type Inventory = {
  pages: InventoryItem[];
  flashcardSets: InventoryItem[];
  quizSets: InventoryItem[];
  documents: InventoryItem[];
};

interface PhaseDraft {
  title: string;
  startDate: string;
  endDate: string;
  materials: InventoryItem[];
}

interface LearnNotebookSetupProps {
  notebookId: string;
  notebookName: string;
  onClose: () => void;
}

type TabType = 'ai' | 'manual';

const TYPE_ICON: Record<InventoryItem['type'], string> = {
  page: 'description',
  flashcard_set: 'style',
  quiz_set: 'quiz',
  document: 'article',
};

const TYPE_LABEL: Record<InventoryItem['type'], string> = {
  page: 'Page',
  flashcard_set: 'Flashcards',
  quiz_set: 'Quiz',
  document: 'Document',
};

const TYPE_ORDER: InventoryItem['type'][] = ['page', 'flashcard_set', 'quiz_set', 'document'];

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString().split('T')[0];
}

function isCheckpointPhase(phase: PhaseDraft): boolean {
  const last = phase.materials[phase.materials.length - 1];
  return last?.type === 'quiz_set';
}

function flatInventory(inv: Inventory | null): InventoryItem[] {
  if (!inv) return [];
  return [...inv.pages, ...inv.flashcardSets, ...inv.quizSets, ...inv.documents];
}

export default function LearnNotebookSetup({
  notebookId,
  notebookName,
  onClose,
}: LearnNotebookSetupProps) {
  const router = useRouter();
  const [tab, setTab] = useState<TabType>('ai');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inventory + selection (shared across both tabs).
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showImport, setShowImport] = useState(false);

  // AI fields
  const [aiDuration, setAiDuration] = useState(14);
  const [aiGoals, setAiGoals] = useState('');

  // Manual fields
  const [planTitle, setPlanTitle] = useState(`${notebookName} learn path`);
  const [planDescription, setPlanDescription] = useState('');
  const [planStart, setPlanStart] = useState(todayISO());
  const [planEnd, setPlanEnd] = useState(daysFromNow(14));
  const [phases, setPhases] = useState<PhaseDraft[]>([
    {
      title: 'Phase 1',
      startDate: todayISO(),
      endDate: daysFromNow(6),
      materials: [],
    },
  ]);
  const [openPicker, setOpenPicker] = useState<number | null>(null);

  const loadInventory = useCallback(
    async (preserveSelection: boolean) => {
      setInventoryError(null);
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/inventory`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body = (await res.json()) as { success?: boolean; data?: Inventory };
        if (!body.success || !body.data) {
          setInventoryError('Failed to load notebook contents.');
          return;
        }
        setInventory(body.data);
        const allIds = flatInventory(body.data).map((i) => i.id);
        if (preserveSelection) {
          // Auto-add newly uploaded items: anything not in old inventory is new.
          setSelectedIds((prev) => {
            const next = new Set(prev);
            for (const id of allIds) if (!next.has(id)) next.add(id);
            return next;
          });
        } else {
          // First load: default everything selected so AI mode just works.
          setSelectedIds(new Set(allIds));
        }
      } catch {
        setInventoryError('Failed to load notebook contents.');
      }
    },
    [notebookId],
  );

  useEffect(() => {
    void loadInventory(false);
  }, [loadInventory]);

  const flatItems = useMemo(() => flatInventory(inventory), [inventory]);
  const allSelected = flatItems.length > 0 && flatItems.every((i) => selectedIds.has(i.id));
  const noneSelected = selectedIds.size === 0;
  const selectedCount = flatItems.filter((i) => selectedIds.has(i.id)).length;

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // If the user uncheckes a file currently in a phase, remove it from
    // the phase as well so the manual composition stays consistent with
    // the scope picker.
    setPhases((prev) =>
      prev.map((p) => ({ ...p, materials: p.materials.filter((m) => m.id !== id) })),
    );
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(flatItems.map((i) => i.id)));
  }, [flatItems]);

  const handleClearAll = useCallback(() => {
    setSelectedIds(new Set());
    setPhases((prev) => prev.map((p) => ({ ...p, materials: [] })));
  }, []);

  const handleAddMaterial = useCallback((phaseIdx: number, item: InventoryItem) => {
    setPhases((prev) =>
      prev.map((p, i) => {
        if (i !== phaseIdx) return p;
        if (p.materials.some((m) => m.id === item.id)) return p;
        return { ...p, materials: [...p.materials, item] };
      }),
    );
    setOpenPicker(null);
  }, []);

  const handleRemoveMaterial = useCallback((phaseIdx: number, materialId: string) => {
    setPhases((prev) =>
      prev.map((p, i) =>
        i === phaseIdx ? { ...p, materials: p.materials.filter((m) => m.id !== materialId) } : p,
      ),
    );
  }, []);

  const handleAddPhase = useCallback(() => {
    setPhases((prev) => {
      const last = prev[prev.length - 1];
      const newStart = last
        ? new Date(new Date(last.endDate).getTime() + 86400000).toISOString().split('T')[0]
        : todayISO();
      const newEnd = new Date(new Date(newStart).getTime() + 6 * 86400000)
        .toISOString()
        .split('T')[0];
      return [
        ...prev,
        {
          title: `Phase ${prev.length + 1}`,
          startDate: newStart,
          endDate: newEnd,
          materials: [],
        },
      ];
    });
  }, []);

  const handleRemovePhase = useCallback((idx: number) => {
    setPhases((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }, []);

  const handleUpdatePhase = useCallback(
    (idx: number, patch: Partial<Omit<PhaseDraft, 'materials'>>) => {
      setPhases((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
    },
    [],
  );

  const handleMovePhase = useCallback((idx: number, dir: -1 | 1) => {
    setPhases((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }, []);

  const submitAi = useCallback(async () => {
    if (noneSelected) {
      setError('Pick at least one note for the path.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/study-plans/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          durationDays: aiDuration,
          goals: aiGoals.trim() || undefined,
          // Only send the subset when it's a real subset — sending all IDs
          // is equivalent to sending none (full notebook), and skipping the
          // field keeps the legacy behavior intact for the chat-tool path
          // that doesn't know about scoping.
          materialIds: allSelected ? undefined : Array.from(selectedIds),
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'Failed to generate path.');
        setSubmitting(false);
        return;
      }
      router.push('/learn');
      onClose();
    } catch {
      setError('Failed to generate path.');
      setSubmitting(false);
    }
  }, [notebookId, aiDuration, aiGoals, selectedIds, allSelected, noneSelected, router, onClose]);

  const submitManual = useCallback(async () => {
    if (!planTitle.trim()) {
      setError('Plan title is required.');
      return;
    }
    if (phases.every((p) => p.materials.length === 0)) {
      setError('Add at least one note to a phase before creating the path.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/study-plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: planTitle.trim(),
          description: planDescription.trim() || undefined,
          startDate: new Date(planStart).toISOString(),
          endDate: new Date(planEnd).toISOString(),
          source: 'manual',
          phases: phases.map((p, i) => ({
            title: p.title.trim() || `Phase ${i + 1}`,
            sortOrder: i,
            startDate: new Date(p.startDate).toISOString(),
            endDate: new Date(p.endDate).toISOString(),
            gateStrategy: isCheckpointPhase(p) ? 'checkpoint' : 'sequential',
            materials: p.materials.map((m, j) => ({
              type: m.type,
              referenceId: m.id,
              title: m.title,
              sortOrder: j,
            })),
          })),
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'Failed to create path.');
        setSubmitting(false);
        return;
      }
      router.push('/learn');
      onClose();
    } catch {
      setError('Failed to create path.');
      setSubmitting(false);
    }
  }, [notebookId, planTitle, planDescription, planStart, planEnd, phases, router, onClose]);

  // Manual mode draws its phase picker from the SELECTED set only — this
  // is what the user implicitly asked for: "files inside notebook or
  // upload or both, then build from those".
  const inScopeItems = useMemo(
    () => flatItems.filter((i) => selectedIds.has(i.id)),
    [flatItems, selectedIds],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Build learn path"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        padding: '20px',
      }}
      onClick={submitting ? undefined : onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '760px',
          maxWidth: '95vw',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface-container)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--outline-variant)',
          fontFamily: 'inherit',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--outline-variant)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '17px',
                fontWeight: 700,
                color: 'var(--on-surface)',
                letterSpacing: '-0.01em',
              }}
            >
              Build your learn path
            </span>
            <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)' }}>
              {notebookName}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--on-surface-variant)',
              cursor: submitting ? 'not-allowed' : 'pointer',
              padding: '4px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
              close
            </span>
          </button>
        </div>

        {/* Body — scrollable */}
        <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Shared scope picker */}
          <ScopePicker
            inventory={inventory}
            inventoryError={inventoryError}
            flatItems={flatItems}
            selectedIds={selectedIds}
            allSelected={allSelected}
            selectedCount={selectedCount}
            onToggle={toggleSelected}
            onSelectAll={handleSelectAll}
            onClearAll={handleClearAll}
            onOpenImport={() => setShowImport(true)}
          />

          {/* Tabs */}
          <div
            role="tablist"
            aria-label="Build mode"
            style={{
              display: 'flex',
              gap: '4px',
              padding: '4px',
              background: 'var(--surface-container-low)',
              border: '1px solid var(--outline-variant)',
              borderRadius: 'var(--radius-full)',
              alignSelf: 'flex-start',
            }}
          >
            {([
              ['ai', 'AI auto-build', 'auto_fix_high'],
              ['manual', 'Manual phases', 'tune'],
            ] as const).map(([id, label, icon]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-full)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  background: tab === id ? 'var(--primary)' : 'transparent',
                  color: tab === id ? 'var(--on-primary)' : 'var(--on-surface-variant)',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                  {icon}
                </span>
                {label}
              </button>
            ))}
          </div>

          {tab === 'ai' ? (
            <AiTab
              durationDays={aiDuration}
              onDurationChange={setAiDuration}
              goals={aiGoals}
              onGoalsChange={setAiGoals}
              selectedCount={selectedCount}
              allSelected={allSelected}
            />
          ) : (
            <ManualTab
              planTitle={planTitle}
              onPlanTitleChange={setPlanTitle}
              planDescription={planDescription}
              onPlanDescriptionChange={setPlanDescription}
              planStart={planStart}
              onPlanStartChange={setPlanStart}
              planEnd={planEnd}
              onPlanEndChange={setPlanEnd}
              phases={phases}
              onAddPhase={handleAddPhase}
              onRemovePhase={handleRemovePhase}
              onUpdatePhase={handleUpdatePhase}
              onMovePhase={handleMovePhase}
              onAddMaterial={handleAddMaterial}
              onRemoveMaterial={handleRemoveMaterial}
              inScopeItems={inScopeItems}
              openPicker={openPicker}
              setOpenPicker={setOpenPicker}
            />
          )}
        </div>

        {/* Error */}
        {error ? (
          <div
            role="alert"
            style={{
              padding: '0 20px 8px',
              fontSize: '13px',
              color: 'var(--error)',
            }}
          >
            {error}
          </div>
        ) : null}

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 20px',
            borderTop: '1px solid var(--outline-variant)',
          }}
        >
          <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)' }}>
            {selectedCount} of {flatItems.length} note{flatItems.length === 1 ? '' : 's'} selected
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '9px 16px',
                borderRadius: 'var(--radius-full)',
                border: '1px solid var(--outline-variant)',
                background: 'transparent',
                color: 'var(--on-surface-variant)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                opacity: submitting ? 0.6 : 1,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={tab === 'ai' ? submitAi : submitManual}
              disabled={submitting}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                borderRadius: 'var(--radius-full)',
                border: 'none',
                background: 'var(--primary)',
                color: 'var(--on-primary)',
                fontSize: '13px',
                fontWeight: 700,
                cursor: submitting ? 'wait' : 'pointer',
                fontFamily: 'inherit',
                opacity: submitting ? 0.85 : 1,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: '18px',
                  animation: submitting ? 'learnSetupSpin 0.9s linear infinite' : undefined,
                }}
              >
                {submitting ? 'progress_activity' : tab === 'ai' ? 'auto_fix_high' : 'check'}
              </span>
              {submitting ? 'Working…' : tab === 'ai' ? 'Generate path' : 'Create path'}
            </button>
          </div>
        </div>

        <style>{`
          @keyframes learnSetupSpin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>

      {showImport ? (
        <ImportNotebookDialog
          notebookId={notebookId}
          onImported={() => {
            setShowImport(false);
            void loadInventory(true);
          }}
          onClose={() => setShowImport(false)}
        />
      ) : null}
    </div>
  );
}

function ScopePicker({
  inventory,
  inventoryError,
  flatItems,
  selectedIds,
  allSelected,
  selectedCount,
  onToggle,
  onSelectAll,
  onClearAll,
  onOpenImport,
}: {
  inventory: Inventory | null;
  inventoryError: string | null;
  flatItems: InventoryItem[];
  selectedIds: Set<string>;
  allSelected: boolean;
  selectedCount: number;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onOpenImport: () => void;
}) {
  const grouped = useMemo(() => {
    if (!inventory) return null;
    return {
      page: inventory.pages,
      flashcard_set: inventory.flashcardSets,
      quiz_set: inventory.quizSets,
      document: inventory.documents,
    };
  }, [inventory]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '14px',
        background: 'var(--surface-container-low)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span
            style={{
              fontSize: '11px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--on-surface-variant)',
              fontWeight: 700,
            }}
          >
            Notes for this path
          </span>
          <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)' }}>
            {flatItems.length === 0
              ? 'No notes yet — upload some to get started.'
              : allSelected
                ? 'Using every note in this notebook.'
                : selectedCount === 0
                  ? 'Nothing selected — pick at least one note or upload more.'
                  : `Path will use ${selectedCount} of ${flatItems.length} notes.`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button type="button" onClick={onOpenImport} style={chipButtonStyle}>
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
              upload
            </span>
            Upload notes
          </button>
          {flatItems.length > 0 ? (
            allSelected ? (
              <button type="button" onClick={onClearAll} style={chipButtonStyle}>
                Clear all
              </button>
            ) : (
              <button type="button" onClick={onSelectAll} style={chipButtonStyle}>
                Select all
              </button>
            )
          ) : null}
        </div>
      </div>

      {inventoryError ? (
        <div
          role="alert"
          style={{
            padding: '10px 12px',
            background: 'var(--surface-container)',
            border: '1px solid var(--error)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--error)',
            fontSize: '12px',
          }}
        >
          {inventoryError}
        </div>
      ) : null}

      {grouped && flatItems.length > 0 ? (
        <div
          style={{
            maxHeight: '220px',
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            paddingRight: '4px',
          }}
        >
          {TYPE_ORDER.flatMap((type) => {
            const items = grouped[type];
            if (items.length === 0) return [];
            return [
              <div
                key={`h-${type}`}
                style={{
                  fontSize: '10px',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--on-surface-variant)',
                  fontWeight: 700,
                  padding: '4px 0 2px',
                }}
              >
                {TYPE_LABEL[type]}s
              </div>,
              ...items.map((item) => {
                const isOn = selectedIds.has(item.id);
                return (
                  <label
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 8px',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      background: isOn ? 'rgba(174,137,255,0.10)' : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isOn}
                      onChange={() => onToggle(item.id)}
                      style={{ accentColor: 'var(--primary)' }}
                    />
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: '15px', color: 'var(--on-surface-variant)' }}
                    >
                      {TYPE_ICON[type]}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        fontSize: '13px',
                        color: 'var(--on-surface)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.title}
                      {item.sectionTitle ? (
                        <span style={{ color: 'var(--on-surface-variant)' }}>
                          {' '}
                          · {item.sectionTitle}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              }),
            ];
          })}
        </div>
      ) : null}
    </div>
  );
}

function AiTab({
  durationDays,
  onDurationChange,
  goals,
  onGoalsChange,
  selectedCount,
  allSelected,
}: {
  durationDays: number;
  onDurationChange: (n: number) => void;
  goals: string;
  onGoalsChange: (g: string) => void;
  selectedCount: number;
  allSelected: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <p
        style={{
          margin: 0,
          fontSize: '13px',
          color: 'var(--on-surface-variant)',
          lineHeight: 1.5,
        }}
      >
        NoteMage will build a Duolingo-style path from{' '}
        <strong style={{ color: 'var(--on-surface)' }}>
          {allSelected
            ? 'every note in this notebook'
            : selectedCount === 0
              ? '— pick at least one note above'
              : `the ${selectedCount} note${selectedCount === 1 ? '' : 's'} you selected`}
        </strong>
        , with phased lessons and checkpoint quizzes.
      </p>
      <Field label="Plan duration (days)">
        <input
          type="number"
          value={durationDays}
          onChange={(e) => onDurationChange(Math.max(1, parseInt(e.target.value) || 1))}
          min={1}
          style={inputStyle}
        />
      </Field>
      <Field label="Study goals (optional)">
        <textarea
          value={goals}
          onChange={(e) => onGoalsChange(e.target.value)}
          placeholder="e.g. Focus on chapters 1–5 for the midterm. Weak on cellular respiration."
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </Field>
    </div>
  );
}

function ManualTab({
  planTitle,
  onPlanTitleChange,
  planDescription,
  onPlanDescriptionChange,
  planStart,
  onPlanStartChange,
  planEnd,
  onPlanEndChange,
  phases,
  onAddPhase,
  onRemovePhase,
  onUpdatePhase,
  onMovePhase,
  onAddMaterial,
  onRemoveMaterial,
  inScopeItems,
  openPicker,
  setOpenPicker,
}: {
  planTitle: string;
  onPlanTitleChange: (s: string) => void;
  planDescription: string;
  onPlanDescriptionChange: (s: string) => void;
  planStart: string;
  onPlanStartChange: (s: string) => void;
  planEnd: string;
  onPlanEndChange: (s: string) => void;
  phases: PhaseDraft[];
  onAddPhase: () => void;
  onRemovePhase: (idx: number) => void;
  onUpdatePhase: (idx: number, patch: Partial<Omit<PhaseDraft, 'materials'>>) => void;
  onMovePhase: (idx: number, dir: -1 | 1) => void;
  onAddMaterial: (phaseIdx: number, item: InventoryItem) => void;
  onRemoveMaterial: (phaseIdx: number, materialId: string) => void;
  inScopeItems: InventoryItem[];
  openPicker: number | null;
  setOpenPicker: (idx: number | null) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <Field label="Plan title">
        <input
          value={planTitle}
          onChange={(e) => onPlanTitleChange(e.target.value)}
          style={inputStyle}
        />
      </Field>
      <Field label="Description (optional)">
        <textarea
          value={planDescription}
          onChange={(e) => onPlanDescriptionChange(e.target.value)}
          rows={2}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </Field>
      <div style={{ display: 'flex', gap: '10px' }}>
        <div style={{ flex: 1 }}>
          <Field label="Start">
            <input
              type="date"
              value={planStart}
              onChange={(e) => onPlanStartChange(e.target.value)}
              style={inputStyle}
            />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="End">
            <input
              type="date"
              value={planEnd}
              onChange={(e) => onPlanEndChange(e.target.value)}
              style={inputStyle}
            />
          </Field>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {phases.map((phase, idx) => (
          <PhaseCard
            key={idx}
            phase={phase}
            phaseIdx={idx}
            canRemove={phases.length > 1}
            canMoveUp={idx > 0}
            canMoveDown={idx < phases.length - 1}
            inScopeItems={inScopeItems}
            pickerOpen={openPicker === idx}
            onOpenPicker={() => setOpenPicker(openPicker === idx ? null : idx)}
            onClosePicker={() => setOpenPicker(null)}
            onAddMaterial={(item) => onAddMaterial(idx, item)}
            onRemoveMaterial={(matId) => onRemoveMaterial(idx, matId)}
            onUpdate={(patch) => onUpdatePhase(idx, patch)}
            onRemove={() => onRemovePhase(idx)}
            onMove={(dir) => onMovePhase(idx, dir)}
          />
        ))}

        <button
          type="button"
          onClick={onAddPhase}
          style={{
            padding: '10px',
            borderRadius: 'var(--radius-md)',
            border: '1px dashed var(--outline-variant)',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--on-surface-variant)',
            fontSize: '13px',
            fontFamily: 'inherit',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
            add
          </span>
          Add phase
        </button>
      </div>
    </div>
  );
}

function PhaseCard({
  phase,
  phaseIdx,
  canRemove,
  canMoveUp,
  canMoveDown,
  inScopeItems,
  pickerOpen,
  onOpenPicker,
  onClosePicker,
  onAddMaterial,
  onRemoveMaterial,
  onUpdate,
  onRemove,
  onMove,
}: {
  phase: PhaseDraft;
  phaseIdx: number;
  canRemove: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  inScopeItems: InventoryItem[];
  pickerOpen: boolean;
  onOpenPicker: () => void;
  onClosePicker: () => void;
  onAddMaterial: (item: InventoryItem) => void;
  onRemoveMaterial: (materialId: string) => void;
  onUpdate: (patch: Partial<Omit<PhaseDraft, 'materials'>>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const checkpoint = isCheckpointPhase(phase);
  const usedIds = useMemo(() => new Set(phase.materials.map((m) => m.id)), [phase.materials]);
  const availableByType: Record<InventoryItem['type'], InventoryItem[]> = useMemo(() => {
    const result: Record<InventoryItem['type'], InventoryItem[]> = {
      page: [],
      flashcard_set: [],
      quiz_set: [],
      document: [],
    };
    for (const item of inScopeItems) {
      if (usedIds.has(item.id)) continue;
      result[item.type].push(item);
    }
    return result;
  }, [inScopeItems, usedIds]);

  return (
    <div
      style={{
        padding: '14px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface-container-low)',
        border: '1px solid var(--outline-variant)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
        <input
          value={phase.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          aria-label={`Phase ${phaseIdx + 1} title`}
          style={{ ...inputStyle, flex: 1, fontWeight: 600 }}
        />
        <div style={{ display: 'flex', gap: '4px' }}>
          <IconButton
            label="Move up"
            icon="arrow_upward"
            disabled={!canMoveUp}
            onClick={() => onMove(-1)}
          />
          <IconButton
            label="Move down"
            icon="arrow_downward"
            disabled={!canMoveDown}
            onClick={() => onMove(1)}
          />
          <IconButton
            label="Remove phase"
            icon="delete"
            disabled={!canRemove}
            onClick={onRemove}
            danger
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1 }}>
          <Field label="Start" small>
            <input
              type="date"
              value={phase.startDate}
              onChange={(e) => onUpdate({ startDate: e.target.value })}
              style={inputStyle}
            />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="End" small>
            <input
              type="date"
              value={phase.endDate}
              onChange={(e) => onUpdate({ endDate: e.target.value })}
              style={inputStyle}
            />
          </Field>
        </div>
      </div>

      {/* Materials */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '6px',
          }}
        >
          <span
            style={{
              fontSize: '11px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--on-surface-variant)',
              fontWeight: 700,
            }}
          >
            Materials
          </span>
          {checkpoint ? (
            <span
              style={{
                fontSize: '11px',
                color: 'var(--primary)',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="The last quiz in this phase gates the next phase"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                flag
              </span>
              Checkpoint at end
            </span>
          ) : null}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          {phase.materials.map((m, mIdx) => {
            const isLastQuiz = checkpoint && mIdx === phase.materials.length - 1;
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  background: isLastQuiz
                    ? 'rgba(174,137,255,0.12)'
                    : 'var(--surface-container)',
                  border: `1px solid ${
                    isLastQuiz ? 'rgba(174,137,255,0.40)' : 'var(--outline-variant)'
                  }`,
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '13px',
                  color: 'var(--on-surface)',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '16px', color: 'var(--on-surface-variant)' }}
                >
                  {TYPE_ICON[m.type]}
                </span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.title}
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    color: 'var(--on-surface-variant)',
                    fontWeight: 600,
                  }}
                >
                  {TYPE_LABEL[m.type]}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveMaterial(m.id)}
                  aria-label={`Remove ${m.title}`}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--on-surface-variant)',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                    close
                  </span>
                </button>
              </div>
            );
          })}

          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={onOpenPicker}
              disabled={inScopeItems.length === 0}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px dashed var(--outline-variant)',
                background: 'transparent',
                color: 'var(--on-surface-variant)',
                cursor: inScopeItems.length === 0 ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                fontFamily: 'inherit',
                opacity: inScopeItems.length === 0 ? 0.5 : 1,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
                add
              </span>
              {inScopeItems.length === 0 ? 'Pick notes above first' : 'Add material'}
            </button>
            {pickerOpen ? (
              <MaterialPicker
                grouped={availableByType}
                onPick={(item) => onAddMaterial(item)}
                onClose={onClosePicker}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function MaterialPicker({
  grouped,
  onPick,
  onClose,
}: {
  grouped: Record<InventoryItem['type'], InventoryItem[]>;
  onPick: (item: InventoryItem) => void;
  onClose: () => void;
}) {
  const total =
    grouped.page.length +
    grouped.flashcard_set.length +
    grouped.quiz_set.length +
    grouped.document.length;
  return (
    <div
      role="menu"
      style={{
        position: 'absolute',
        top: 'calc(100% + 4px)',
        left: 0,
        right: 0,
        zIndex: 10,
        maxHeight: '260px',
        overflow: 'auto',
        background: 'var(--surface-container-high)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
        padding: '6px',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
      }}
    >
      {total === 0 ? (
        <div
          style={{
            padding: '14px',
            textAlign: 'center',
            fontSize: '12px',
            color: 'var(--on-surface-variant)',
          }}
        >
          Every selected note is already in this phase.
        </div>
      ) : (
        (['quiz_set', 'flashcard_set', 'page', 'document'] as const).flatMap((type) => {
          const items = grouped[type];
          if (items.length === 0) return [];
          return [
            <div
              key={`h-${type}`}
              style={{
                fontSize: '10px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--on-surface-variant)',
                padding: '6px 8px 2px',
                fontWeight: 700,
              }}
            >
              {TYPE_LABEL[type]}s
            </div>,
            ...items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onPick(item);
                  onClose();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--on-surface)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  borderRadius: 'var(--radius-sm)',
                  width: '100%',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-container)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '15px', color: 'var(--on-surface-variant)' }}
                >
                  {TYPE_ICON[type]}
                </span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.title}
                </span>
              </button>
            )),
          ];
        })
      )}
    </div>
  );
}

function Field({
  label,
  small = false,
  children,
}: {
  label: string;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span
        style={{
          fontSize: small ? '10px' : '11px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--on-surface-variant)',
          fontWeight: 700,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function IconButton({
  label,
  icon,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{
        width: '28px',
        height: '28px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--outline-variant)',
        background: 'transparent',
        color: danger ? 'var(--error)' : 'var(--on-surface-variant)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
        {icon}
      </span>
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  fontSize: '13px',
  color: 'var(--on-surface)',
  background: 'var(--surface-container-high)',
  border: '1px solid var(--outline-variant)',
  borderRadius: 'var(--radius-sm)',
  padding: '8px 10px',
  outline: 'none',
  fontFamily: 'inherit',
  colorScheme: 'dark',
};

const chipButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 12px',
  borderRadius: 'var(--radius-full)',
  border: '1px solid var(--outline-variant)',
  background: 'transparent',
  color: 'var(--on-surface)',
  fontSize: '12px',
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
};
