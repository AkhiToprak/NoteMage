'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  ChevronRight,
  Trash2,
  Plus,
  Edit3,
  Check,
  FileText,
  Layers,
  HelpCircle,
  File,
  X,
} from 'lucide-react';
import MaterialPicker from '@/components/notebook/MaterialPicker';

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

interface StudyPhaseCardProps {
  notebookId: string;
  planId: string;
  phase: StudyPhaseData;
  onRefresh: () => void;
}

const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  upcoming: { bg: 'rgba(148,163,184,0.15)', color: 'rgba(148,163,184,0.8)', label: 'Upcoming' },
  active: { bg: 'rgba(140,82,255,0.15)', color: '#c4a9ff', label: 'Active' },
  completed: { bg: 'rgba(74,222,128,0.15)', color: 'rgba(74,222,128,0.8)', label: 'Completed' },
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  page: <FileText size={13} />,
  flashcard_set: <Layers size={13} />,
  quiz_set: <HelpCircle size={13} />,
  document: <File size={13} />,
};

function getMaterialLink(notebookId: string, type: string, referenceId: string): string | null {
  switch (type) {
    case 'page':
      return `/notebooks/${notebookId}/pages/${referenceId}`;
    case 'flashcard_set':
      return `/notebooks/${notebookId}/flashcards/${referenceId}`;
    case 'quiz_set':
      return `/notebooks/${notebookId}/quizzes/${referenceId}`;
    default:
      return null;
  }
}

export default function StudyPhaseCard({
  notebookId,
  planId,
  phase,
  onRefresh,
}: StudyPhaseCardProps) {
  const [expanded, setExpanded] = useState(phase.status === 'active');
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(phase.title);

  const completedCount = phase.materials.filter((m) => m.completed).length;
  const totalCount = phase.materials.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const statusStyle = STATUS_COLORS[phase.status] || STATUS_COLORS.upcoming;

  const apiBase = `/api/notebooks/${notebookId}/study-plans/${planId}/phases/${phase.id}`;

  const toggleMaterialCompleted = useCallback(
    async (materialId: string, completed: boolean) => {
      try {
        await fetch(`${apiBase}/materials/${materialId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: !completed }),
        });
        onRefresh();
      } catch {
        /* silent */
      }
    },
    [apiBase, onRefresh]
  );

  const deleteMaterial = useCallback(
    async (materialId: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await fetch(`${apiBase}/materials/${materialId}`, { method: 'DELETE' });
        onRefresh();
      } catch {
        /* silent */
      }
    },
    [apiBase, onRefresh]
  );

  const updatePhaseStatus = useCallback(
    async (status: string) => {
      try {
        await fetch(apiBase, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        onRefresh();
      } catch {
        /* silent */
      }
    },
    [apiBase, onRefresh]
  );

  const saveTitle = useCallback(async () => {
    if (!titleDraft.trim()) {
      setEditingTitle(false);
      setTitleDraft(phase.title);
      return;
    }
    try {
      await fetch(apiBase, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: titleDraft.trim() }),
      });
      setEditingTitle(false);
      onRefresh();
    } catch {
      setEditingTitle(false);
    }
  }, [apiBase, titleDraft, phase.title, onRefresh]);

  const deletePhase = useCallback(async () => {
    try {
      await fetch(apiBase, { method: 'DELETE' });
      onRefresh();
    } catch {
      /* silent */
    }
  }, [apiBase, onRefresh]);

  const handleAddMaterials = useCallback(
    async (materials: { type: string; referenceId: string; title: string }[]) => {
      setShowMaterialPicker(false);
      for (const m of materials) {
        try {
          await fetch(`${apiBase}/materials`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(m),
          });
        } catch {
          /* silent */
        }
      }
      onRefresh();
    },
    [apiBase, onRefresh]
  );

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <>
      <div
        style={{
          background: 'rgba(30,29,53,0.8)',
          border: `1px solid ${phase.status === 'active' ? 'rgba(140,82,255,0.25)' : 'rgba(140,82,255,0.1)'}`,
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          onClick={() => setExpanded((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '14px 16px',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          {expanded ? (
            <ChevronDown size={14} style={{ color: 'rgba(196,169,255,0.5)', flexShrink: 0 }} />
          ) : (
            <ChevronRight size={14} style={{ color: 'rgba(196,169,255,0.5)', flexShrink: 0 }} />
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {editingTitle ? (
                <input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveTitle();
                    if (e.key === 'Escape') {
                      setEditingTitle(false);
                      setTitleDraft(phase.title);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#ede9ff',
                    background: 'rgba(140,82,255,0.1)',
                    border: '1px solid rgba(140,82,255,0.3)',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    outline: 'none',
                    fontFamily: 'inherit',
                    width: '100%',
                  }}
                />
              ) : (
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#ede9ff' }}>
                  {phase.title}
                </span>
              )}
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: statusStyle.bg,
                  color: statusStyle.color,
                  whiteSpace: 'nowrap',
                }}
              >
                {statusStyle.label}
              </span>
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(196,169,255,0.4)', marginTop: '3px' }}>
              {formatDate(phase.startDate)} – {formatDate(phase.endDate)}
              {totalCount > 0 && ` · ${completedCount}/${totalCount} done`}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => {
                setEditingTitle(true);
                setTitleDraft(phase.title);
              }}
              title="Edit phase"
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '6px',
                border: 'none',
                background: 'transparent',
                color: 'rgba(196,169,255,0.3)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Edit3 size={12} />
            </button>
            <button
              onClick={deletePhase}
              title="Delete phase"
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '6px',
                border: 'none',
                background: 'transparent',
                color: 'rgba(196,169,255,0.3)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {totalCount > 0 && (
          <div style={{ height: '3px', background: 'rgba(140,82,255,0.08)', margin: '0 16px' }}>
            <div
              style={{
                height: '100%',
                borderRadius: '2px',
                background: progress === 100 ? 'rgba(74,222,128,0.7)' : '#8c52ff',
                width: `${progress}%`,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        )}

        {/* Expanded content */}
        {expanded && (
          <div style={{ padding: '12px 16px 16px' }}>
            {phase.description && (
              <p
                style={{
                  fontSize: '12.5px',
                  color: 'rgba(237,233,255,0.45)',
                  margin: '0 0 12px',
                  lineHeight: 1.5,
                }}
              >
                {phase.description}
              </p>
            )}

            {/* Status switcher */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
              {(['upcoming', 'active', 'completed'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => updatePhaseStatus(s)}
                  style={{
                    fontSize: '11px',
                    fontWeight: 500,
                    padding: '3px 10px',
                    borderRadius: '6px',
                    border: phase.status === s ? 'none' : '1px solid rgba(140,82,255,0.15)',
                    background: phase.status === s ? STATUS_COLORS[s].bg : 'transparent',
                    color: phase.status === s ? STATUS_COLORS[s].color : 'rgba(196,169,255,0.35)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {STATUS_COLORS[s].label}
                </button>
              ))}
            </div>

            {/* Materials checklist */}
            {phase.materials.length === 0 ? (
              <p style={{ fontSize: '12px', color: 'rgba(237,233,255,0.2)', margin: '8px 0' }}>
                No materials added yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {phase.materials.map((mat) => {
                  const link = getMaterialLink(notebookId, mat.type, mat.referenceId);
                  const content = (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        transition: 'background 0.1s ease',
                      }}
                    >
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleMaterialCompleted(mat.id, mat.completed);
                        }}
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '4px',
                          border: mat.completed ? 'none' : '1.5px solid rgba(140,82,255,0.3)',
                          background: mat.completed ? 'rgba(74,222,128,0.7)' : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        {mat.completed && <Check size={11} style={{ color: '#fff' }} />}
                      </button>
                      <span style={{ color: 'rgba(196,169,255,0.4)', flexShrink: 0 }}>
                        {TYPE_ICONS[mat.type] || <File size={13} />}
                      </span>
                      <span
                        style={{
                          fontSize: '13px',
                          color: mat.completed ? 'rgba(237,233,255,0.3)' : 'rgba(237,233,255,0.7)',
                          textDecoration: mat.completed ? 'line-through' : 'none',
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontFamily: 'inherit',
                        }}
                      >
                        {mat.title}
                      </span>
                      <button
                        onClick={(e) => deleteMaterial(mat.id, e)}
                        style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '4px',
                          border: 'none',
                          background: 'transparent',
                          color: 'rgba(196,169,255,0.2)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: 0,
                          transition: 'opacity 0.1s ease',
                        }}
                        className="mat-delete-btn"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  );

                  return link ? (
                    <Link key={mat.id} href={link} style={{ textDecoration: 'none' }}>
                      {content}
                    </Link>
                  ) : (
                    <div key={mat.id}>{content}</div>
                  );
                })}
              </div>
            )}

            {/* Add material button */}
            <button
              onClick={() => setShowMaterialPicker(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginTop: '8px',
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px dashed rgba(140,82,255,0.2)',
                background: 'transparent',
                cursor: 'pointer',
                color: 'rgba(196,169,255,0.4)',
                fontSize: '12px',
                fontFamily: 'inherit',
                transition: 'border-color 0.12s ease, color 0.12s ease',
              }}
            >
              <Plus size={12} />
              Add Material
            </button>
          </div>
        )}
      </div>

      {showMaterialPicker && (
        <MaterialPicker
          notebookId={notebookId}
          onSelect={handleAddMaterials}
          onClose={() => setShowMaterialPicker(false)}
        />
      )}

      <style>{`
        div:hover > .mat-delete-btn { opacity: 1 !important; }
      `}</style>
    </>
  );
}
