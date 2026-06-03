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
import FlashcardSetCreator from '@/components/notebook/FlashcardSetCreator';
import QuizSetCreator from '@/components/notebook/QuizSetCreator';
import LearnPathSetup from '@/components/learn/LearnPathSetup';
import { useSearch } from '@/hooks/useSearch';
import SearchDropdown from '@/components/search/SearchDropdown';
import TimerWidget from '@/components/layout/TimerWidget';
import NotebookExamsModal from '@/components/notebook/NotebookExamsModal';

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
    exportDialogOpen,
    setExportDialogOpen,
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

  // Export dialog — visibility lives in the workspace context so the editor
  // toolbar's page-actions menu can open the same dialog (audit item 16).

  // Import dialog
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Exams modal (per-notebook, opened from the header)
  const [showExams, setShowExams] = useState(false);

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
            <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>
              arrow_back
            </span>
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
            onClick={() => setShowExams(true)}
            title="Exams"
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
            <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>
              event
            </span>
          </button>
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
            <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>
              keyboard_double_arrow_left
            </span>
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
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }} aria-hidden>
                    add
                  </span>
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
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 12, color: 'var(--ink-30)', flexShrink: 0 }}
                    aria-hidden
                  >
                    create_new_folder
                  </span>
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
                    color: 'var(--accent-strong)',
                    padding: 0,
                    transition: 'color 0.12s ease',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.opacity = '0.8';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.opacity = '1';
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }} aria-hidden>
                    add
                  </span>
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
                    color: 'var(--accent-strong)',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                    width: 'calc(100% - 12px)',
                    transition: 'background 0.15s ease, color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      'rgba(140,82,255,0.10)';
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-strong)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-strong)';
                  }}
                >
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '5px',
                      background: 'rgba(140,82,255,0.18)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: 11, color: 'var(--accent-strong)' }}
                      aria-hidden
                    >
                      school
                    </span>
                  </div>
                  Create learning path
                </button>
              )}
            </div>

            {/* ── CHATS group ────────────────────────────────────────
                Restored to the notebook sidebar so a notebook's mage
                chats are reachable here as well as in /learn. Rows link
                to the in-notebook chat route (same record as /learn). */}
            <ChatTreeSection />

            {/* ── FLASHCARDS group — this notebook's sets (flat) ────── */}
            <FlashcardTreeSection />

            {/* ── QUIZZES group — this notebook's sets (flat) ───────── */}
            <QuizTreeSection />

            {/* ── Divider before utility actions ─────────────────────── */}
            <div
              style={{
                margin: '12px 14px',
                height: '1px',
                background: 'rgba(174,137,255,0.22)',
              }}
            />

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
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 11, color: 'var(--accent-strong)' }}
                  aria-hidden
                >
                  upload
                </span>
              </div>
              Import
            </button>

            {/* ── Export Pages button ──────────────────────────────── */}
            <button
              onClick={() => setExportDialogOpen(true)}
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
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 11, color: 'var(--accent-strong)' }}
                  aria-hidden
                >
                  download
                </span>
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

      {/* Export Dialog modal — opened from here or the editor's page-actions
          menu (audit item 16); visibility is shared via the workspace context. */}
      {exportDialogOpen && (
        <ExportDialog
          notebookId={notebookId}
          sections={sections}
          onClose={() => setExportDialogOpen(false)}
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

      {/* Exams modal — per-notebook, opened from the header event button */}
      {showExams && (
        <NotebookExamsModal
          notebookId={notebookId}
          notebookName={notebook?.name ?? ''}
          onClose={() => setShowExams(false)}
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
    <Link href={`/learn/paths/${plan.id}`} style={{ textDecoration: 'none', display: 'block' }}>
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
          background: hovered ? 'rgba(140,82,255,0.08)' : 'transparent',
          borderLeft: hovered ? '3px solid var(--accent-strong)' : '3px solid transparent',
          transition: 'background 0.12s ease, border-color 0.12s ease',
          cursor: 'pointer',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: 13,
            color: 'var(--accent-strong)',
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
   Sidebar groups — shared primitives for the Chats / Flashcards / Quizzes
   groups. They mirror the Sections / Paths header + row language.
   ═══════════════════════════════════════════════════════════════════════════ */

function SidebarGroupHeader({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
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
        {label}
      </span>
      {children}
    </div>
  );
}

function GroupAddButton({
  onClick,
  title,
}: {
  onClick: (e: React.MouseEvent) => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
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
        color: 'rgba(196,169,255,0.4)',
        padding: 0,
        transition: 'color 0.12s ease',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = 'rgba(196,169,255,0.85)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = 'rgba(196,169,255,0.4)';
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 13 }} aria-hidden>
        add
      </span>
    </button>
  );
}

// Shared one-line empty hint for the sidebar groups (chats / flashcards /
// quizzes). Standardized on --text-secondary so the muted color is consistent
// across the app's empty states, instead of the dimmer --ink-40 (items 2, 11).
function GroupEmptyHint({ text }: { text: string }) {
  return (
    <div style={{ padding: '8px 14px 10px', textAlign: 'center' }}>
      <p
        style={{
          fontSize: 'var(--fs-xs)',
          color: 'var(--text-secondary)',
          margin: 0,
          lineHeight: 'var(--lh-normal)',
        }}
      >
        {text}
      </p>
    </div>
  );
}

/* A single grouped row (chat / flashcard set / quiz set). One component for
   all three — they differ only by icon, link target and the trailing count. */
function GroupItemRow({
  href,
  icon,
  title,
  isActive,
  count,
  onDelete,
  deleteTitle,
}: {
  href: string;
  icon: string;
  title: string;
  isActive: boolean;
  count?: number | null;
  onDelete: (e: React.MouseEvent) => void;
  deleteTitle: string;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>
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
          background: isActive
            ? 'rgba(140,82,255,0.12)'
            : hovered
              ? 'var(--ink-04)'
              : 'transparent',
          borderLeft: isActive
            ? '3px solid #8c52ff'
            : hovered
              ? '3px solid rgba(140,82,255,0.4)'
              : '3px solid transparent',
          transition: 'background 0.12s ease, border-color 0.12s ease',
          cursor: 'pointer',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: 13,
            color: isActive ? '#c4a9ff' : 'rgba(140,82,255,0.55)',
            flexShrink: 0,
            transition: 'color 0.12s ease',
          }}
          aria-hidden
        >
          {icon}
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: 'inherit',
            fontSize: '13px',
            fontWeight: isActive ? 600 : 500,
            color: isActive ? '#f0edff' : 'var(--ink-70)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>
        {hovered ? (
          <button
            onClick={onDelete}
            title={deleteTitle}
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
              color: 'var(--ink-30)',
              padding: 0,
              flexShrink: 0,
              transition: 'color 0.12s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-30)';
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 11 }} aria-hidden>
              delete
            </span>
          </button>
        ) : (
          count != null &&
          count > 0 && (
            <span style={{ fontSize: '11px', color: 'var(--ink-40)', flexShrink: 0 }}>{count}</span>
          )
        )}
      </div>
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ChatTreeSection — this notebook's mage chats. Rows link to the in-notebook
   chat route (/notebooks/[id]/chats/[chatId]), which renders the same record
   as /learn/chats/[chatId]. "+" opens the create-chat modal on the notebook
   root via ?new=1 (handled in app/(dashboard)/notebooks/[id]/page.tsx).
   ═══════════════════════════════════════════════════════════════════════════ */

function ChatTreeSection() {
  const router = useRouter();
  const { notebookId, chats, activeChatId, refreshChats } = useNotebookWorkspace();

  const handleDelete = useCallback(
    async (chatId: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await fetch(`/api/notebooks/${notebookId}/chats/${chatId}`, { method: 'DELETE' });
        refreshChats();
        if (activeChatId === chatId) router.push(`/notebooks/${notebookId}`);
      } catch {
        /* silent */
      }
    },
    [notebookId, activeChatId, router, refreshChats]
  );

  return (
    <div style={{ padding: '4px 0 0' }}>
      <SidebarGroupHeader label="Chats">
        <GroupAddButton
          title="New chat"
          onClick={() => router.push(`/notebooks/${notebookId}?new=1`)}
        />
      </SidebarGroupHeader>
      {chats.length === 0 ? (
        <GroupEmptyHint text="No chats yet." />
      ) : (
        chats.map((chat) => (
          <GroupItemRow
            key={chat.id}
            href={`/notebooks/${notebookId}/chats/${chat.id}`}
            icon="forum"
            title={chat.title}
            isActive={chat.id === activeChatId}
            count={chat._count?.messages}
            onDelete={(e) => handleDelete(chat.id, e)}
            deleteTitle="Delete chat"
          />
        ))
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   FlashcardTreeSection — this notebook's flashcard sets (flat). Path-generated
   bundles are excluded server-side (sourcePathId), so they don't show here.
   ═══════════════════════════════════════════════════════════════════════════ */

function FlashcardTreeSection() {
  const router = useRouter();
  const { notebookId, flashcardSets, activeFlashcardSetId, refreshFlashcardSets, refreshSections } =
    useNotebookWorkspace();
  const [showCreator, setShowCreator] = useState(false);

  const handleDelete = useCallback(
    async (setId: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await fetch(`/api/notebooks/${notebookId}/flashcard-sets/${setId}`, { method: 'DELETE' });
        refreshFlashcardSets();
        refreshSections();
        if (activeFlashcardSetId === setId) router.push(`/notebooks/${notebookId}`);
      } catch {
        /* silent */
      }
    },
    [notebookId, activeFlashcardSetId, router, refreshFlashcardSets, refreshSections]
  );

  return (
    <div style={{ padding: '4px 0 0' }}>
      <SidebarGroupHeader label="Flashcards">
        <GroupAddButton title="New flashcard set" onClick={() => setShowCreator(true)} />
      </SidebarGroupHeader>
      {flashcardSets.length === 0 ? (
        <GroupEmptyHint text="No flashcard sets yet." />
      ) : (
        flashcardSets.map((set) => (
          <GroupItemRow
            key={set.id}
            href={`/notebooks/${notebookId}/flashcards/${set.id}`}
            icon="layers"
            title={set.title}
            isActive={set.id === activeFlashcardSetId}
            count={set._count?.flashcards}
            onDelete={(e) => handleDelete(set.id, e)}
            deleteTitle="Delete flashcard set"
          />
        ))
      )}
      {showCreator && (
        <FlashcardSetCreator
          notebookId={notebookId}
          onCreated={(setId) => {
            setShowCreator(false);
            refreshFlashcardSets();
            refreshSections();
            router.push(`/notebooks/${notebookId}/flashcards/${setId}`);
          }}
          onClose={() => setShowCreator(false)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   QuizTreeSection — this notebook's quiz sets (flat). Same sourcePathId
   exclusion as flashcards.
   ═══════════════════════════════════════════════════════════════════════════ */

function QuizTreeSection() {
  const router = useRouter();
  const { notebookId, quizSets, activeQuizSetId, refreshQuizSets, refreshSections } =
    useNotebookWorkspace();
  const [showCreator, setShowCreator] = useState(false);

  const handleDelete = useCallback(
    async (setId: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await fetch(`/api/notebooks/${notebookId}/quiz-sets/${setId}`, { method: 'DELETE' });
        refreshQuizSets();
        refreshSections();
        if (activeQuizSetId === setId) router.push(`/notebooks/${notebookId}`);
      } catch {
        /* silent */
      }
    },
    [notebookId, activeQuizSetId, router, refreshQuizSets, refreshSections]
  );

  return (
    <div style={{ padding: '4px 0 0' }}>
      <SidebarGroupHeader label="Quizzes">
        <GroupAddButton title="New quiz" onClick={() => setShowCreator(true)} />
      </SidebarGroupHeader>
      {quizSets.length === 0 ? (
        <GroupEmptyHint text="No quizzes yet." />
      ) : (
        quizSets.map((set) => (
          <GroupItemRow
            key={set.id}
            href={`/notebooks/${notebookId}/quizzes/${set.id}`}
            icon="help"
            title={set.title}
            isActive={set.id === activeQuizSetId}
            count={set._count?.questions}
            onDelete={(e) => handleDelete(set.id, e)}
            deleteTitle="Delete quiz"
          />
        ))
      )}
      {showCreator && (
        <QuizSetCreator
          notebookId={notebookId}
          onCreated={(setId) => {
            setShowCreator(false);
            refreshQuizSets();
            refreshSections();
            router.push(`/notebooks/${notebookId}/quizzes/${setId}`);
          }}
          onClose={() => setShowCreator(false)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SectionTreeItem — Recursive section with inline pages (OneNote-style)
   ═══════════════════════════════════════════════════════════════════════════ */

function SectionTreeItem({ section, depth = 0 }: { section: SectionNode; depth?: number }) {
  const router = useRouter();
  const { activeSectionId, setActiveSectionId, notebookId, refreshSections, activePageId } =
    useNotebookWorkspace();

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
  const hasContent = hasChildren || hasPages || isCreatingChild || isCreatingPage;

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
              <span className="material-symbols-outlined" style={{ fontSize: 11 }} aria-hidden>
                note_add
              </span>
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
              <span className="material-symbols-outlined" style={{ fontSize: 11 }} aria-hidden>
                create_new_folder
              </span>
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
              <span className="material-symbols-outlined" style={{ fontSize: 11 }} aria-hidden>
                delete
              </span>
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
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 11, color: 'var(--ink-30)', flexShrink: 0 }}
                aria-hidden
              >
                note_add
              </span>
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
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 11, color: 'var(--ink-30)', flexShrink: 0 }}
                aria-hidden
              >
                create_new_folder
              </span>
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
            <span className="material-symbols-outlined" style={{ fontSize: 11 }} aria-hidden>
              delete
            </span>
          </button>
        )}
      </div>
    </Link>
  );
}
