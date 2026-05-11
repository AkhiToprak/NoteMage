'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ImportNotebookDialog from '@/components/notebook/ImportNotebookDialog';

// Phase 8 — single entry point for turning a notebook into a Learn Path.
// Replaces the legacy StudyPlanCreator. Two modes:
//
//   1. AI — same generation flow as before, just rebranded.
//   2. Manual — pick existing notebook materials (and optionally upload
//      more notes), arrange them into phases, designate a checkpoint
//      quiz per phase. Writes a StudyPlan with gateStrategy='checkpoint'
//      on phases ending in a quiz, 'sequential' elsewhere — both render
//      in /learn.
//
// On success both modes route to /learn so the user immediately lands on
// the new path UI instead of the legacy StudyPlanView.

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

export default function LearnNotebookSetup({
  notebookId,
  notebookName,
  onClose,
}: LearnNotebookSetupProps) {
  const router = useRouter();
  const [tab, setTab] = useState<TabType>('ai');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const [showImport, setShowImport] = useState(false);

  // Inventory
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [inventoryError, setInventoryError] = useState<string | null>(null);

  const loadInventory = useCallback(async () => {
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
    } catch {
      setInventoryError('Failed to load notebook contents.');
    }
  }, [notebookId]);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  const flatInventory = useMemo(() => {
    if (!inventory) return [] as InventoryItem[];
    return [
      ...inventory.pages,
      ...inventory.flashcardSets,
      ...inventory.quizSets,
      ...inventory.documents,
    ];
  }, [inventory]);

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
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/study-plans/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          durationDays: aiDuration,
          goals: aiGoals.trim() || undefined,
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
  }, [notebookId, aiDuration, aiGoals, router, onClose]);

  const submitManual = useCallback(async () => {
    if (!planTitle.trim()) {
      setError('Plan title is required.');
      return;
    }
    if (phases.every((p) => p.materials.length === 0)) {
      setError('Add at least one material to a phase before generating.');
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
          width: '720px',
          maxWidth: '95vw',
          maxHeight: '85vh',
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

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '2px',
            padding: '10px 20px',
            borderBottom: '1px solid var(--outline-variant)',
          }}
        >
          {([
            ['ai', 'AI generate', 'auto_fix_high'],
            ['manual', 'Manual', 'tune'],
          ] as const).map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
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

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px' }}>
          {tab === 'ai' ? (
            <AiTab
              durationDays={aiDuration}
              onDurationChange={setAiDuration}
              goals={aiGoals}
              onGoalsChange={setAiGoals}
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
              inventory={flatInventory}
              inventoryError={inventoryError}
              openPicker={openPicker}
              setOpenPicker={setOpenPicker}
              onOpenImport={() => setShowImport(true)}
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
            justifyContent: 'flex-end',
            gap: '8px',
            padding: '14px 20px',
            borderTop: '1px solid var(--outline-variant)',
          }}
        >
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
            void loadInventory();
          }}
          onClose={() => setShowImport(false)}
        />
      ) : null}
    </div>
  );
}

function AiTab({
  durationDays,
  onDurationChange,
  goals,
  onGoalsChange,
}: {
  durationDays: number;
  onDurationChange: (n: number) => void;
  goals: string;
  onGoalsChange: (g: string) => void;
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
        NoteMage will scan this notebook&apos;s contents and build a Duolingo-style path with
        phased lessons and checkpoint quizzes. Lock the phases later in <strong>Learn</strong>.
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
  inventory,
  inventoryError,
  openPicker,
  setOpenPicker,
  onOpenImport,
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
  inventory: InventoryItem[];
  inventoryError: string | null;
  openPicker: number | null;
  setOpenPicker: (idx: number | null) => void;
  onOpenImport: () => void;
}) {
  const inventoryEmpty = inventory.length === 0 && !inventoryError;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
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

      {inventoryEmpty ? (
        <div
          style={{
            padding: '14px 16px',
            background: 'var(--surface-container-low)',
            border: '1px dashed var(--outline-variant)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: '13px', color: 'var(--on-surface-variant)' }}>
            This notebook has no content yet. Upload some notes to start picking phases.
          </span>
          <button type="button" onClick={onOpenImport} style={uploadButtonStyle}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
              upload
            </span>
            Upload notes
          </button>
        </div>
      ) : null}

      {inventoryError ? (
        <div
          role="alert"
          style={{
            padding: '12px 14px',
            background: 'var(--surface-container-low)',
            border: '1px solid var(--error)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--error)',
            fontSize: '13px',
          }}
        >
          {inventoryError}
        </div>
      ) : null}

      {/* Phases */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: '12px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--on-surface-variant)',
              fontWeight: 700,
            }}
          >
            Phases
          </h3>
          <button type="button" onClick={onOpenImport} style={uploadButtonStyle}>
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
              upload
            </span>
            Add notes
          </button>
        </div>

        {phases.map((phase, idx) => (
          <PhaseCard
            key={idx}
            phase={phase}
            phaseIdx={idx}
            canRemove={phases.length > 1}
            canMoveUp={idx > 0}
            canMoveDown={idx < phases.length - 1}
            inventory={inventory}
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
  inventory,
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
  inventory: InventoryItem[];
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
    for (const item of inventory) {
      if (usedIds.has(item.id)) continue;
      result[item.type].push(item);
    }
    return result;
  }, [inventory, usedIds]);

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
              disabled={inventory.length === 0}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px dashed var(--outline-variant)',
                background: 'transparent',
                color: 'var(--on-surface-variant)',
                cursor: inventory.length === 0 ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                fontFamily: 'inherit',
                opacity: inventory.length === 0 ? 0.5 : 1,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
                add
              </span>
              Add material
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
          Nothing left to add — every notebook item is already in this phase.
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

const uploadButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '7px 12px',
  borderRadius: 'var(--radius-full)',
  border: '1px solid var(--outline-variant)',
  background: 'transparent',
  color: 'var(--on-surface)',
  fontSize: '12px',
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
};
