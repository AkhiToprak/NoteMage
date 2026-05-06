'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Edit3, Plus, CalendarDays, Sparkles } from 'lucide-react';
import StudyPhaseCard from '@/components/notebook/StudyPhaseCard';
import { useBreakpoint } from '@/hooks/useBreakpoint';

interface StudyMaterialData {
  id: string;
  type: string;
  referenceId: string;
  title: string;
  completed: boolean;
  sortOrder: number;
}

interface StudyPhaseData {
  id: string;
  planId: string;
  title: string;
  description: string | null;
  sortOrder: number;
  startDate: string;
  endDate: string;
  status: string;
  materials: StudyMaterialData[];
}

interface StudyPlanData {
  id: string;
  notebookId: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  source: string;
  phases: StudyPhaseData[];
}

interface StudyPlanViewProps {
  notebookId: string;
  planId: string;
  initialData: StudyPlanData;
}

export default function StudyPlanView({ notebookId, planId, initialData }: StudyPlanViewProps) {
  const router = useRouter();
  const { isPhone } = useBreakpoint();
  const [plan, setPlan] = useState<StudyPlanData>(initialData);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(plan.title);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(plan.description || '');
  const [showAddPhase, setShowAddPhase] = useState(false);
  const [newPhaseTitle, setNewPhaseTitle] = useState('');
  const [newPhaseDays, setNewPhaseDays] = useState(7);

  const apiBase = `/api/notebooks/${notebookId}/study-plans/${planId}`;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(apiBase);
      const json = await res.json();
      if (json.success && json.data) setPlan(json.data);
    } catch {
      /* silent */
    }
  }, [apiBase]);

  // Compute overall progress
  const allMaterials = plan.phases.flatMap((p) => p.materials);
  const totalMaterials = allMaterials.length;
  const completedMaterials = allMaterials.filter((m) => m.completed).length;
  const overallProgress = totalMaterials > 0 ? (completedMaterials / totalMaterials) * 100 : 0;

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const saveTitle = useCallback(async () => {
    if (!titleDraft.trim()) {
      setEditingTitle(false);
      setTitleDraft(plan.title);
      return;
    }
    try {
      await fetch(apiBase, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: titleDraft.trim() }),
      });
      setEditingTitle(false);
      refresh();
    } catch {
      setEditingTitle(false);
    }
  }, [apiBase, titleDraft, plan.title, refresh]);

  const saveDesc = useCallback(async () => {
    try {
      await fetch(apiBase, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: descDraft.trim() || null }),
      });
      setEditingDesc(false);
      refresh();
    } catch {
      setEditingDesc(false);
    }
  }, [apiBase, descDraft, refresh]);

  const deletePlan = useCallback(async () => {
    if (!confirm('Delete this study plan? This cannot be undone.')) return;
    try {
      await fetch(apiBase, { method: 'DELETE' });
      router.push(`/notebooks/${notebookId}`);
    } catch {
      /* silent */
    }
  }, [apiBase, notebookId, router]);

  const addPhase = useCallback(async () => {
    if (!newPhaseTitle.trim()) return;
    const lastPhase = plan.phases[plan.phases.length - 1];
    const startDate = lastPhase
      ? new Date(new Date(lastPhase.endDate).getTime() + 86400000)
      : new Date();
    const endDate = new Date(startDate.getTime() + (newPhaseDays - 1) * 86400000);

    try {
      await fetch(`${apiBase}/phases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newPhaseTitle.trim(),
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        }),
      });
      setShowAddPhase(false);
      setNewPhaseTitle('');
      setNewPhaseDays(7);
      refresh();
    } catch {
      /* silent */
    }
  }, [apiBase, newPhaseTitle, newPhaseDays, plan.phases, refresh]);

  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        padding: isPhone ? '20px 14px' : '32px 40px',
        fontFamily: 'inherit',
      }}
    >
      {/* Header */}
      <div style={{ maxWidth: isPhone ? '100%' : '720px', margin: '0 auto' }}>
        <div
          style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}
        >
          <div style={{ flex: 1 }}>
            {editingTitle ? (
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTitle();
                  if (e.key === 'Escape') {
                    setEditingTitle(false);
                    setTitleDraft(plan.title);
                  }
                }}
                autoFocus
                style={{
                  fontSize: isPhone ? '20px' : '24px',
                  fontWeight: 700,
                  color: '#ede9ff',
                  background: 'rgba(140,82,255,0.08)',
                  border: '1px solid rgba(140,82,255,0.3)',
                  borderRadius: '8px',
                  padding: '4px 10px',
                  outline: 'none',
                  fontFamily: 'inherit',
                  width: '100%',
                }}
              />
            ) : (
              <h1
                onClick={() => {
                  setEditingTitle(true);
                  setTitleDraft(plan.title);
                }}
                style={{
                  fontSize: isPhone ? '20px' : '24px',
                  fontWeight: 700,
                  color: '#ede9ff',
                  margin: 0,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {plan.title}
                {plan.source === 'ai' && (
                  <Sparkles
                    size={14}
                    style={{ color: '#8c52ff', marginLeft: '8px', verticalAlign: 'middle' }}
                  />
                )}
              </h1>
            )}
          </div>

          <div style={{ display: 'flex', gap: '6px', paddingTop: '4px' }}>
            <button
              onClick={() => {
                setEditingTitle(true);
                setTitleDraft(plan.title);
              }}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: '1px solid rgba(140,82,255,0.15)',
                background: 'transparent',
                color: 'rgba(196,169,255,0.4)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Edit3 size={14} />
            </button>
            <button
              onClick={deletePlan}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: '1px solid rgba(140,82,255,0.15)',
                background: 'transparent',
                color: 'rgba(252,165,165,0.5)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Description */}
        {editingDesc ? (
          <textarea
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            onBlur={saveDesc}
            autoFocus
            rows={3}
            style={{
              width: '100%',
              fontSize: '14px',
              color: 'rgba(237,233,255,0.6)',
              background: 'rgba(140,82,255,0.06)',
              border: '1px solid rgba(140,82,255,0.2)',
              borderRadius: '8px',
              padding: '8px 12px',
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'inherit',
              lineHeight: 1.6,
            }}
          />
        ) : (
          <p
            onClick={() => {
              setEditingDesc(true);
              setDescDraft(plan.description || '');
            }}
            style={{
              fontSize: '14px',
              color: plan.description ? 'rgba(237,233,255,0.5)' : 'rgba(237,233,255,0.2)',
              margin: '0 0 4px',
              lineHeight: 1.6,
              cursor: 'pointer',
            }}
          >
            {plan.description || 'Click to add a description...'}
          </p>
        )}

        {/* Meta row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: isPhone ? '8px 12px' : '16px',
            margin: isPhone ? '12px 0 18px' : '12px 0 24px',
            fontSize: isPhone ? '11px' : '12px',
            color: 'rgba(196,169,255,0.4)',
            flexWrap: isPhone ? 'wrap' : undefined,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <CalendarDays size={13} />
            {formatDate(plan.startDate)} – {formatDate(plan.endDate)}
          </span>
          <span>
            {plan.phases.length} phase{plan.phases.length !== 1 ? 's' : ''}
          </span>
          <span>
            {totalMaterials} material{totalMaterials !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Overall progress */}
        {totalMaterials > 0 && (
          <div style={{ marginBottom: '28px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '6px',
              }}
            >
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(196,169,255,0.5)' }}>
                Overall Progress
              </span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#c4a9ff' }}>
                {completedMaterials}/{totalMaterials} ({Math.round(overallProgress)}%)
              </span>
            </div>
            <div
              style={{
                height: '6px',
                borderRadius: '3px',
                background: 'rgba(140,82,255,0.1)',
              }}
            >
              <div
                style={{
                  height: '100%',
                  borderRadius: '3px',
                  background:
                    overallProgress === 100
                      ? 'linear-gradient(90deg, rgba(74,222,128,0.7), rgba(74,222,128,0.9))'
                      : 'linear-gradient(90deg, #8c52ff, #5170ff)',
                  width: `${overallProgress}%`,
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          </div>
        )}

        {/* Phase timeline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {plan.phases.map((phase, idx) => (
            <div key={phase.id} style={{ position: 'relative' }}>
              {/* Timeline connector line */}
              {idx < plan.phases.length - 1 && (
                <div
                  style={{
                    position: 'absolute',
                    left: '19px',
                    top: '100%',
                    width: '2px',
                    height: '16px',
                    background: 'rgba(140,82,255,0.15)',
                  }}
                />
              )}
              <StudyPhaseCard
                notebookId={notebookId}
                planId={planId}
                phase={phase}
                onRefresh={refresh}
              />
            </div>
          ))}
        </div>

        {/* Add Phase */}
        {showAddPhase ? (
          <div
            style={{
              marginTop: '16px',
              padding: isPhone ? '12px' : '16px',
              background: 'rgba(30,29,53,0.6)',
              border: '1px solid rgba(140,82,255,0.15)',
              borderRadius: '12px',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: isPhone ? 'wrap' : undefined,
                gap: '10px',
                marginBottom: '10px',
              }}
            >
              <input
                value={newPhaseTitle}
                onChange={(e) => setNewPhaseTitle(e.target.value)}
                placeholder="Phase title..."
                autoFocus
                style={{
                  flex: 1,
                  fontSize: '13px',
                  color: '#ede9ff',
                  background: 'rgba(140,82,255,0.08)',
                  border: '1px solid rgba(140,82,255,0.2)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
              <input
                type="number"
                value={newPhaseDays}
                onChange={(e) => setNewPhaseDays(Math.max(1, parseInt(e.target.value) || 1))}
                min={1}
                style={{
                  width: '60px',
                  fontSize: '13px',
                  color: '#ede9ff',
                  background: 'rgba(140,82,255,0.08)',
                  border: '1px solid rgba(140,82,255,0.2)',
                  borderRadius: '8px',
                  padding: '8px',
                  outline: 'none',
                  textAlign: 'center',
                  fontFamily: 'inherit',
                }}
              />
              <span
                style={{ fontSize: '12px', color: 'rgba(196,169,255,0.4)', alignSelf: 'center' }}
              >
                days
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={addPhase}
                disabled={!newPhaseTitle.trim()}
                style={{
                  padding: '7px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: newPhaseTitle.trim() ? '#8c52ff' : 'rgba(140,82,255,0.2)',
                  color: newPhaseTitle.trim() ? '#fff' : 'rgba(196,169,255,0.4)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: newPhaseTitle.trim() ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                }}
              >
                Add Phase
              </button>
              <button
                onClick={() => {
                  setShowAddPhase(false);
                  setNewPhaseTitle('');
                }}
                style={{
                  padding: '7px 16px',
                  borderRadius: '8px',
                  border: '1px solid rgba(140,82,255,0.2)',
                  background: 'transparent',
                  color: '#c4a9ff',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddPhase(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              width: '100%',
              marginTop: '16px',
              padding: '12px',
              borderRadius: '10px',
              border: '1.5px dashed rgba(140,82,255,0.2)',
              background: 'transparent',
              cursor: 'pointer',
              color: 'rgba(196,169,255,0.4)',
              fontSize: '13px',
              fontWeight: 500,
              fontFamily: 'inherit',
              transition: 'border-color 0.15s ease, color 0.15s ease',
            }}
          >
            <Plus size={14} />
            Add Phase
          </button>
        )}
      </div>
    </div>
  );
}
