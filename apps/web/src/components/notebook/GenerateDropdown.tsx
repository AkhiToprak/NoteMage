'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, BookOpen, ClipboardCheck, Network, Loader2, SpellCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAiTask } from './AiTaskContext';
import { useNotebookWorkspace } from './NotebookWorkspaceContext';

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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { startAiTask, finishAiTask } = useAiTask();
  const { refreshFlashcardSets, refreshQuizSets } = useNotebookWorkspace();

  // Close on outside click / tap. pointerdown fires for both mouse and
  // touch on iOS Safari + Android Chrome.
  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      const target = e.target as Node;
      if (ref.current && ref.current.contains(target)) return;
      if (menuRef.current && menuRef.current.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [open]);

  // Reposition the menu on scroll/resize. Initial placement happens via the
  // callback ref on the menu element so it never paints at the wrong spot.
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const menu = menuRef.current;
      const btn = buttonRef.current;
      if (!menu || !btn) return;
      const rect = btn.getBoundingClientRect();
      const menuWidth = menu.offsetWidth || 220;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8));
      menu.style.top = `${rect.bottom + 6}px`;
      menu.style.left = `${left}px`;
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
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
          refreshFlashcardSets();
          router.push(`/notebooks/${notebookId}/flashcards/${data.flashcardSet.id}`);
        } else if (data.type === 'quiz' && data.quizSet) {
          setOpen(false);
          refreshQuizSets();
          router.push(`/notebooks/${notebookId}/quizzes/${data.quizSet.id}`);
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
    [
      loading,
      notebookId,
      pageId,
      router,
      startAiTask,
      finishAiTask,
      refreshFlashcardSets,
      refreshQuizSets,
    ]
  );

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
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
          ref={(el) => {
            menuRef.current = el;
            // Compute position the moment the menu mounts so the user never
            // sees it paint at the wrong spot (avoids the React state +
            // double-render flash that broke the menu on phone).
            if (!el || !buttonRef.current) return;
            const rect = buttonRef.current.getBoundingClientRect();
            const menuWidth = el.offsetWidth || 220;
            const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8));
            el.style.top = `${rect.bottom + 6}px`;
            el.style.left = `${left}px`;
          }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            background: '#1e1d35',
            border: '1px solid rgba(140,82,255,0.15)',
            borderRadius: '10px',
            padding: '4px',
            zIndex: 300,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            width: '220px',
          }}
        >
          {OPTIONS.map(({ type, label, icon: Icon }) => {
            const isThisLoading = loading && loadingType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => {
                  handleGenerate(type);
                }}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  minHeight: '40px',
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
                type="button"
                onClick={() => {
                  setOpen(false);
                  onEssayCheck();
                }}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  minHeight: '40px',
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
