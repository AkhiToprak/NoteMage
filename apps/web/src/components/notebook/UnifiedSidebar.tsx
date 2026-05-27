'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ContextualMascot, useMascotContextPose } from '@/components/mascot';
import { CanvasIcon, TextFileIcon } from '@/components/icons/NavIcons';
import { useNotebookWorkspace } from '@/components/notebook/NotebookWorkspaceContext';
import { getSectionColor } from '@/components/notebook/SectionListItem';
import type { SectionNode } from '@/components/notebook/SectionTree';
import PageTypeSelector from '@/components/notebook/PageTypeSelector';
import ExportDialog from '@/components/notebook/ExportDialog';
import ImportNotebookDialog from '@/components/notebook/ImportNotebookDialog';
import LearnPathSetup from '@/components/learn/LearnPathSetup';
import { useSearch } from '@/hooks/useSearch';
import SearchDropdown from '@/components/search/SearchDropdown';
import TimerWidget from '@/components/layout/TimerWidget';

/* ═══════════════════════════════════════════════════════════════════════════
   UnifiedSidebar — OneNote-style sidebar with Files + Chats
   ═══════════════════════════════════════════════════════════════════════════ */

export default function UnifiedSidebar() {
  const {
    notebookId,
    notebook,
    sections,
    studyPlans,
    refreshSections,
    refreshStudyPlans,
    setSidebarCollapsed,
  } = useNotebookWorkspace();
  const mascotContext = useMascotContextPose();

  const [isCreatingSection, setIsCreatingSection] = useState(false);
  const [sectionDraft, setSectionDraft] = useState('');
  const sectionInputRef = useRef<HTMLInputElement>(null);
  const accentColor = notebook?.color || '#8c52ff';

  // Workspace search
  const {
    query: wsSearchQuery,
    setQuery: setWsSearchQuery,
    results: wsSearchResults,
    isLoading: wsSearchLoading,
    clearResults: wsClearResults,
  } = useSearch('workspace', notebookId);
  const [wsSearchFocused, setWsSearchFocused] = useState(false);
  const isSearchActive = wsSearchQuery.length >= 2;

  // Export dialog
  const [showExportDialog, setShowExportDialog] = useState(false);

  // Import dialog
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Learn path setup modal — opens the same flow as /learn/paths,
  // scoped to this notebook by default (its files appear as the
  // initial inventory; user can still uncheck or pull in materials
  // from other notebooks inside the modal).
  const [showPathSetup, setShowPathSetup] = useState(false);

  useEffect(() => {
    if (isCreatingSection && sectionInputRef.current) sectionInputRef.current.focus();
  }, [isCreatingSection]);

  const handleCreateSection = useCallback(async () => {
    const title = sectionDraft.trim();
    if (!title) {
      setIsCreatingSection(false);
      setSectionDraft('');
      return;
    }
    try {
      await fetch(`/api/notebooks/${notebookId}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      setSectionDraft('');
      setIsCreatingSection(false);
      refreshSections();
    } catch {
      setIsCreatingSection(false);
      setSectionDraft('');
    }
  }, [notebookId, sectionDraft, refreshSections]);

  return (
    <aside
      style={{
        width: '280px',
        minWidth: '280px',
        background: 'var(--background)',
        borderRight: '1px solid rgba(174,137,255,0.22)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        fontFamily: 'inherit',
      }}
    >
      {/* ── Header: Logo + Notebook name ────────────────────────────── */}
      <div
        style={{
          padding: '14px 14px 10px',
          borderBottom: '1px solid rgba(174,137,255,0.22)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <Link
          href="/dashboard"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          <ContextualMascot
            pose={mascotContext.pose}
            idle={mascotContext.idle}
            alt="NoteMage mascot"
          />
          <span
            style={{
              fontFamily: 'var(--font-brand)',
              fontSize: 20,
              fontWeight: 500,
              letterSpacing: '0.02em',
              color: '#ae89ff',
              lineHeight: 1,
              whiteSpace: 'nowrap',
            }}
          >
            NoteMage
          </span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Link
            href="/notebooks"
            title="Back to notebooks"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '22px',
              height: '22px',
              borderRadius: '5px',
              background: 'transparent',
              border: 'none',
              textDecoration: 'none',
              color: 'var(--ink-40)',
              flexShrink: 0,
              transition: 'color 0.12s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.color = 'var(--ink-80)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.color = 'var(--ink-40)';
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>arrow_back</span>
          </Link>
          <div
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: accentColor,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--on-surface)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              minWidth: 0,
            }}
          >
            {notebook?.name ?? '...'}
          </span>
          <TimerWidget compact />
          <button
            onClick={() => setSidebarCollapsed(true)}
            title="Collapse sidebar"
            style={{
              width: 22,
              height: 22,
              borderRadius: 5,
              background: 'transparent',
              border: 'none',
              color: 'var(--ink-40)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              padding: 0,
              transition: 'color 0.12s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--ink-80)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--ink-40)';
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>keyboard_double_arrow_left</span>
          </button>
        </div>
      </div>

      {/* ── Search bar ─────────────────────────────────────────────── */}
      <div style={{ padding: '8px 10px 4px', position: 'relative' }}>
        <div style={{ position: 'relative' }}>
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: 14,
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: wsSearchFocused ? '#ae89ff' : 'var(--ink-30)',
              transition: 'color 0.15s',
              pointerEvents: 'none',
            }}
            aria-hidden
          >
            search
          </span>
          <input
            type="text"
            placeholder="Search in notebook…"
            value={wsSearchQuery}
            onChange={(e) => setWsSearchQuery(e.target.value)}
            onFocus={() => setWsSearchFocused(true)}
            onBlur={() => setWsSearchFocused(false)}
            style={{
              width: '100%',
              padding: '6px 28px 6px 30px',
              borderRadius: 8,
              border: `1px solid ${wsSearchFocused ? 'rgba(174,137,255,0.35)' : 'rgba(140,82,255,0.1)'}`,
              background: wsSearchFocused ? 'rgba(174,137,255,0.06)' : 'var(--ink-04)',
              color: 'var(--on-surface)',
              fontSize: 12,
              outline: 'none',
              fontFamily: 'inherit',
              transition: 'border-color 0.15s, background 0.15s',
              boxSizing: 'border-box',
            }}
          />
          {wsSearchQuery && (
            <button
              onClick={() => wsClearResults()}
              style={{
                position: 'absolute',
                right: 6,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 16,
                height: 16,
                borderRadius: 4,
                border: 'none',
                padding: 0,
                background: 'var(--ink-12)',
                color: 'var(--ink-50)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Scrollable body: Files + Chats ──────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* ── Search results (replaces tree when searching) ──────── */}
        {isSearchActive && (
          <SearchDropdown
            query={wsSearchQuery}
            results={wsSearchResults}
            isLoading={wsSearchLoading}
            isVisible={true}
            onClose={() => wsClearResults()}
            context="workspace"
            compact
          />
        )}

        {/* ── Normal tree (hidden during search) ─────────────────── */}
        {!isSearchActive && (
          <>
            {/* ── FILES section ──────────────────────────────────────── */}
            <div style={{ padding: '10px 0 0' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 14px 6px',
                }}
              >
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--ink-50)',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                  }}
                >
                  Sections
                </span>
                <button
                  onClick={() => setIsCreatingSection(true)}
                  title="Add section"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '18px',
                    height: '18px',
                    borderRadius: '4px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: 'var(--ink-20)',
                    padding: 0,
                    transition: 'color 0.12s ease',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-70)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-20)';
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }} aria-hidden>add</span>
                </button>
              </div>

              {/* Section tree */}
              {sections.map((section) => (
                <SectionTreeItem key={section.id} section={section} />
              ))}

              {/* Inline section creation */}
              {isCreatingSection && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderLeft: '3px solid rgba(140,82,255,0.4)',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 12, color: 'var(--ink-30)', flexShrink: 0 }} aria-hidden>create_new_folder</span>
                  <input
                    ref={sectionInputRef}
                    type="text"
                    value={sectionDraft}
                    onChange={(e) => setSectionDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateSection();
                      } else if (e.key === 'Escape') {
                        setIsCreatingSection(false);
                        setSectionDraft('');
                      }
                    }}
                    onBlur={() => {
                      if (!sectionDraft.trim()) {
                        setIsCreatingSection(false);
                        setSectionDraft('');
                      } else handleCreateSection();
                    }}
                    placeholder="Section name..."
                    style={{
                      flex: 1,
                      minWidth: 0,
                      background: 'rgba(140,82,255,0.08)',
                      border: '1px solid rgba(140,82,255,0.3)',
                      borderRadius: '4px',
                      padding: '3px 7px',
                      fontFamily: 'inherit',
                      fontSize: '12px',
                      color: 'var(--on-surface)',
                      outline: 'none',
                    }}
                  />
                </div>
              )}

              {sections.length === 0 && !isCreatingSection && (
                <div style={{ padding: '16px 14px', textAlign: 'center' }}>
                  <p
                    style={{
                      fontSize: '12px',
                      color: 'var(--ink-40)',
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    No sections yet.
                  </p>
                </div>
              )}
            </div>

            {/* ── Divider ────────────────────────────────────────────── */}
            <div
              style={{
                margin: '12px 14px',
                height: '1px',
                background: 'rgba(174,137,255,0.22)',
              }}
            />

            {/* ── PATHS group — generated paths + create CTA ─────────
                Paths live in /learn but each path knows the notebooks
                whose materials seeded it. We list every plan where this
                notebook is the primary OR appears in contextNotebookIds
                so they're discoverable from the notebook that spawned
                them. Path-generated bundles stay hidden from the sets
                lists above (filtered via sourcePathId). */}
            <div style={{ padding: '4px 0 0' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 14px 6px',
                }}
              >
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--ink-50)',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                  }}
                >
                  Paths
                </span>
                <button
                  onClick={() => setShowPathSetup(true)}
                  title="Generate a guided learning path from this notebook"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '18px',
                    height: '18px',
                    borderRadius: '4px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: 'rgba(255,222,89,0.55)',
                    padding: 0,
                    transition: 'color 0.12s ease',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = '#ffde59';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,222,89,0.55)';
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }} aria-hidden>add</span>
                </button>
              </div>

              {studyPlans.map((plan) => (
                <PathRow key={plan.id} plan={plan} />
              ))}

              {studyPlans.length === 0 && (
                <button
                  onClick={() => setShowPathSetup(true)}
                  title="Generate a guided learning path from this notebook"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '7px 14px',
                    margin: '0 6px 4px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'transparent',
                    color: 'rgba(255,222,89,0.75)',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                    width: 'calc(100% - 12px)',
                    transition: 'background 0.15s ease, color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,222,89,0.10)';
                    (e.currentTarget as HTMLButtonElement).style.color = '#ffde59';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                    (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,222,89,0.75)';
                  }}
                >
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '5px',
                      background: 'rgba(255,222,89,0.18)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 11, color: '#ffde59' }} aria-hidden>school</span>
                  </div>
                  Create learning path
                </button>
              )}
            </div>

            {/* ── Import Notebook button ──────────────────────────── */}
            <button
              onClick={() => setShowImportDialog(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 14px',
                margin: '0 6px 4px',
                borderRadius: '8px',
                border: 'none',
                background: 'transparent',
                color: 'rgba(196,169,255,0.6)',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
                width: 'calc(100% - 12px)',
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(140,82,255,0.1)';
                (e.currentTarget as HTMLButtonElement).style.color = '#c4a9ff';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = 'rgba(196,169,255,0.6)';
              }}
            >
              <div
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '5px',
                  background: 'rgba(140,82,255,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 11, color: '#c4a9ff' }} aria-hidden>upload</span>
              </div>
              Import
            </button>

            {/* ── Export Pages button ──────────────────────────────── */}
            <button
              onClick={() => setShowExportDialog(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 14px',
                margin: '0 6px 4px',
                borderRadius: '8px',
                border: 'none',
                background: 'transparent',
                color: 'rgba(196,169,255,0.6)',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
                width: 'calc(100% - 12px)',
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(140,82,255,0.1)';
                (e.currentTarget as HTMLButtonElement).style.color = '#c4a9ff';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = 'rgba(196,169,255,0.6)';
              }}
            >
              <div
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '5px',
                  background: 'rgba(140,82,255,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 11, color: '#c4a9ff' }} aria-hidden>download</span>
              </div>
              Export
            </button>

            {/* Close !isSearchActive wrapper */}
          </>
        )}
      </div>

      {/* Import Dialog modal */}
      {showImportDialog && (
        <ImportNotebookDialog
          notebookId={notebookId}
          onImported={() => {
            setShowImportDialog(false);
            refreshSections();
          }}
          onClose={() => setShowImportDialog(false)}
        />
      )}

      {/* Export Dialog modal */}
      {showExportDialog && (
        <ExportDialog
          notebookId={notebookId}
          sections={sections}
          onClose={() => setShowExportDialog(false)}
        />
      )}

      {/* Learn-path setup modal — same component as /learn/paths, but
          scoped to this notebook so the inventory is pre-filtered and
          the AI tab anchors on the notebook id by default. Refresh the
          Paths group on close so a freshly-generated plan appears. */}
      {showPathSetup && (
        <LearnPathSetup
          defaultNotebookId={notebookId}
          defaultNotebookName={notebook?.name}
          onClose={() => {
            setShowPathSetup(false);
            refreshStudyPlans();
          }}
        />
      )}
    </aside>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PathRow — A learn path generated from (or seeded by) this notebook
   ═══════════════════════════════════════════════════════════════════════════ */

function PathRow({
  plan,
}: {
  plan: { id: string; title: string; source: string; _count: { phases: number } };
}) {
  const [hovered, setHovered] = useState(false);
  const phaseCount = plan._count.phases;

  return (
    <Link
      href={`/learn/paths/${plan.id}`}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          paddingLeft: '14px',
          paddingRight: '8px',
          paddingTop: '6px',
          paddingBottom: '6px',
          background: hovered ? 'rgba(255,222,89,0.08)' : 'transparent',
          borderLeft: hovered ? '3px solid rgba(255,222,89,0.55)' : '3px solid transparent',
          transition: 'background 0.12s ease, border-color 0.12s ease',
          cursor: 'pointer',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: 13,
            color: hovered ? '#ffde59' : 'rgba(255,222,89,0.55)',
            flexShrink: 0,
            transition: 'color 0.12s ease',
          }}
          aria-hidden
        >
          school
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: 'inherit',
            fontSize: '13px',
            fontWeight: 500,
            color: hovered ? '#f0edff' : 'var(--ink-70)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {plan.title}
        </span>
        {phaseCount > 0 && (
          <span
            style={{
              fontFamily: 'inherit',
              fontSize: '11px',
              color: 'var(--ink-40)',
              flexShrink: 0,
            }}
          >
            {phaseCount}
          </span>
        )}
      </div>
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SectionTreeItem — Recursive section with inline pages (OneNote-style)
   ═══════════════════════════════════════════════════════════════════════════ */

function SectionTreeItem({ section, depth = 0 }: { section: SectionNode; depth?: number }) {
  const router = useRouter();
  const {
    activeSectionId,
    setActiveSectionId,
    notebookId,
    refreshSections,
    activePageId,
    activeFlashcardSetId,
    activeQuizSetId,
  } = useNotebookWorkspace();

  const [expanded, setExpanded] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [isCreatingChild, setIsCreatingChild] = useState(false);
  const [childDraft, setChildDraft] = useState('');
  const [isCreatingPage, setIsCreatingPage] = useState(false);
  const [pageDraft, setPageDraft] = useState('');
  const [showPageTypeSelector, setShowPageTypeSelector] = useState(false);
  const [pendingPageType, setPendingPageType] = useState<'text' | 'canvas'>('text');
  const childInputRef = useRef<HTMLInputElement>(null);
  const pageInputRef = useRef<HTMLInputElement>(null);

  const isActive = activeSectionId === section.id;
  const color = getSectionColor(section);
  const hasChildren = section.children.length > 0;
  const hasPages = section.pages.length > 0;
  const hasFlashcardSets = (section.flashcardSets?.length ?? 0) > 0;
  const hasContent =
    hasChildren || hasPages || hasFlashcardSets || isCreatingChild || isCreatingPage;

  useEffect(() => {
    if (isCreatingChild && childInputRef.current) childInputRef.current.focus();
  }, [isCreatingChild]);

  useEffect(() => {
    if (isCreatingPage && pageInputRef.current) pageInputRef.current.focus();
  }, [isCreatingPage]);

  const handleDelete = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!window.confirm(`Delete section "${section.title}" and all its pages?`)) return;
      try {
        await fetch(`/api/notebooks/${notebookId}/sections/${section.id}`, { method: 'DELETE' });
        refreshSections();
      } catch {
        /* silent */
      }
    },
    [notebookId, section.id, section.title, refreshSections]
  );

  const handleAddSubsection = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(true);
    setIsCreatingChild(true);
  }, []);

  const handleCreateChild = useCallback(async () => {
    const title = childDraft.trim();
    if (!title) {
      setIsCreatingChild(false);
      setChildDraft('');
      return;
    }
    try {
      await fetch(`/api/notebooks/${notebookId}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, parentId: section.id }),
      });
      setChildDraft('');
      setIsCreatingChild(false);
      refreshSections();
    } catch {
      setIsCreatingChild(false);
      setChildDraft('');
    }
  }, [notebookId, section.id, childDraft, refreshSections]);

  const handleAddPage = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(true);
    setShowPageTypeSelector(true);
  }, []);

  const handlePageTypeSelected = useCallback((type: 'text' | 'canvas') => {
    setPendingPageType(type);
    setShowPageTypeSelector(false);
    setIsCreatingPage(true);
  }, []);

  const handleCreatePage = useCallback(async () => {
    const title = pageDraft.trim() || 'Untitled';
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/sections/${section.id}/pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, pageType: pendingPageType }),
      });
      const json = await res.json();
      setPageDraft('');
      setIsCreatingPage(false);
      setPendingPageType('text');
      refreshSections();
      if (json.success && json.data?.id) {
        router.push(`/notebooks/${notebookId}/pages/${json.data.id}`);
      }
    } catch {
      setIsCreatingPage(false);
      setPageDraft('');
    }
  }, [notebookId, section.id, pageDraft, pendingPageType, refreshSections, router]);

  const handleDeletePage = useCallback(
    async (pageId: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await fetch(`/api/notebooks/${notebookId}/pages/${pageId}`, { method: 'DELETE' });
        refreshSections();
        if (activePageId === pageId) router.push(`/notebooks/${notebookId}`);
      } catch {
        /* silent */
      }
    },
    [notebookId, activePageId, router, refreshSections]
  );

  const handleDeleteFlashcardSet = useCallback(
    async (setId: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await fetch(`/api/notebooks/${notebookId}/flashcard-sets/${setId}`, { method: 'DELETE' });
        refreshSections();
        if (activeFlashcardSetId === setId) router.push(`/notebooks/${notebookId}`);
      } catch {
        /* silent */
      }
    },
    [notebookId, activeFlashcardSetId, router, refreshSections]
  );

  const handleDeleteQuizSet = useCallback(
    async (setId: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await fetch(`/api/notebooks/${notebookId}/quiz-sets/${setId}`, { method: 'DELETE' });
        refreshSections();
        if (activeQuizSetId === setId) router.push(`/notebooks/${notebookId}`);
      } catch {
        /* silent */
      }
    },
    [notebookId, activeQuizSetId, router, refreshSections]
  );

  const paddingLeft = 12 + depth * 14;

  return (
    <>
      {/* ── Section row ─────────────────────────────────────────── */}
      <div
        onClick={() => {
          setActiveSectionId(section.id);
          setExpanded(true);
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          paddingLeft: `${paddingLeft}px`,
          paddingRight: '6px',
          paddingTop: '7px',
          paddingBottom: '7px',
          cursor: 'pointer',
          background: isActive
            ? 'rgba(140,82,255,0.12)'
            : hovered
              ? 'var(--ink-04)'
              : 'transparent',
          borderLeft: `3px solid ${isActive ? color : hovered ? color + '80' : color + '50'}`,
          transition: 'background 0.12s ease, border-color 0.12s ease',
          userSelect: 'none',
        }}
      >
        {/* Expand/collapse chevron */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          style={{
            display: 'flex',
            flexShrink: 0,
            color: 'var(--ink-30)',
            marginLeft: '-4px',
            width: '14px',
          }}
        >
          {hasContent ? (
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: 13,
                transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.12s ease',
              }}
              aria-hidden
            >
              chevron_right
            </span>
          ) : (
            <div style={{ width: '13px' }} />
          )}
        </div>

        {/* Section title */}
        <span
          style={{
            flex: 1,
            fontFamily: 'inherit',
            fontSize: depth === 0 ? '14px' : '13px',
            fontWeight: isActive ? 600 : 400,
            color: isActive ? '#f0edff' : 'var(--ink-80)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
        >
          {section.title}
        </span>

        {/* Hover actions */}
        {hovered && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
            {/* New page in this section */}
            <button
              onClick={handleAddPage}
              title="New page"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--ink-30)',
                padding: 0,
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = '#69d2a0';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-30)';
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 11 }} aria-hidden>note_add</span>
            </button>
            {/* Add subsection */}
            <button
              onClick={handleAddSubsection}
              title="Add subsection"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--ink-30)',
                padding: 0,
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = '#a47bff';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-30)';
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 11 }} aria-hidden>create_new_folder</span>
            </button>
            {/* Delete section */}
            <button
              onClick={handleDelete}
              title="Delete section"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--ink-30)',
                padding: 0,
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-30)';
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 11 }} aria-hidden>delete</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Expanded children: pages + subsections ──────────────── */}
      {expanded && (
        <>
          {/* Pages inside this section */}
          {section.pages.map((page) => {
            const isPageActive = page.id === activePageId;
            return (
              <PageTreeRow
                key={page.id}
                page={page}
                isActive={isPageActive}
                notebookId={notebookId}
                accentColor={color}
                depth={depth}
                onDelete={handleDeletePage}
              />
            );
          })}

          {/* Flashcard sets inside this section */}
          {section.flashcardSets?.map((fc) => {
            const isFcActive = fc.id === activeFlashcardSetId;
            return (
              <FlashcardSetTreeRow
                key={fc.id}
                flashcardSet={fc}
                isActive={isFcActive}
                notebookId={notebookId}
                accentColor={color}
                depth={depth}
                onDelete={handleDeleteFlashcardSet}
              />
            );
          })}

          {/* Quiz sets inside this section */}
          {section.quizSets?.map((qs) => {
            const isQsActive = qs.id === activeQuizSetId;
            return (
              <QuizSetTreeRow
                key={qs.id}
                quizSet={qs}
                isActive={isQsActive}
                notebookId={notebookId}
                accentColor={color}
                depth={depth}
                onDelete={handleDeleteQuizSet}
              />
            );
          })}

          {/* Inline page creation */}
          {isCreatingPage && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                paddingLeft: `${paddingLeft + 18}px`,
                paddingRight: '8px',
                paddingTop: '5px',
                paddingBottom: '5px',
                borderLeft: `3px solid ${color}60`,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 11, color: 'var(--ink-30)', flexShrink: 0 }} aria-hidden>note_add</span>
              <input
                ref={pageInputRef}
                type="text"
                value={pageDraft}
                onChange={(e) => setPageDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreatePage();
                  } else if (e.key === 'Escape') {
                    setIsCreatingPage(false);
                    setPageDraft('');
                  }
                }}
                onBlur={() => {
                  if (!pageDraft.trim()) {
                    setIsCreatingPage(false);
                    setPageDraft('');
                  } else handleCreatePage();
                }}
                placeholder="Page title..."
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'rgba(140,82,255,0.08)',
                  border: '1px solid rgba(140,82,255,0.3)',
                  borderRadius: '4px',
                  padding: '3px 7px',
                  fontFamily: 'inherit',
                  fontSize: '12px',
                  color: 'var(--on-surface)',
                  outline: 'none',
                }}
              />
            </div>
          )}

          {/* Subsection creation input */}
          {isCreatingChild && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                paddingLeft: `${paddingLeft + 18}px`,
                paddingRight: '8px',
                paddingTop: '5px',
                paddingBottom: '5px',
                borderLeft: '3px solid rgba(140,82,255,0.4)',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 11, color: 'var(--ink-30)', flexShrink: 0 }} aria-hidden>create_new_folder</span>
              <input
                ref={childInputRef}
                type="text"
                value={childDraft}
                onChange={(e) => setChildDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateChild();
                  } else if (e.key === 'Escape') {
                    setIsCreatingChild(false);
                    setChildDraft('');
                  }
                }}
                onBlur={() => {
                  if (!childDraft.trim()) {
                    setIsCreatingChild(false);
                    setChildDraft('');
                  } else handleCreateChild();
                }}
                placeholder="Subsection name..."
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'rgba(140,82,255,0.08)',
                  border: '1px solid rgba(140,82,255,0.3)',
                  borderRadius: '4px',
                  padding: '3px 7px',
                  fontFamily: 'inherit',
                  fontSize: '12px',
                  color: 'var(--on-surface)',
                  outline: 'none',
                }}
              />
            </div>
          )}

          {/* Child sections (recursive) */}
          {section.children.map((child) => (
            <SectionTreeItem key={child.id} section={child} depth={depth + 1} />
          ))}
        </>
      )}

      {/* Page type selector modal */}
      {showPageTypeSelector && (
        <PageTypeSelector
          onSelect={handlePageTypeSelected}
          onCancel={() => setShowPageTypeSelector(false)}
        />
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PageTreeRow — A page nested inside a section tree
   ═══════════════════════════════════════════════════════════════════════════ */

function PageTreeRow({
  page,
  isActive,
  notebookId,
  accentColor,
  depth,
  onDelete,
}: {
  page: { id: string; title: string; pageType?: string };
  isActive: boolean;
  notebookId: string;
  accentColor: string;
  depth: number;
  onDelete: (id: string, e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const paddingLeft = 12 + depth * 14 + 18; // indent under section

  return (
    <Link
      href={`/notebooks/${notebookId}/pages/${page.id}`}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          paddingLeft: `${paddingLeft}px`,
          paddingRight: '8px',
          paddingTop: '5px',
          paddingBottom: '5px',
          background: isActive ? `${accentColor}18` : hovered ? 'var(--ink-04)' : 'transparent',
          borderLeft: isActive ? `3px solid ${accentColor}` : '3px solid transparent',
          transition: 'background 0.1s ease',
          cursor: 'pointer',
        }}
      >
        {page.pageType === 'canvas' ? (
          <CanvasIcon size={12} color={isActive ? '#ffde59' : 'rgba(255,222,89,0.35)'} />
        ) : (
          <TextFileIcon size={12} color={isActive ? accentColor : 'var(--ink-20)'} />
        )}
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: 'inherit',
            fontSize: '13px',
            fontWeight: isActive ? 600 : 400,
            color: isActive ? '#f0edff' : 'var(--ink-70)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {page.title}
        </span>
        {hovered && !isActive && (
          <button
            onClick={(e) => onDelete(page.id, e)}
            title="Delete page"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '18px',
              height: '18px',
              borderRadius: '3px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--ink-30)',
              padding: 0,
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-30)';
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 11 }} aria-hidden>delete</span>
          </button>
        )}
      </div>
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   FlashcardSetTreeRow — A flashcard set nested inside a section tree
   ═══════════════════════════════════════════════════════════════════════════ */

function FlashcardSetTreeRow({
  flashcardSet,
  isActive,
  notebookId,
  accentColor,
  depth,
  onDelete,
}: {
  flashcardSet: { id: string; title: string };
  isActive: boolean;
  notebookId: string;
  accentColor: string;
  depth: number;
  onDelete?: (setId: string, e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const paddingLeft = 12 + depth * 14 + 18;

  return (
    <Link
      href={`/notebooks/${notebookId}/flashcards/${flashcardSet.id}`}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          paddingLeft: `${paddingLeft}px`,
          paddingRight: '8px',
          paddingTop: '5px',
          paddingBottom: '5px',
          background: isActive ? `${accentColor}18` : hovered ? 'var(--ink-04)' : 'transparent',
          borderLeft: isActive ? `3px solid ${accentColor}` : '3px solid transparent',
          transition: 'background 0.1s ease',
          cursor: 'pointer',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 12, color: isActive ? accentColor : 'rgba(140,82,255,0.45)', flexShrink: 0 }}
          aria-hidden
        >
          layers
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: 'inherit',
            fontSize: '12px',
            fontWeight: isActive ? 600 : 400,
            color: isActive ? '#f0edff' : 'var(--ink-70)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {flashcardSet.title}
        </span>
        {hovered && onDelete && (
          <button
            onClick={(e) => onDelete(flashcardSet.id, e)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '18px',
              height: '18px',
              borderRadius: '4px',
              background: 'transparent',
              border: 'none',
              color: 'rgba(196,169,255,0.2)',
              cursor: 'pointer',
              flexShrink: 0,
              padding: 0,
              transition: 'color 0.12s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(252,165,165,0.8)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(196,169,255,0.2)';
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 11 }} aria-hidden>delete</span>
          </button>
        )}
      </div>
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   QuizSetTreeRow — A quiz set nested inside a section tree
   ═══════════════════════════════════════════════════════════════════════════ */

function QuizSetTreeRow({
  quizSet,
  isActive,
  notebookId,
  accentColor,
  depth,
  onDelete,
}: {
  quizSet: { id: string; title: string };
  isActive: boolean;
  notebookId: string;
  accentColor: string;
  depth: number;
  onDelete?: (setId: string, e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const paddingLeft = 12 + depth * 14 + 18;

  return (
    <Link
      href={`/notebooks/${notebookId}/quizzes/${quizSet.id}`}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          paddingLeft: `${paddingLeft}px`,
          paddingRight: '8px',
          paddingTop: '5px',
          paddingBottom: '5px',
          background: isActive ? `${accentColor}18` : hovered ? 'var(--ink-04)' : 'transparent',
          borderLeft: isActive ? `3px solid ${accentColor}` : '3px solid transparent',
          transition: 'background 0.1s ease',
          cursor: 'pointer',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 12, color: isActive ? accentColor : 'rgba(81,112,255,0.45)', flexShrink: 0 }}
          aria-hidden
        >
          help
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: 'inherit',
            fontSize: '12px',
            fontWeight: isActive ? 600 : 400,
            color: isActive ? '#f0edff' : 'var(--ink-70)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {quizSet.title}
        </span>
        {hovered && onDelete && (
          <button
            onClick={(e) => onDelete(quizSet.id, e)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '18px',
              height: '18px',
              borderRadius: '4px',
              background: 'transparent',
              border: 'none',
              color: 'rgba(196,169,255,0.2)',
              cursor: 'pointer',
              flexShrink: 0,
              padding: 0,
              transition: 'color 0.12s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(252,165,165,0.8)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(196,169,255,0.2)';
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 11 }} aria-hidden>delete</span>
          </button>
        )}
      </div>
    </Link>
  );
}
