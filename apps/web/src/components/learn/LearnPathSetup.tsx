'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import ImportNotebookDialog from '@/components/notebook/ImportNotebookDialog';
import { getMageName } from '@/lib/scholar';

// Phase 9.4 — unified setup for building Learn Paths. Two operating modes:
//
//   • `defaultNotebookId` present → back-compat per-notebook mode. Inventory
//     is loaded from /api/notebooks/[id]/inventory; AI hits
//     /api/notebooks/[id]/study-plans/generate; manual hits
//     /api/notebooks/[id]/study-plans. Same flow as the old Phase 8 modal.
//
//   • `defaultNotebookId` absent → cross-notebook mode. Inventory comes from
//     /api/learn/inventory (every user-owned notebook), grouped under a
//     collapsible notebook header in the picker. Manual submit hits
//     /api/learn/paths with the (validated) referenceIds — server derives
//     the source notebooks. AI mode requires the user to pin a single
//     notebook scope; cross-notebook AI generation is deferred.
//
// Both modes route to /learn/paths on success.

type MaterialType = 'page' | 'flashcard_set' | 'quiz_set' | 'document';

type InventoryItem = {
  id: string;
  type: MaterialType;
  title: string;
  sectionTitle?: string;
  // Cross-notebook mode only — null in per-notebook mode (the parent
  // notebook is implicit there).
  notebookId: string | null;
  notebookName: string | null;
  notebookColor: string | null;
  notebookKind: string | null;
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

interface LearnPathSetupProps {
  defaultNotebookId?: string;
  defaultNotebookName?: string;
  onClose: () => void;
}

type TabType = 'ai' | 'manual';

const TYPE_ICON: Record<MaterialType, string> = {
  page: 'description',
  flashcard_set: 'style',
  quiz_set: 'quiz',
  document: 'article',
};

const TYPE_LABEL: Record<MaterialType, string> = {
  page: 'Page',
  flashcard_set: 'Flashcards',
  quiz_set: 'Quiz',
  document: 'Document',
};

const TYPE_ORDER: MaterialType[] = ['page', 'flashcard_set', 'quiz_set', 'document'];

const CROSS_NOTEBOOK_BUCKET_ID = '__cross-notebook__';

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

export default function LearnPathSetup({
  defaultNotebookId,
  defaultNotebookName,
  onClose,
}: LearnPathSetupProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const mageName = getMageName(session?.user?.scholarName);
  const isCrossNotebookMode = !defaultNotebookId;

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
  // Cross-notebook AI mode requires the user to nominate a single notebook
  // scope. The selected items get filtered down to that notebook before
  // posting; without exactly one notebook represented the AI submit blocks.
  const [aiNotebookId, setAiNotebookId] = useState<string | null>(null);

  // Manual fields
  const defaultTitle = defaultNotebookName
    ? `${defaultNotebookName} learn path`
    : 'New learn path';
  const [planTitle, setPlanTitle] = useState(defaultTitle);
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
        const endpoint = defaultNotebookId
          ? `/api/notebooks/${defaultNotebookId}/inventory`
          : '/api/learn/inventory';
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body = (await res.json()) as { success?: boolean; data?: Inventory };
        if (!body.success || !body.data) {
          setInventoryError('Failed to load notebook contents.');
          return;
        }
        // Per-notebook responses omit `notebookId` etc. on each item — fill
        // them in so the shared rendering path can rely on the field.
        const normalize = (item: InventoryItem) => ({
          ...item,
          notebookId: item.notebookId ?? defaultNotebookId ?? null,
          notebookName: item.notebookName ?? defaultNotebookName ?? null,
          notebookColor: item.notebookColor ?? null,
          notebookKind: item.notebookKind ?? null,
        });
        const normalized: Inventory = {
          pages: body.data.pages.map(normalize),
          flashcardSets: body.data.flashcardSets.map(normalize),
          quizSets: body.data.quizSets.map(normalize),
          documents: body.data.documents.map(normalize),
        };
        setInventory(normalized);
        const allIds = flatInventory(normalized).map((i) => i.id);
        if (preserveSelection) {
          // Auto-add newly uploaded items: anything not in old inventory is new.
          setSelectedIds((prev) => {
            const next = new Set(prev);
            for (const id of allIds) if (!next.has(id)) next.add(id);
            return next;
          });
        } else if (isCrossNotebookMode) {
          // Don't pre-select everything across every notebook — the user
          // should explicitly pick what they want in scope.
          setSelectedIds(new Set());
        } else {
          // First load (per-notebook): default everything selected so AI
          // mode just works.
          setSelectedIds(new Set(allIds));
        }
      } catch {
        setInventoryError('Failed to load notebook contents.');
      }
    },
    [defaultNotebookId, defaultNotebookName, isCrossNotebookMode],
  );

  useEffect(() => {
    void loadInventory(false);
  }, [loadInventory]);

  const flatItems = useMemo(() => flatInventory(inventory), [inventory]);
  const allSelected = flatItems.length > 0 && flatItems.every((i) => selectedIds.has(i.id));
  const noneSelected = selectedIds.size === 0;
  const selectedCount = flatItems.filter((i) => selectedIds.has(i.id)).length;

  // Set of notebook ids represented in the current selection (cross-nb only).
  const selectedNotebookIds = useMemo(() => {
    const set = new Set<string>();
    for (const item of flatItems) {
      if (!selectedIds.has(item.id)) continue;
      if (item.notebookId) set.add(item.notebookId);
    }
    return set;
  }, [flatItems, selectedIds]);

  // Default the AI-scope dropdown to the only selected notebook when there
  // is exactly one. Otherwise leave it null so the user has to pick.
  useEffect(() => {
    if (!isCrossNotebookMode) return;
    if (selectedNotebookIds.size === 1) {
      const only = Array.from(selectedNotebookIds)[0];
      setAiNotebookId((prev) => prev ?? only);
    }
  }, [isCrossNotebookMode, selectedNotebookIds]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // If the user unchecks a file currently in a phase, remove it from
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

  const handleSelectAllInNotebook = useCallback(
    (notebookId: string | null) => {
      const wantedIds = flatItems
        .filter((i) => (i.notebookId ?? CROSS_NOTEBOOK_BUCKET_ID) === (notebookId ?? CROSS_NOTEBOOK_BUCKET_ID))
        .map((i) => i.id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of wantedIds) next.add(id);
        return next;
      });
    },
    [flatItems],
  );

  const handleClearAllInNotebook = useCallback(
    (notebookId: string | null) => {
      const wantedIds = new Set(
        flatItems
          .filter(
            (i) =>
              (i.notebookId ?? CROSS_NOTEBOOK_BUCKET_ID) ===
              (notebookId ?? CROSS_NOTEBOOK_BUCKET_ID),
          )
          .map((i) => i.id),
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of wantedIds) next.delete(id);
        return next;
      });
      setPhases((prev) =>
        prev.map((p) => ({
          ...p,
          materials: p.materials.filter((m) => !wantedIds.has(m.id)),
        })),
      );
    },
    [flatItems],
  );

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

    // Resolve the notebook to scope the AI request to. In per-notebook
    // mode this is the defaultNotebookId. In cross-notebook mode we use
    // the dropdown, which must equal a notebook with selected items.
    const targetNotebookId = defaultNotebookId ?? aiNotebookId;
    if (!targetNotebookId) {
      setError(
        'Pick a single notebook for AI mode, or switch to Manual to combine notebooks.',
      );
      return;
    }

    const selectedItems = flatItems.filter((i) => selectedIds.has(i.id));
    const scopedItems = isCrossNotebookMode
      ? selectedItems.filter((i) => i.notebookId === targetNotebookId)
      : selectedItems;
    if (scopedItems.length === 0) {
      setError('No selected notes belong to that notebook.');
      return;
    }
    // Detect "AI scope spans multiple notebooks" so we can show a helpful
    // message rather than silently dropping items.
    if (
      isCrossNotebookMode &&
      selectedItems.some((i) => i.notebookId && i.notebookId !== targetNotebookId)
    ) {
      setError(
        'AI mode works with one notebook at a time. Pick a notebook above, deselect the others, or switch to Manual.',
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      // Mirror the legacy behavior: when the user selected everything in
      // the target notebook, send no `materialIds` to keep the chat-tool
      // path's "full notebook" semantics intact.
      const notebookFlatIds = isCrossNotebookMode
        ? flatItems.filter((i) => i.notebookId === targetNotebookId).map((i) => i.id)
        : flatItems.map((i) => i.id);
      const allInScopeSelected =
        notebookFlatIds.length > 0 &&
        notebookFlatIds.every((id) => selectedIds.has(id));

      const res = await fetch(
        `/api/notebooks/${targetNotebookId}/study-plans/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            durationDays: aiDuration,
            goals: aiGoals.trim() || undefined,
            materialIds: allInScopeSelected ? undefined : scopedItems.map((i) => i.id),
          }),
        },
      );
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'Failed to generate path.');
        setSubmitting(false);
        return;
      }
      router.push('/learn/paths');
      onClose();
    } catch {
      setError('Failed to generate path.');
      setSubmitting(false);
    }
  }, [
    defaultNotebookId,
    aiNotebookId,
    aiDuration,
    aiGoals,
    selectedIds,
    flatItems,
    noneSelected,
    router,
    onClose,
    isCrossNotebookMode,
  ]);

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
      let res: Response;
      if (defaultNotebookId) {
        // Per-notebook submit — legacy endpoint, validates against this nb.
        res = await fetch(`/api/notebooks/${defaultNotebookId}/study-plans`, {
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
      } else {
        // Cross-notebook submit — /api/learn/paths derives context notebooks
        // from the material references after ownership validation.
        const contextSet = new Set<string>();
        for (const p of phases) {
          for (const m of p.materials) {
            if (m.notebookId) contextSet.add(m.notebookId);
          }
        }
        res = await fetch('/api/learn/paths', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: planTitle.trim(),
            description: planDescription.trim() || undefined,
            startDate: new Date(planStart).toISOString(),
            endDate: new Date(planEnd).toISOString(),
            source: 'manual',
            primaryNotebookId: contextSet.size === 1 ? Array.from(contextSet)[0] : null,
            contextNotebookIds: Array.from(contextSet),
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
      }
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'Failed to create path.');
        setSubmitting(false);
        return;
      }
      router.push('/learn/paths');
      onClose();
    } catch {
      setError('Failed to create path.');
      setSubmitting(false);
    }
  }, [
    defaultNotebookId,
    planTitle,
    planDescription,
    planStart,
    planEnd,
    phases,
    router,
    onClose,
  ]);

  // Manual mode draws its phase picker from the SELECTED set only — this
  // is what the user implicitly asked for: "files inside notebook or
  // upload or both, then build from those".
  const inScopeItems = useMemo(
    () => flatItems.filter((i) => selectedIds.has(i.id)),
    [flatItems, selectedIds],
  );

  // Cross-notebook AI mode: list of notebooks the user has selected items
  // from. The dropdown is populated from this so the user can't pick a
  // notebook with no selected content.
  const aiNotebookOptions = useMemo(() => {
    if (!isCrossNotebookMode) return [];
    const map = new Map<string, { id: string; name: string; color: string | null; kind: string | null }>();
    for (const item of flatItems) {
      if (!selectedIds.has(item.id)) continue;
      if (!item.notebookId) continue;
      if (map.has(item.notebookId)) continue;
      map.set(item.notebookId, {
        id: item.notebookId,
        name: item.notebookName ?? 'Untitled notebook',
        color: item.notebookColor,
        kind: item.notebookKind,
      });
    }
    return Array.from(map.values());
  }, [isCrossNotebookMode, flatItems, selectedIds]);

  const subtitle = isCrossNotebookMode
    ? 'Pull from any of your notebooks'
    : defaultNotebookName ?? 'this notebook';

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
              {subtitle}
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
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
          }}
        >
          {/* Shared scope picker */}
          <ScopePicker
            inventory={inventory}
            inventoryError={inventoryError}
            flatItems={flatItems}
            selectedIds={selectedIds}
            allSelected={allSelected}
            selectedCount={selectedCount}
            isCrossNotebookMode={isCrossNotebookMode}
            onToggle={toggleSelected}
            onSelectAll={handleSelectAll}
            onClearAll={handleClearAll}
            onSelectAllInNotebook={handleSelectAllInNotebook}
            onClearAllInNotebook={handleClearAllInNotebook}
            onOpenImport={() => setShowImport(true)}
            canImport={Boolean(defaultNotebookId)}
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
              ['ai', mageName, 'auto_fix_high'],
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
              mageName={mageName}
              isCrossNotebookMode={isCrossNotebookMode}
              aiNotebookOptions={aiNotebookOptions}
              aiNotebookId={aiNotebookId}
              onAiNotebookIdChange={setAiNotebookId}
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
              isCrossNotebookMode={isCrossNotebookMode}
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
            {selectedCount} of {flatItems.length} note
            {flatItems.length === 1 ? '' : 's'} selected
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

      {showImport && defaultNotebookId ? (
        <ImportNotebookDialog
          notebookId={defaultNotebookId}
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

type NotebookGroup = {
  id: string | null;
  name: string;
  color: string | null;
  kind: string | null;
  items: InventoryItem[];
  selectedCount: number;
};

function groupItemsByNotebook(
  items: InventoryItem[],
  selectedIds: Set<string>,
): NotebookGroup[] {
  const map = new Map<string, NotebookGroup>();
  const order: string[] = []; // preserve first-seen order, which mirrors the
  // server-side inbox-first / updatedAt-desc ordering.
  for (const item of items) {
    const key = item.notebookId ?? CROSS_NOTEBOOK_BUCKET_ID;
    let group = map.get(key);
    if (!group) {
      group = {
        id: item.notebookId,
        name: item.notebookName ?? 'Untitled notebook',
        color: item.notebookColor,
        kind: item.notebookKind,
        items: [],
        selectedCount: 0,
      };
      map.set(key, group);
      order.push(key);
    }
    group.items.push(item);
    if (selectedIds.has(item.id)) group.selectedCount += 1;
  }
  return order.map((k) => map.get(k)!);
}

function ScopePicker({
  inventory,
  inventoryError,
  flatItems,
  selectedIds,
  allSelected,
  selectedCount,
  isCrossNotebookMode,
  onToggle,
  onSelectAll,
  onClearAll,
  onSelectAllInNotebook,
  onClearAllInNotebook,
  onOpenImport,
  canImport,
}: {
  inventory: Inventory | null;
  inventoryError: string | null;
  flatItems: InventoryItem[];
  selectedIds: Set<string>;
  allSelected: boolean;
  selectedCount: number;
  isCrossNotebookMode: boolean;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onSelectAllInNotebook: (notebookId: string | null) => void;
  onClearAllInNotebook: (notebookId: string | null) => void;
  onOpenImport: () => void;
  canImport: boolean;
}) {
  const groupedByNotebook = useMemo(
    () => groupItemsByNotebook(flatItems, selectedIds),
    [flatItems, selectedIds],
  );

  const groupedByType = useMemo(() => {
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
              ? isCrossNotebookMode
                ? 'No notes available — open a notebook and add content to get started.'
                : 'No notes yet — upload some to get started.'
              : allSelected
                ? isCrossNotebookMode
                  ? 'Using every note in every notebook.'
                  : 'Using every note in this notebook.'
                : selectedCount === 0
                  ? isCrossNotebookMode
                    ? 'Nothing selected — pick at least one note from any notebook.'
                    : 'Nothing selected — pick at least one note or upload more.'
                  : `Path will use ${selectedCount} of ${flatItems.length} notes.`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {canImport ? (
            <button type="button" onClick={onOpenImport} style={chipButtonStyle}>
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
                upload
              </span>
              Upload notes
            </button>
          ) : null}
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

      {flatItems.length > 0 ? (
        <div
          style={{
            maxHeight: '260px',
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            paddingRight: '4px',
          }}
        >
          {isCrossNotebookMode
            ? groupedByNotebook.map((group) => (
                <NotebookGroupBlock
                  key={group.id ?? CROSS_NOTEBOOK_BUCKET_ID}
                  group={group}
                  selectedIds={selectedIds}
                  onToggle={onToggle}
                  onSelectAllInNotebook={onSelectAllInNotebook}
                  onClearAllInNotebook={onClearAllInNotebook}
                />
              ))
            : groupedByType
              ? TYPE_ORDER.flatMap((type) => {
                  const items = groupedByType[type];
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
                    ...items.map((item) => (
                      <InventoryRow
                        key={item.id}
                        item={item}
                        isSelected={selectedIds.has(item.id)}
                        onToggle={() => onToggle(item.id)}
                        showSection
                      />
                    )),
                  ];
                })
              : null}
        </div>
      ) : null}
    </div>
  );
}

function NotebookGroupBlock({
  group,
  selectedIds,
  onToggle,
  onSelectAllInNotebook,
  onClearAllInNotebook,
}: {
  group: NotebookGroup;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAllInNotebook: (notebookId: string | null) => void;
  onClearAllInNotebook: (notebookId: string | null) => void;
}) {
  const [open, setOpen] = useState(true);
  const isInbox = group.kind === 'inbox';
  const groupSelectedAll = group.selectedCount === group.items.length;
  const groupedItems = useMemo(() => {
    const out: Record<MaterialType, InventoryItem[]> = {
      page: [],
      flashcard_set: [],
      quiz_set: [],
      document: [],
    };
    for (const item of group.items) out[item.type].push(item);
    return out;
  }, [group.items]);

  return (
    <div
      style={{
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-sm)',
        padding: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Collapse notebook' : 'Expand notebook'}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--on-surface-variant)',
            cursor: 'pointer',
            padding: '2px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
            {open ? 'expand_more' : 'chevron_right'}
          </span>
        </button>
        {isInbox ? (
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '16px', color: 'var(--on-surface-variant)' }}
            aria-hidden
          >
            mail
          </span>
        ) : (
          <span
            aria-hidden
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: group.color ?? 'var(--outline-variant)',
              flexShrink: 0,
            }}
          />
        )}
        <span
          style={{
            flex: 1,
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--on-surface)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {group.name}
        </span>
        <span
          style={{
            fontSize: '11px',
            color: 'var(--on-surface-variant)',
            fontWeight: 600,
          }}
        >
          {group.selectedCount} / {group.items.length}
        </span>
        <button
          type="button"
          onClick={() =>
            groupSelectedAll
              ? onClearAllInNotebook(group.id)
              : onSelectAllInNotebook(group.id)
          }
          style={{
            background: 'transparent',
            border: '1px solid var(--outline-variant)',
            color: 'var(--on-surface-variant)',
            cursor: 'pointer',
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
            fontSize: '11px',
            fontWeight: 600,
            fontFamily: 'inherit',
          }}
        >
          {groupSelectedAll ? 'Clear' : 'All'}
        </button>
      </div>

      {open ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {TYPE_ORDER.flatMap((type) => {
            const items = groupedItems[type];
            if (items.length === 0) return [];
            return [
              <div
                key={`h-${group.id}-${type}`}
                style={{
                  fontSize: '10px',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--on-surface-variant)',
                  fontWeight: 700,
                  padding: '4px 6px 0',
                }}
              >
                {TYPE_LABEL[type]}s
              </div>,
              ...items.map((item) => (
                <InventoryRow
                  key={item.id}
                  item={item}
                  isSelected={selectedIds.has(item.id)}
                  onToggle={() => onToggle(item.id)}
                  showSection
                />
              )),
            ];
          })}
        </div>
      ) : null}
    </div>
  );
}

function InventoryRow({
  item,
  isSelected,
  onToggle,
  showSection,
}: {
  item: InventoryItem;
  isSelected: boolean;
  onToggle: () => void;
  showSection?: boolean;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 8px',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        background: isSelected ? 'rgba(174,137,255,0.10)' : 'transparent',
      }}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        style={{ accentColor: 'var(--primary)' }}
      />
      <span
        className="material-symbols-outlined"
        style={{ fontSize: '15px', color: 'var(--on-surface-variant)' }}
      >
        {TYPE_ICON[item.type]}
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
        {showSection && item.sectionTitle ? (
          <span style={{ color: 'var(--on-surface-variant)' }}>
            {' '}
            · {item.sectionTitle}
          </span>
        ) : null}
      </span>
    </label>
  );
}

function AiTab({
  durationDays,
  onDurationChange,
  goals,
  onGoalsChange,
  selectedCount,
  allSelected,
  mageName,
  isCrossNotebookMode,
  aiNotebookOptions,
  aiNotebookId,
  onAiNotebookIdChange,
}: {
  durationDays: number;
  onDurationChange: (n: number) => void;
  goals: string;
  onGoalsChange: (g: string) => void;
  selectedCount: number;
  allSelected: boolean;
  mageName: string;
  isCrossNotebookMode: boolean;
  aiNotebookOptions: Array<{
    id: string;
    name: string;
    color: string | null;
    kind: string | null;
  }>;
  aiNotebookId: string | null;
  onAiNotebookIdChange: (id: string | null) => void;
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
        {mageName} will build a Duolingo-style path from{' '}
        <strong style={{ color: 'var(--on-surface)' }}>
          {allSelected
            ? isCrossNotebookMode
              ? 'every note in every notebook'
              : 'every note in this notebook'
            : selectedCount === 0
              ? '— pick at least one note above'
              : `the ${selectedCount} note${selectedCount === 1 ? '' : 's'} you selected`}
        </strong>
        , with phased lessons and checkpoint quizzes.
      </p>

      {isCrossNotebookMode ? (
        <Field label="Generate AI plan for notebook">
          {aiNotebookOptions.length === 0 ? (
            <p
              style={{
                margin: 0,
                fontSize: '12px',
                color: 'var(--on-surface-variant)',
                fontStyle: 'italic',
              }}
            >
              Select notes from at least one notebook to enable AI mode.
            </p>
          ) : (
            <>
              <select
                value={aiNotebookId ?? ''}
                onChange={(e) => onAiNotebookIdChange(e.target.value || null)}
                style={inputStyle}
              >
                <option value="">Pick a notebook…</option>
                {aiNotebookOptions.map((nb) => (
                  <option key={nb.id} value={nb.id}>
                    {nb.name}
                    {nb.kind === 'inbox' ? ' · Inbox' : ''}
                  </option>
                ))}
              </select>
              {aiNotebookOptions.length > 1 ? (
                <p
                  style={{
                    margin: '6px 0 0',
                    fontSize: '12px',
                    color: 'var(--on-surface-variant)',
                    lineHeight: 1.5,
                  }}
                >
                  AI mode generates from a single notebook at a time. Use Manual to
                  combine notes from multiple notebooks.
                </p>
              ) : null}
            </>
          )}
        </Field>
      ) : null}

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
  isCrossNotebookMode,
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
  isCrossNotebookMode: boolean;
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
            isCrossNotebookMode={isCrossNotebookMode}
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
  isCrossNotebookMode,
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
  isCrossNotebookMode: boolean;
}) {
  const checkpoint = isCheckpointPhase(phase);
  const usedIds = useMemo(() => new Set(phase.materials.map((m) => m.id)), [phase.materials]);
  const available = useMemo(
    () => inScopeItems.filter((item) => !usedIds.has(item.id)),
    [inScopeItems, usedIds],
  );

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
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {m.title}
                  {isCrossNotebookMode && m.notebookName ? (
                    <span style={{ color: 'var(--on-surface-variant)' }}>
                      {' '}
                      · {m.notebookName}
                    </span>
                  ) : null}
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
                available={available}
                onPick={(item) => onAddMaterial(item)}
                onClose={onClosePicker}
                isCrossNotebookMode={isCrossNotebookMode}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function MaterialPicker({
  available,
  onPick,
  onClose,
  isCrossNotebookMode,
}: {
  available: InventoryItem[];
  onPick: (item: InventoryItem) => void;
  onClose: () => void;
  isCrossNotebookMode: boolean;
}) {
  // Group by notebook in cross-nb mode, by type otherwise.
  const grouped = useMemo(() => {
    if (isCrossNotebookMode) {
      return groupItemsByNotebook(available, new Set());
    }
    return null;
  }, [available, isCrossNotebookMode]);

  const groupedByType = useMemo(() => {
    const out: Record<MaterialType, InventoryItem[]> = {
      page: [],
      flashcard_set: [],
      quiz_set: [],
      document: [],
    };
    for (const item of available) out[item.type].push(item);
    return out;
  }, [available]);

  const total = available.length;
  return (
    <div
      role="menu"
      style={{
        position: 'absolute',
        top: 'calc(100% + 4px)',
        left: 0,
        right: 0,
        zIndex: 10,
        maxHeight: '280px',
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
      ) : isCrossNotebookMode && grouped ? (
        grouped.flatMap((group) => [
          <div
            key={`h-nb-${group.id ?? CROSS_NOTEBOOK_BUCKET_ID}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '10px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--on-surface-variant)',
              padding: '6px 8px 2px',
              fontWeight: 700,
            }}
          >
            {group.kind === 'inbox' ? (
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '12px' }}
                aria-hidden
              >
                mail
              </span>
            ) : (
              <span
                aria-hidden
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: group.color ?? 'var(--outline-variant)',
                }}
              />
            )}
            {group.name}
          </div>,
          ...group.items.map((item) => (
            <MaterialPickerRow
              key={item.id}
              item={item}
              onSelect={() => {
                onPick(item);
                onClose();
              }}
            />
          )),
        ])
      ) : (
        (['quiz_set', 'flashcard_set', 'page', 'document'] as const).flatMap((type) => {
          const items = groupedByType[type];
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
              <MaterialPickerRow
                key={item.id}
                item={item}
                onSelect={() => {
                  onPick(item);
                  onClose();
                }}
              />
            )),
          ];
        })
      )}
    </div>
  );
}

function MaterialPickerRow({
  item,
  onSelect,
}: {
  item: InventoryItem;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
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
        {TYPE_ICON[item.type]}
      </span>
      <span
        style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {item.title}
      </span>
      <span
        style={{
          fontSize: '10px',
          color: 'var(--on-surface-variant)',
          fontWeight: 600,
        }}
      >
        {TYPE_LABEL[item.type]}
      </span>
    </button>
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
