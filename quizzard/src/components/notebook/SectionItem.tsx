'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronRight, Plus, Trash2, FileText, FileUp, Layers, HelpCircle } from 'lucide-react';
import Link from 'next/link';
import PageItem from '@/components/notebook/PageItem';
import FileImportDialog from '@/components/notebook/FileImportDialog';
import UrlImportDialog from '@/components/notebook/UrlImportDialog';
import type { SectionNode } from '@/components/notebook/SectionTree';

interface SectionItemProps {
  section: SectionNode;
  depth: number;
  activePageId?: string;
  notebookId: string;
  onRefresh: () => void;
}

/** Check recursively whether a section (or any descendant) contains a given page id. */
function containsPage(section: SectionNode, pageId: string): boolean {
  if (section.pages.some((p) => p.id === pageId)) return true;
  return section.children.some((child) => containsPage(child, pageId));
}

export default function SectionItem({ section, depth, activePageId, notebookId, onRefresh }: SectionItemProps) {
  const hasActivePage = activePageId ? containsPage(section, activePageId) : false;
  const [expanded, setExpanded] = useState(hasActivePage);
  const [headerHovered, setHeaderHovered] = useState(false);
  const [isCreatingPage, setIsCreatingPage] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showUrlImport, setShowUrlImport] = useState(false);
  const [showImportMenu, setShowImportMenu] = useState(false);
  const importMenuRef = useRef<HTMLDivElement>(null);
  const [newPageTitle, setNewPageTitle] = useState('');
  const pageInputRef = useRef<HTMLInputElement>(null);

  // Close import menu on outside click
  useEffect(() => {
    if (!showImportMenu) return;
    function handleClick(e: MouseEvent) {
      if (importMenuRef.current && !importMenuRef.current.contains(e.target as Node)) {
        setShowImportMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showImportMenu]);

  // Expand when active page appears inside
  useEffect(() => {
    if (hasActivePage) setExpanded(true);
  }, [hasActivePage]);

  // Focus the input when creating a page
  useEffect(() => {
    if (isCreatingPage && pageInputRef.current) {
      pageInputRef.current.focus();
    }
  }, [isCreatingPage]);

  const handleDeleteSection = useCallback(async () => {
    if (!window.confirm(`Delete section "${section.title}" and all its pages?`)) return;
    try {
      await fetch(`/api/notebooks/${notebookId}/sections/${section.id}`, { method: 'DELETE' });
      onRefresh();
    } catch {
      // silent
    }
  }, [notebookId, section.id, section.title, onRefresh]);

  const handleCreatePage = useCallback(async () => {
    const title = newPageTitle.trim() || 'Untitled';
    try {
      await fetch(`/api/notebooks/${notebookId}/sections/${section.id}/pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      setNewPageTitle('');
      setIsCreatingPage(false);
      onRefresh();
    } catch {
      // silent
    }
  }, [notebookId, section.id, newPageTitle, onRefresh]);

  const paddingLeft = 8 + depth * 16;

  return (
    <div>
      {/* Section header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: `4px 6px 4px ${paddingLeft}px`,
          cursor: 'pointer',
          userSelect: 'none',
          borderRadius: '4px',
          background: headerHovered ? 'rgba(140,82,255,0.04)' : 'transparent',
          transition: 'background 0.12s ease',
        }}
        onClick={() => setExpanded((v) => !v)}
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
      >
        <ChevronRight
          size={14}
          style={{
            color: 'rgba(237,233,255,0.3)',
            flexShrink: 0,
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.12s ease',
          }}
        />
        <span
          style={{
            fontFamily: 'inherit',
            fontSize: '13px',
            fontWeight: 600,
            color: 'rgba(237,233,255,0.7)',
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {section.title}
        </span>

        {/* Hover actions */}
        {headerHovered && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              flexShrink: 0,
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(true);
                setIsCreatingPage(true);
              }}
              title="Add page"
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                border: 'none',
                background: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'rgba(237,233,255,0.4)',
                padding: 0,
                transition: 'color 0.12s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#8c52ff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'rgba(237,233,255,0.4)';
              }}
            >
              <Plus size={14} />
            </button>
            <div ref={importMenuRef} style={{ position: 'relative' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowImportMenu((v) => !v);
              }}
              title="Import"
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                border: 'none',
                background: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'rgba(237,233,255,0.4)',
                padding: 0,
                transition: 'color 0.12s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#5170ff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'rgba(237,233,255,0.4)';
              }}
            >
              <FileUp size={12} />
            </button>
            {showImportMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '4px',
                  background: '#1a1a2e',
                  borderRadius: '10px',
                  border: '1px solid rgba(140,82,255,0.15)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  zIndex: 50,
                  minWidth: '180px',
                  padding: '4px',
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowImportMenu(false);
                    setShowImport(true);
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#ede9ff',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(140,82,255,0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <FileUp size={14} style={{ color: '#8c52ff', flexShrink: 0 }} />
                  Upload File
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowImportMenu(false);
                    setShowUrlImport(true);
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#ede9ff',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(140,82,255,0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px', color: '#ff0000', flexShrink: 0 }}>smart_display</span>
                  URL / YouTube
                </button>
              </div>
            )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteSection();
              }}
              title="Delete section"
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                border: 'none',
                background: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'rgba(237,233,255,0.4)',
                padding: 0,
                transition: 'color 0.12s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#fca5a5';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'rgba(237,233,255,0.4)';
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div>
          {/* Pages */}
          {section.pages.map((page) => (
            <PageItem
              key={page.id}
              page={page}
              notebookId={notebookId}
              isActive={page.id === activePageId}
              onRefresh={onRefresh}
            />
          ))}

          {/* Flashcard sets */}
          {section.flashcardSets?.map((fc) => (
            <FlashcardSetItem key={fc.id} fc={fc} notebookId={notebookId} />
          ))}

          {/* Quiz sets */}
          {section.quizSets?.map((qs) => (
            <QuizSetItem key={qs.id} qs={qs} notebookId={notebookId} />
          ))}

          {/* Inline create page input */}
          {isCreatingPage && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 10px 4px 38px',
              }}
            >
              <FileText size={14} style={{ color: 'rgba(237,233,255,0.3)', flexShrink: 0 }} />
              <input
                ref={pageInputRef}
                type="text"
                value={newPageTitle}
                onChange={(e) => setNewPageTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreatePage();
                  } else if (e.key === 'Escape') {
                    setIsCreatingPage(false);
                    setNewPageTitle('');
                  }
                }}
                placeholder="Page title..."
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'rgba(140,82,255,0.06)',
                  border: '1px solid rgba(140,82,255,0.2)',
                  borderRadius: '4px',
                  padding: '3px 8px',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  color: '#ede9ff',
                  outline: 'none',
                }}
              />
            </div>
          )}

          {/* Child sections (recursive) */}
          {section.children.map((child) => (
            <SectionItem
              key={child.id}
              section={child}
              depth={depth + 1}
              activePageId={activePageId}
              notebookId={notebookId}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}

      {/* File import dialog */}
      {showImport && (
        <FileImportDialog
          notebookId={notebookId}
          sectionId={section.id}
          onImported={() => {
            setShowImport(false);
            onRefresh();
          }}
          onClose={() => setShowImport(false)}
        />
      )}

      {/* URL / YouTube import dialog */}
      {showUrlImport && (
        <UrlImportDialog
          notebookId={notebookId}
          sectionId={section.id}
          onImported={() => {
            setShowUrlImport(false);
            onRefresh();
          }}
          onClose={() => setShowUrlImport(false)}
        />
      )}
    </div>
  );
}

/** Sidebar item for a flashcard set linked to a section */
function FlashcardSetItem({ fc, notebookId }: { fc: { id: string; title: string }; notebookId: string }) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link
      href={`/notebooks/${notebookId}/flashcards/${fc.id}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 10px 4px 38px',
        textDecoration: 'none',
        borderRadius: '4px',
        background: hovered ? 'rgba(140,82,255,0.06)' : 'transparent',
        transition: 'background 0.12s ease',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Layers
        size={14}
        style={{
          color: hovered ? '#8c52ff' : 'rgba(140,82,255,0.45)',
          flexShrink: 0,
          transition: 'color 0.12s ease',
        }}
      />
      <span
        style={{
          fontFamily: 'inherit',
          fontSize: '13px',
          color: hovered ? '#c4a9ff' : 'rgba(237,233,255,0.55)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          transition: 'color 0.12s ease',
        }}
      >
        {fc.title}
      </span>
    </Link>
  );
}

/** Sidebar item for a quiz set linked to a section */
function QuizSetItem({ qs, notebookId }: { qs: { id: string; title: string }; notebookId: string }) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link
      href={`/notebooks/${notebookId}/quizzes/${qs.id}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 10px 4px 38px',
        textDecoration: 'none',
        borderRadius: '4px',
        background: hovered ? 'rgba(81,112,255,0.06)' : 'transparent',
        transition: 'background 0.12s ease',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <HelpCircle
        size={14}
        style={{
          color: hovered ? '#5170ff' : 'rgba(81,112,255,0.45)',
          flexShrink: 0,
          transition: 'color 0.12s ease',
        }}
      />
      <span
        style={{
          fontFamily: 'inherit',
          fontSize: '13px',
          color: hovered ? '#93a8ff' : 'rgba(237,233,255,0.55)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          transition: 'color 0.12s ease',
        }}
      >
        {qs.title}
      </span>
    </Link>
  );
}
