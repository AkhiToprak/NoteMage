'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CoworkInvitePayload } from '@/lib/cowork-join';
import {
  coworkPageUrl,
  registerHostedCoworkSession,
} from '@/lib/cowork-join';

/**
 * Modal the host opens from the chat `+` popover to start a co-work
 * session on a specific page. Two-step picker:
 *
 *   Step 1: list of the host's notebooks
 *   Step 2: sections + pages within the chosen notebook
 *
 * On confirm this modal:
 *   1. POST /api/notebooks/[id]/cowork  → creates the CoWorkSession
 *   2. Fires `onCreated(payload)` so the parent can post a
 *      `type: 'cowork_invite'` message to the group chat
 *   3. Persists the session id via `registerHostedCoworkSession()`
 *   4. Navigates the host to the session deep link
 *
 * Visual vocabulary is copied from the landing `CoworkSpotlight` —
 * dark glass card, purple borders, a `MockFrame`-style preview pane.
 */

const DEFAULT_NOTEBOOK_COLOR = '#ae89ff';

interface Notebook {
  id: string;
  name: string;
  color: string | null;
  subject: string | null;
  /**
   * The list endpoint enriches each notebook with a `_count.pages` total
   * (see app/api/notebooks/route.ts lines 44–48 — it sums section page
   * counts and strips the sections array). Don't try to read sections here.
   */
  _count?: { sections: number; documents: number; pages: number };
}

interface Section {
  id: string;
  title: string;
  color: string | null;
  sortOrder: number;
  pages: Array<{
    id: string;
    title: string;
    pageType: 'text' | 'canvas';
    sortOrder: number;
  }>;
}

interface StartCoworkModalProps {
  open: boolean;
  onClose: () => void;
  /** Group where the invite message will be posted. */
  groupId: string;
  /** Group display name used in the header copy. */
  groupName: string;
  /** Current user id (the host). */
  currentUserId: string;
  /** Called after the session is created and the host is about to be redirected.
   *  Parent should forward this payload to its sendMessage call. */
  onCreated: (payload: CoworkInvitePayload) => void;
}

type Step = 'notebook' | 'page';

export default function StartCoworkModal({
  open,
  onClose,
  groupId,
  groupName,
  currentUserId,
  onCreated,
}: StartCoworkModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('notebook');
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loadingNotebooks, setLoadingNotebooks] = useState(false);
  const [selectedNotebook, setSelectedNotebook] = useState<Notebook | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [loadingSections, setLoadingSections] = useState(false);
  const [selectedPage, setSelectedPage] = useState<{
    id: string;
    title: string;
    pageType: 'text' | 'canvas';
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state every time the modal opens
  useEffect(() => {
    if (!open) return;
    setStep('notebook');
    setSelectedNotebook(null);
    setSelectedPage(null);
    setError(null);
    setSections([]);
  }, [open]);

  // Fetch notebooks on open
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingNotebooks(true);
      try {
        const res = await fetch('/api/notebooks?folderId=all');
        if (!res.ok) throw new Error('fetch');
        const json = await res.json();
        const list = (json?.data || []) as Notebook[];
        if (!cancelled) setNotebooks(list);
      } catch {
        if (!cancelled) setError('Could not load notebooks.');
      } finally {
        if (!cancelled) setLoadingNotebooks(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Fetch sections when a notebook is selected
  const pickNotebook = useCallback(async (notebook: Notebook) => {
    setSelectedNotebook(notebook);
    setSelectedPage(null);
    setStep('page');
    setLoadingSections(true);
    setError(null);
    try {
      const res = await fetch(`/api/notebooks/${notebook.id}/sections`);
      if (!res.ok) throw new Error('fetch');
      const json = await res.json();
      setSections((json?.data || []) as Section[]);
    } catch {
      setError('Could not load pages for this notebook.');
    } finally {
      setLoadingSections(false);
    }
  }, []);

  const backToNotebooks = () => {
    setStep('notebook');
    setSelectedNotebook(null);
    setSelectedPage(null);
    setSections([]);
  };

  const handleStart = async () => {
    if (!selectedNotebook || !selectedPage || creating) return;
    setCreating(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/notebooks/${selectedNotebook.id}/cowork`,
        { method: 'POST' }
      );

      if (res.status === 409) {
        setError(
          'This notebook already has an active session. End it first or join the existing one.'
        );
        setCreating(false);
        return;
      }
      if (!res.ok) {
        setError('Could not start the session. Try again.');
        setCreating(false);
        return;
      }

      const json = await res.json();
      const session = json?.data;
      if (!session?.id) {
        setError('Server did not return a session id.');
        setCreating(false);
        return;
      }

      const payload: CoworkInvitePayload = {
        sessionId: session.id,
        notebookId: selectedNotebook.id,
        pageId: selectedPage.id,
        pageType: selectedPage.pageType,
        pageTitle: selectedPage.title || 'Untitled',
        notebookName: selectedNotebook.name,
        notebookColor: selectedNotebook.color,
        hostId: currentUserId,
        startedAt: new Date().toISOString(),
      };

      // Fire the callback so the parent GroupChat posts the invite
      // message. Do this BEFORE navigating so the message is in flight
      // before we leave the chat route.
      onCreated(payload);

      registerHostedCoworkSession(payload);
      onClose();
      // Carry the origin group id so the host lands back in this chat
      // when they end the session.
      router.push(coworkPageUrl(payload, groupId));
    } catch {
      setError('Network error. Try again.');
      setCreating(false);
    }
  };

  if (!open) return null;

  const totalPageCount = (n: Notebook) => n._count?.pages ?? 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Start co-work session"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(9, 8, 26, 0.82)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 640,
          maxHeight: 'calc(100vh - 48px)',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 24,
          background:
            'linear-gradient(180deg, rgba(28, 24, 56, 0.92) 0%, rgba(14, 12, 34, 0.94) 100%)',
          border: '1px solid rgba(174, 137, 255, 0.32)',
          boxShadow:
            '0 48px 120px rgba(140, 82, 255, 0.22), 0 16px 48px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
          overflow: 'hidden',
        }}
      >
        {/* Header glow */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: -80,
            right: -80,
            width: 240,
            height: 240,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(81, 112, 255, 0.22) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Header */}
        <div
          style={{
            position: 'relative',
            padding: '24px 28px 16px',
            borderBottom: '1px solid rgba(174, 137, 255, 0.12)',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 12px',
              borderRadius: 999,
              background: 'rgba(174, 137, 255, 0.12)',
              border: '1px solid rgba(174, 137, 255, 0.3)',
              fontFamily: 'var(--font-brand)',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--primary)',
              marginBottom: 12,
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 14, color: 'var(--primary)' }}
            >
              groups
            </span>
            Start co-work · in {groupName}
          </div>

          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: '-0.025em',
              color: '#eeecff',
              lineHeight: 1.1,
            }}
          >
            {step === 'notebook'
              ? 'Pick a notebook.'
              : `${selectedNotebook?.name ?? ''} — pick a page.`}
          </h2>
          <p
            style={{
              margin: '6px 0 0 0',
              fontSize: 12,
              color: 'rgba(237, 233, 255, 0.5)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Everyone in this chat will see a join invite.
          </p>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              width: 32,
              height: 32,
              borderRadius: 10,
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: 'rgba(237, 233, 255, 0.7)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              close
            </span>
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 28px',
            minHeight: 240,
          }}
        >
          {error && (
            <div
              role="alert"
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                background: 'rgba(253, 111, 133, 0.1)',
                border: '1px solid rgba(253, 111, 133, 0.35)',
                color: '#fd6f85',
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          {step === 'notebook' && (
            <>
              {loadingNotebooks && (
                <div
                  style={{
                    padding: 40,
                    textAlign: 'center',
                    color: 'rgba(237, 233, 255, 0.5)',
                    fontSize: 13,
                  }}
                >
                  Loading notebooks…
                </div>
              )}
              {!loadingNotebooks && notebooks.length === 0 && (
                <div
                  style={{
                    padding: 40,
                    textAlign: 'center',
                    color: 'rgba(237, 233, 255, 0.55)',
                    fontSize: 13,
                  }}
                >
                  You don&apos;t have any notebooks yet. Create one first.
                </div>
              )}
              {!loadingNotebooks && notebooks.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {notebooks.map((notebook) => {
                    const color = notebook.color || DEFAULT_NOTEBOOK_COLOR;
                    return (
                      <button
                        key={notebook.id}
                        type="button"
                        onClick={() => pickNotebook(notebook)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 14,
                          padding: '14px 16px',
                          borderRadius: 14,
                          background: 'rgba(255, 255, 255, 0.025)',
                          border: '1px solid rgba(174, 137, 255, 0.18)',
                          color: '#eeecff',
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontFamily: 'var(--font-sans)',
                          transition:
                            'transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), background 0.2s, border-color 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background =
                            'rgba(174, 137, 255, 0.1)';
                          e.currentTarget.style.borderColor = `${color}66`;
                          e.currentTarget.style.transform = 'translateY(-1px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background =
                            'rgba(255, 255, 255, 0.025)';
                          e.currentTarget.style.borderColor =
                            'rgba(174, 137, 255, 0.18)';
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            flexShrink: 0,
                            background: `${color}22`,
                            border: `1px solid ${color}55`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: `0 0 16px ${color}22`,
                          }}
                        >
                          <span
                            className="material-symbols-outlined"
                            style={{ fontSize: 18, color }}
                          >
                            menu_book
                          </span>
                        </span>
                        <div
                          style={{
                            flex: 1,
                            minWidth: 0,
                            display: 'flex',
                            flexDirection: 'column',
                          }}
                        >
                          <span
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: '#eeecff',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {notebook.name}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              color: 'rgba(237, 233, 255, 0.45)',
                              fontFamily: 'var(--font-brand)',
                              letterSpacing: '0.04em',
                              textTransform: 'uppercase',
                              marginTop: 2,
                            }}
                          >
                            {totalPageCount(notebook)} page
                            {totalPageCount(notebook) === 1 ? '' : 's'}
                            {notebook.subject ? ` · ${notebook.subject}` : ''}
                          </span>
                        </div>
                        <span
                          className="material-symbols-outlined"
                          style={{
                            fontSize: 20,
                            color: 'rgba(237, 233, 255, 0.4)',
                          }}
                        >
                          chevron_right
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {step === 'page' && (
            <>
              {loadingSections && (
                <div
                  style={{
                    padding: 40,
                    textAlign: 'center',
                    color: 'rgba(237, 233, 255, 0.5)',
                    fontSize: 13,
                  }}
                >
                  Loading pages…
                </div>
              )}
              {!loadingSections && sections.length === 0 && (
                <div
                  style={{
                    padding: 40,
                    textAlign: 'center',
                    color: 'rgba(237, 233, 255, 0.55)',
                    fontSize: 13,
                  }}
                >
                  This notebook has no pages yet.
                </div>
              )}
              {!loadingSections && sections.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                  }}
                >
                  {sections.map((section) => (
                    <div key={section.id}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          marginBottom: 6,
                          padding: '0 4px',
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background:
                              section.color || DEFAULT_NOTEBOOK_COLOR,
                          }}
                        />
                        <span
                          style={{
                            fontFamily: 'var(--font-brand)',
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                            color: 'rgba(237, 233, 255, 0.55)',
                          }}
                        >
                          {section.title || 'Untitled section'}
                        </span>
                      </div>
                      {section.pages.length === 0 ? (
                        <div
                          style={{
                            padding: '8px 14px',
                            fontSize: 11,
                            color: 'rgba(237, 233, 255, 0.35)',
                            fontStyle: 'italic',
                          }}
                        >
                          No pages in this section
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {section.pages.map((page) => {
                            const isSelected = selectedPage?.id === page.id;
                            return (
                              <button
                                key={page.id}
                                type="button"
                                onClick={() =>
                                  setSelectedPage({
                                    id: page.id,
                                    title: page.title || 'Untitled',
                                    pageType: page.pageType,
                                  })
                                }
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 10,
                                  padding: '10px 14px',
                                  borderRadius: 10,
                                  background: isSelected
                                    ? 'rgba(255, 222, 89, 0.1)'
                                    : 'rgba(255, 255, 255, 0.02)',
                                  border: isSelected
                                    ? '1px solid rgba(255, 222, 89, 0.45)'
                                    : '1px solid rgba(174, 137, 255, 0.12)',
                                  color: '#eeecff',
                                  cursor: 'pointer',
                                  textAlign: 'left',
                                  fontFamily: 'var(--font-sans)',
                                  transition:
                                    'background 0.2s, border-color 0.2s',
                                }}
                              >
                                <span
                                  className="material-symbols-outlined"
                                  style={{
                                    fontSize: 16,
                                    color: isSelected
                                      ? '#ffde59'
                                      : page.pageType === 'canvas'
                                        ? '#b9c3ff'
                                        : 'var(--primary)',
                                  }}
                                >
                                  {page.pageType === 'canvas' ? 'draw' : 'description'}
                                </span>
                                <span
                                  style={{
                                    flex: 1,
                                    fontSize: 13,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {page.title || 'Untitled'}
                                </span>
                                {isSelected && (
                                  <span
                                    className="material-symbols-outlined"
                                    style={{
                                      fontSize: 18,
                                      color: '#ffde59',
                                    }}
                                  >
                                    check_circle
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 28px 20px',
            borderTop: '1px solid rgba(174, 137, 255, 0.12)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'rgba(9, 8, 26, 0.5)',
          }}
        >
          {step === 'page' && (
            <button
              type="button"
              onClick={backToNotebooks}
              disabled={creating}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 16px',
                borderRadius: 10,
                background: 'rgba(174, 137, 255, 0.08)',
                border: '1px solid rgba(174, 137, 255, 0.25)',
                color: 'var(--on-surface)',
                fontSize: 12,
                fontWeight: 600,
                cursor: creating ? 'wait' : 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                arrow_back
              </span>
              Back
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onClose}
            disabled={creating}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              background: 'transparent',
              border: '1px solid rgba(237, 233, 255, 0.14)',
              color: 'rgba(237, 233, 255, 0.7)',
              fontSize: 12,
              fontWeight: 600,
              cursor: creating ? 'wait' : 'pointer',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStart}
            disabled={!selectedPage || creating}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 22px',
              border: 'none',
              borderRadius: 12,
              background:
                !selectedPage || creating
                  ? 'rgba(255, 222, 89, 0.3)'
                  : 'linear-gradient(135deg, #ffde59 0%, #ffc94a 100%)',
              color: '#2a2200',
              fontSize: 13,
              fontWeight: 800,
              cursor:
                !selectedPage || creating ? 'not-allowed' : 'pointer',
              boxShadow:
                !selectedPage || creating
                  ? 'none'
                  : '0 12px 28px rgba(255, 222, 89, 0.25), inset 0 1px 0 rgba(255,255,255,0.4)',
              fontFamily: 'var(--font-sans)',
              transition:
                'transform 0.2s, box-shadow 0.2s',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: 17,
                animation: creating
                  ? 'cowork-modal-spin 1s linear infinite'
                  : 'none',
              }}
            >
              {creating ? 'progress_activity' : 'rocket_launch'}
            </span>
            {creating ? 'Starting…' : 'Start session'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes cowork-modal-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
