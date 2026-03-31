'use client';

import { useState, useCallback } from 'react';
import { X, Loader2, Sparkles, CalendarDays } from 'lucide-react';

interface StudyPlanCreatorProps {
  notebookId: string;
  onCreated: (planId: string) => void;
  onClose: () => void;
}

type TabType = 'manual' | 'ai';

interface PhaseDraft {
  title: string;
  startDate: string;
  endDate: string;
}

export default function StudyPlanCreator({ notebookId, onCreated, onClose }: StudyPlanCreatorProps) {
  const [activeTab, setActiveTab] = useState<TabType>('manual');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Manual fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
  );
  const [phases, setPhases] = useState<PhaseDraft[]>([
    { title: 'Phase 1', startDate: new Date().toISOString().split('T')[0], endDate: new Date(Date.now() + 6 * 86400000).toISOString().split('T')[0] },
  ]);

  // AI fields
  const [aiTitle, setAiTitle] = useState('');
  const [aiDuration, setAiDuration] = useState(14);
  const [aiGoals, setAiGoals] = useState('');

  const addPhase = useCallback(() => {
    const last = phases[phases.length - 1];
    const newStart = last ? new Date(new Date(last.endDate).getTime() + 86400000).toISOString().split('T')[0] : startDate;
    const newEnd = new Date(new Date(newStart).getTime() + 6 * 86400000).toISOString().split('T')[0];
    setPhases(prev => [...prev, { title: `Phase ${prev.length + 1}`, startDate: newStart, endDate: newEnd }]);
  }, [phases, startDate]);

  const removePhase = useCallback((index: number) => {
    setPhases(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== index));
  }, []);

  const updatePhase = useCallback((index: number, field: keyof PhaseDraft, value: string) => {
    setPhases(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  }, []);

  const handleManualSubmit = useCallback(async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    setIsSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/study-plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString(),
          source: 'manual',
          phases: phases.map((p, i) => ({
            title: p.title.trim() || `Phase ${i + 1}`,
            sortOrder: i,
            startDate: new Date(p.startDate).toISOString(),
            endDate: new Date(p.endDate).toISOString(),
          })),
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        onCreated(json.data.id);
      } else {
        setError(json.error || 'Failed to create study plan');
      }
    } catch {
      setError('Failed to create study plan');
    } finally {
      setIsSubmitting(false);
    }
  }, [notebookId, title, description, startDate, endDate, phases, onCreated]);

  const handleAiGenerate = useCallback(async () => {
    setIsSubmitting(true);
    setError('');
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
      if (json.success && json.data) {
        onCreated(json.data.id);
      } else {
        setError(json.error || 'Failed to generate study plan');
      }
    } catch {
      setError('Failed to generate study plan');
    } finally {
      setIsSubmitting(false);
    }
  }, [notebookId, aiDuration, aiGoals, onCreated]);

  const inputStyle: React.CSSProperties = {
    width: '100%', fontSize: '13px', color: '#ede9ff',
    background: 'rgba(140,82,255,0.08)',
    border: '1px solid rgba(140,82,255,0.2)',
    borderRadius: '8px', padding: '8px 12px', outline: 'none',
    fontFamily: 'inherit',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '12px', fontWeight: 600,
    color: 'rgba(196,169,255,0.55)',
    marginBottom: '4px', display: 'block',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div style={{
        width: '520px', maxHeight: '80vh',
        background: '#1e1d35', borderRadius: '16px',
        border: '1px solid rgba(140,82,255,0.2)',
        display: 'flex', flexDirection: 'column',
        fontFamily: 'inherit',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid rgba(140,82,255,0.1)',
        }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#ede9ff' }}>
            Create Study Plan
          </span>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: 'rgba(196,169,255,0.5)',
            cursor: 'pointer', padding: '4px',
          }}>
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: '2px', padding: '10px 20px',
          borderBottom: '1px solid rgba(140,82,255,0.1)',
        }}>
          {([['manual', CalendarDays, 'Manual'], ['ai', Sparkles, 'AI Generate']] as const).map(([tab, Icon, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as TabType)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '7px 14px', borderRadius: '8px',
                border: 'none', cursor: 'pointer',
                fontSize: '12.5px', fontWeight: 500,
                fontFamily: 'inherit',
                background: activeTab === tab ? 'rgba(140,82,255,0.2)' : 'transparent',
                color: activeTab === tab ? '#c4a9ff' : 'rgba(196,169,255,0.5)',
                transition: 'background 0.12s ease',
              }}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
          {activeTab === 'manual' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Title *</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Biology Midterm Prep"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Describe your study goals..."
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    style={{ ...inputStyle, colorScheme: 'dark' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    style={{ ...inputStyle, colorScheme: 'dark' }}
                  />
                </div>
              </div>

              {/* Phases */}
              <div>
                <label style={labelStyle}>Phases</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {phases.map((phase, idx) => (
                    <div key={idx} style={{
                      display: 'flex', gap: '8px', alignItems: 'center',
                      padding: '10px', borderRadius: '8px',
                      background: 'rgba(140,82,255,0.05)',
                      border: '1px solid rgba(140,82,255,0.1)',
                    }}>
                      <input
                        value={phase.title}
                        onChange={e => updatePhase(idx, 'title', e.target.value)}
                        placeholder="Phase title"
                        style={{ ...inputStyle, flex: 1, background: 'rgba(140,82,255,0.06)' }}
                      />
                      <input
                        type="date"
                        value={phase.startDate}
                        onChange={e => updatePhase(idx, 'startDate', e.target.value)}
                        style={{ ...inputStyle, width: '130px', colorScheme: 'dark', background: 'rgba(140,82,255,0.06)' }}
                      />
                      <input
                        type="date"
                        value={phase.endDate}
                        onChange={e => updatePhase(idx, 'endDate', e.target.value)}
                        style={{ ...inputStyle, width: '130px', colorScheme: 'dark', background: 'rgba(140,82,255,0.06)' }}
                      />
                      {phases.length > 1 && (
                        <button onClick={() => removePhase(idx)} style={{
                          background: 'transparent', border: 'none',
                          color: 'rgba(252,165,165,0.5)', cursor: 'pointer', padding: '4px',
                        }}>
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button onClick={addPhase} style={{
                    padding: '8px', borderRadius: '8px',
                    border: '1px dashed rgba(140,82,255,0.2)',
                    background: 'transparent', cursor: 'pointer',
                    color: 'rgba(196,169,255,0.4)', fontSize: '12px',
                    fontFamily: 'inherit',
                  }}>
                    + Add Phase
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{
                padding: '12px 14px', borderRadius: '8px',
                background: 'rgba(140,82,255,0.08)',
                border: '1px solid rgba(140,82,255,0.15)',
              }}>
                <p style={{ fontSize: '12.5px', color: 'rgba(237,233,255,0.5)', margin: 0, lineHeight: 1.6 }}>
                  AI will analyze your notebook content (pages, flashcards, quizzes, documents) and create an optimized study plan.
                </p>
              </div>

              <div>
                <label style={labelStyle}>Duration (days)</label>
                <input
                  type="number"
                  value={aiDuration}
                  onChange={e => setAiDuration(Math.max(1, parseInt(e.target.value) || 1))}
                  min={1}
                  style={{ ...inputStyle, width: '120px' }}
                />
              </div>

              <div>
                <label style={labelStyle}>Study Goals (optional)</label>
                <textarea
                  value={aiGoals}
                  onChange={e => setAiGoals(e.target.value)}
                  placeholder="e.g. Focus on chapters 1-5 for the midterm exam, prioritize weak areas like genetics..."
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: '0 20px 8px' }}>
            <p style={{ fontSize: '12px', color: 'rgba(252,165,165,0.8)', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: '8px',
          padding: '14px 20px', borderTop: '1px solid rgba(140,82,255,0.1)',
        }}>
          <button onClick={onClose} style={{
            padding: '8px 18px', borderRadius: '8px',
            border: '1px solid rgba(140,82,255,0.2)',
            background: 'transparent', color: '#c4a9ff',
            fontSize: '13px', cursor: 'pointer',
            fontFamily: 'inherit',
          }}>
            Cancel
          </button>
          <button
            onClick={activeTab === 'manual' ? handleManualSubmit : handleAiGenerate}
            disabled={isSubmitting || (activeTab === 'manual' && !title.trim())}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 18px', borderRadius: '8px', border: 'none',
              background: isSubmitting || (activeTab === 'manual' && !title.trim())
                ? 'rgba(140,82,255,0.2)' : '#8c52ff',
              color: isSubmitting || (activeTab === 'manual' && !title.trim())
                ? 'rgba(196,169,255,0.4)' : '#fff',
              fontSize: '13px', fontWeight: 600,
              cursor: isSubmitting ? 'wait' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {isSubmitting && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
            {activeTab === 'manual' ? 'Create Plan' : 'Generate with AI'}
          </button>
        </div>

        <style>{`
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </div>
  );
}
