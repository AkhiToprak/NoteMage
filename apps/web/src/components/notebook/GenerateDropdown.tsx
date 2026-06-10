'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useAiTask } from './AiTaskContext';
import { useNotebookWorkspace } from './NotebookWorkspaceContext';
import CreateChatModal from '@/components/learn/CreateChatModal';
import LearnPathSetup from '@/components/learn/LearnPathSetup';
import { getMageName } from '@/lib/scholar';
import { useToast } from '@/components/ui/Toast';

interface GenerateDropdownProps {
  notebookId: string;
  pageId: string;
  disabled?: boolean;
  onEssayCheck?: () => void;
}

type GenerateType = 'flashcards' | 'quiz';

const OPTIONS: { type: GenerateType; label: string; icon: string }[] = [
  { type: 'flashcards', label: 'Generate Flashcards', icon: 'menu_book' },
  { type: 'quiz', label: 'Generate Quiz', icon: 'quiz' },
];

// Labels shown in the global AI status pill while each action is running.
const AI_TASK_LABELS: Record<GenerateType, string> = {
  flashcards: 'Generating flashcards…',
  quiz: 'Generating quiz…',
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
  const [mounted, setMounted] = useState(false);
  const [chatModalOpen, setChatModalOpen] = useState(false);
  const [pathModalOpen, setPathModalOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Dedupe: pointerup + the synthesized click both fire on touch. We
  // trigger from both so iOS reliably runs the action even when click is
  // suppressed for whatever reason; this guard blocks the double-fire.
  const lastFireRef = useRef(0);
  const router = useRouter();
  const { data: session } = useSession();
  const mageName = getMageName(session?.user?.scholarName);
  const { startAiTask, finishAiTask } = useAiTask();
  const { notebook, refreshFlashcardSets, refreshQuizSets } = useNotebookWorkspace();
  const notebookName = notebook?.name ?? 'this notebook';
  const { toast } = useToast();

  const fireOnce = useCallback((fn: () => void) => {
    if (Date.now() - lastFireRef.current < 600) return;
    lastFireRef.current = Date.now();
    fn();
  }, []);

  // Portal target only exists in the browser; gate the createPortal call
  // until after hydration so SSR/CSR markup matches.
  useEffect(() => {
    setMounted(true);
  }, []);

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
          toast({ title: 'Generation failed', description: errMsg, variant: 'error' });
          return;
        }

        const data = json.data;

        // Generate in place: refresh the in-notebook sidebar group so the new
        // set appears where the user already is, then toast a deep-link to it
        // — no teleport to the global Learn hub (audit item 14).
        if (data.type === 'flashcards' && data.flashcardSet) {
          setOpen(false);
          refreshFlashcardSets();
          toast({
            title: 'Flashcards ready',
            description: `Added to ${notebookName}.`,
            variant: 'success',
            action: {
              label: 'Open flashcards',
              href: `/notebooks/${notebookId}/flashcards/${data.flashcardSet.id}`,
            },
          });
        } else if (data.type === 'quiz' && data.quizSet) {
          setOpen(false);
          refreshQuizSets();
          toast({
            title: 'Quiz ready',
            description: `Added to ${notebookName}.`,
            variant: 'success',
            action: {
              label: 'Open quiz',
              href: `/notebooks/${notebookId}/quizzes/${data.quizSet.id}`,
            },
          });
        } else if (data.text) {
          setOpen(false);
          toast({ title: 'Nothing to generate', description: data.text });
        }
      } catch {
        toast({ title: 'Network error', description: 'Please try again.', variant: 'error' });
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
      toast,
      notebookName,
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
        onPointerUp={() => {
          fireOnce(() => {
            if (!disabled && !loading) setOpen((p) => !p);
          });
        }}
        onClick={() => {
          fireOnce(() => {
            if (!disabled && !loading) setOpen((p) => !p);
          });
        }}
        title="Generate from page"
        disabled={disabled || loading}
        style={{
          width: '30px',
          height: '28px',
          borderRadius: '6px',
          border: 'none',
          background: open ? 'rgba(140,82,255,0.22)' : 'transparent',
          color: open ? '#a47bff' : 'var(--ink-50)',
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
            e.currentTarget.style.background = 'var(--ink-08)';
            e.currentTarget.style.color = 'var(--ink-80)';
          }
        }}
        onMouseLeave={(e) => {
          if (!open && !disabled && !loading) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--ink-50)';
          }
        }}
      >
        {loading ? (
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 15, animation: 'spin 1s linear infinite' }}
            aria-hidden
          >
            progress_activity
          </span>
        ) : (
          <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>
            auto_awesome
          </span>
        )}
      </button>
      {open &&
        mounted &&
        createPortal(
          <div
            ref={(el) => {
              menuRef.current = el;
              // Compute position the moment the menu mounts so the user never
              // sees it paint at the wrong spot. Rendering through a portal
              // into document.body bypasses any parent transform / overflow
              // / backdrop-filter that could otherwise clip or contain a
              // position:fixed child.
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
              border: '1px solid rgba(174,137,255,0.30)',
              borderRadius: '10px',
              padding: '4px',
              zIndex: 9999,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              width: '220px',
            }}
          >
            {OPTIONS.map(({ type, label, icon }) => {
              const isThisLoading = loading && loadingType === type;
              return (
                <button
                  key={type}
                  type="button"
                  onPointerUp={() => fireOnce(() => handleGenerate(type))}
                  onClick={() => fireOnce(() => handleGenerate(type))}
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
                    color: loading && !isThisLoading ? 'var(--ink-30)' : 'var(--on-surface)',
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
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 14, animation: 'spin 1s linear infinite', flexShrink: 0 }}
                      aria-hidden
                    >
                      progress_activity
                    </span>
                  ) : (
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 14, flexShrink: 0 }}
                      aria-hidden
                    >
                      {icon}
                    </span>
                  )}
                  <span>{isThisLoading ? 'Generating...' : label}</span>
                </button>
              );
            })}

            {/* ── Divider + Learn hub shortcuts (Phase 9.5) ─────── */}
            <div
              style={{
                height: '1px',
                background: 'rgba(174,137,255,0.20)',
                margin: '4px 8px',
              }}
            />
            <button
              type="button"
              onPointerUp={() =>
                fireOnce(() => {
                  setOpen(false);
                  setChatModalOpen(true);
                })
              }
              onClick={() =>
                fireOnce(() => {
                  setOpen(false);
                  setChatModalOpen(true);
                })
              }
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
                color: loading ? 'var(--ink-30)' : 'var(--on-surface)',
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
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 14, flexShrink: 0 }}
                aria-hidden
              >
                chat_bubble
              </span>
              <span>Ask {mageName} about this page</span>
            </button>
            <button
              type="button"
              onPointerUp={() =>
                fireOnce(() => {
                  setOpen(false);
                  setPathModalOpen(true);
                })
              }
              onClick={() =>
                fireOnce(() => {
                  setOpen(false);
                  setPathModalOpen(true);
                })
              }
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
                color: loading ? 'var(--ink-30)' : 'var(--on-surface)',
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
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 14, flexShrink: 0 }}
                aria-hidden
              >
                school
              </span>
              <span>Generate study path from this notebook</span>
            </button>

            {onEssayCheck && (
              <>
                <div
                  style={{
                    height: '1px',
                    background: 'rgba(174,137,255,0.20)',
                    margin: '4px 8px',
                  }}
                />
                <button
                  type="button"
                  onPointerUp={() =>
                    fireOnce(() => {
                      setOpen(false);
                      onEssayCheck();
                    })
                  }
                  onClick={() =>
                    fireOnce(() => {
                      setOpen(false);
                      onEssayCheck();
                    })
                  }
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
                    color: loading ? 'var(--ink-30)' : 'var(--on-surface)',
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
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 14, flexShrink: 0 }}
                    aria-hidden
                  >
                    spellcheck
                  </span>
                  <span>Check Grammar & Spelling</span>
                </button>
              </>
            )}
          </div>,
          document.body
        )}
      {chatModalOpen && (
        <CreateChatModal
          defaultNotebookId={notebookId}
          defaultContextPageIds={[pageId]}
          onClose={() => setChatModalOpen(false)}
          onCreate={(chatId) => {
            setChatModalOpen(false);
            router.push(`/learn/chats/${chatId}`);
          }}
        />
      )}
      {pathModalOpen && (
        <LearnPathSetup
          defaultNotebookId={notebookId}
          defaultNotebookName={notebookName}
          onClose={() => setPathModalOpen(false)}
        />
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
