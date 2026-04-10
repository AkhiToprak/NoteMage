'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, BookOpen, ClipboardCheck, Network, Loader2, SpellCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAiTask } from './AiTaskContext';

interface GenerateDropdownProps {
  notebookId: string;
  pageId: string;
  disabled?: boolean;
  onEssayCheck?: () => void;
}

type GenerateType = 'flashcards' | 'quiz' | 'mindmap';

const OPTIONS: { type: GenerateType; label: string; icon: typeof BookOpen }[] = [
  { type: 'flashcards', label: 'Generate Flashcards', icon: BookOpen },
  { type: 'quiz', label: 'Generate Quiz', icon: ClipboardCheck },
  { type: 'mindmap', label: 'Generate Mind Map', icon: Network },
];

// Labels shown in the global AI status pill while each action is running.
const AI_TASK_LABELS: Record<GenerateType, string> = {
  flashcards: 'Generating flashcards…',
  quiz: 'Generating quiz…',
  mindmap: 'Generating mind map…',
};

export default function GenerateDropdown({
  notebookId,
  pageId,
  disabled,
  onEssayCheck,
}: GenerateDropdownProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<GenerateType | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { startAiTask, finishAiTask } = useAiTask();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleGenerate = useCallback(
    async (type: GenerateType) => {
      if (loading) return;
      setLoading(true);
      setLoadingType(type);

      const taskId = startAiTask(AI_TASK_LABELS[type]);

      try {
        const res = await fetch(`/api/notebooks/${notebookId}/pages/${pageId}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type }),
        });

        const json = await res.json();

        if (!res.ok) {
          const errMsg = json?.error || `Failed to generate ${type}`;
          alert(errMsg);
          return;
        }

        const data = json.data;

        if (data.type === 'flashcards' && data.flashcardSet) {
          setOpen(false);
          router.push(`/notebooks/${notebookId}?tab=flashcards&setId=${data.flashcardSet.id}`);
        } else if (data.type === 'quiz' && data.quizSet) {
          setOpen(false);
          router.push(`/notebooks/${notebookId}?tab=quiz&setId=${data.quizSet.id}`);
        } else if (data.type === 'mindmap' && data.mindmap) {
          setOpen(false);
          alert(`Mind map "${data.mindmap.title}" generated successfully!`);
        } else if (data.text) {
          setOpen(false);
          alert(data.text);
        }
      } catch {
        alert('Network error. Please try again.');
      } finally {
        finishAiTask(taskId);
        setLoading(false);
        setLoadingType(null);
      }
    },
    [loading, notebookId, pageId, router, startAiTask, finishAiTask]
  );

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onMouseDown={(e) => {
          e.preventDefault();
          if (!disabled && !loading) setOpen((p) => !p);
        }}
        title="Generate from page"
        disabled={disabled || loading}
        style={{
          width: '30px',
          height: '28px',
          borderRadius: '6px',
          border: 'none',
          background: open ? 'rgba(140,82,255,0.22)' : 'transparent',
          color: open ? '#a47bff' : 'rgba(237,233,255,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: disabled || loading ? 'not-allowed' : 'pointer',
          transition: 'background 0.1s, color 0.1s',
          flexShrink: 0,
          opacity: disabled ? 0.4 : 1,
        }}
        onMouseEnter={(e) => {
          if (!open && !disabled && !loading) {
            e.currentTarget.style.background = 'rgba(237,233,255,0.08)';
            e.currentTarget.style.color = 'rgba(237,233,255,0.85)';
          }
        }}
        onMouseLeave={(e) => {
          if (!open && !disabled && !loading) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'rgba(237,233,255,0.5)';
          }
        }}
      >
        {loading ? (
          <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
        ) : (
          <Sparkles size={15} />
        )}
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            background: '#1e1d35',
            border: '1px solid rgba(140,82,255,0.15)',
            borderRadius: '10px',
            padding: '4px',
            zIndex: 100,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            minWidth: '200px',
          }}
        >
          {OPTIONS.map(({ type, label, icon: Icon }) => {
            const isThisLoading = loading && loadingType === type;
            return (
              <button
                key={type}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleGenerate(type);
                }}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  height: '32px',
                  padding: '0 12px',
                  border: 'none',
                  borderRadius: '6px',
                  background: 'transparent',
                  color: loading && !isThisLoading ? 'rgba(237,233,255,0.3)' : '#ede9ff',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'background 0.1s',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.background = 'rgba(140,82,255,0.12)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                {isThisLoading ? (
                  <Loader2
                    size={14}
                    style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}
                  />
                ) : (
                  <Icon size={14} style={{ flexShrink: 0 }} />
                )}
                <span>{isThisLoading ? 'Generating...' : label}</span>
              </button>
            );
          })}
          {onEssayCheck && (
            <>
              <div
                style={{
                  height: '1px',
                  background: 'rgba(140,82,255,0.1)',
                  margin: '4px 8px',
                }}
              />
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  setOpen(false);
                  onEssayCheck();
                }}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  height: '32px',
                  padding: '0 12px',
                  border: 'none',
                  borderRadius: '6px',
                  background: 'transparent',
                  color: loading ? 'rgba(237,233,255,0.3)' : '#ede9ff',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'background 0.1s',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.background = 'rgba(140,82,255,0.12)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <SpellCheck size={14} style={{ flexShrink: 0 }} />
                <span>Check Grammar & Spelling</span>
              </button>
            </>
          )}
        </div>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
