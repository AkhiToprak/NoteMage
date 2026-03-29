'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft, Plus, FolderPlus, ChevronRight, Trash2,
  FileText, FilePlus, MessageSquare, Sparkles, Layers,
} from 'lucide-react';
import { useNotebookWorkspace } from '@/components/notebook/NotebookWorkspaceContext';
import { getSectionColor } from '@/components/notebook/SectionListItem';
import type { SectionNode } from '@/components/notebook/SectionTree';
import type { NotebookChatItem } from '@/components/notebook/NotebookWorkspaceContext';

/* ═══════════════════════════════════════════════════════════════════════════
   UnifiedSidebar — OneNote-style sidebar with Files + Chats
   ═══════════════════════════════════════════════════════════════════════════ */

export default function UnifiedSidebar() {
  const {
    notebookId, notebook, sections, refreshSections,
  } = useNotebookWorkspace();

  const [isCreatingSection, setIsCreatingSection] = useState(false);
  const [sectionDraft, setSectionDraft] = useState('');
  const sectionInputRef = useRef<HTMLInputElement>(null);
  const accentColor = notebook?.color || '#8c52ff';

  useEffect(() => {
    if (isCreatingSection && sectionInputRef.current) sectionInputRef.current.focus();
  }, [isCreatingSection]);

  const handleCreateSection = useCallback(async () => {
    const title = sectionDraft.trim();
    if (!title) { setIsCreatingSection(false); setSectionDraft(''); return; }
    try {
      await fetch(`/api/notebooks/${notebookId}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      setSectionDraft('');
      setIsCreatingSection(false);
      refreshSections();
    } catch { setIsCreatingSection(false); setSectionDraft(''); }
  }, [notebookId, sectionDraft, refreshSections]);

  return (
    <aside style={{
      width: '280px',
      minWidth: '280px',
      background: '#0d0c20',
      borderRight: '1px solid rgba(140,82,255,0.1)',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      fontFamily: "'Gliker', 'DM Sans', sans-serif",
    }}>
      {/* ── Header: Logo + Notebook name ────────────────────────────── */}
      <div style={{
        padding: '14px 14px 10px',
        borderBottom: '1px solid rgba(140,82,255,0.1)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}>
        <Image
          src="/logo_trimmed.png"
          alt="Quizzard"
          width={120}
          height={30}
          style={{ objectFit: 'contain', objectPosition: 'left' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Link
            href="/notebooks"
            title="Back to notebooks"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '22px', height: '22px', borderRadius: '5px',
              background: 'transparent', border: 'none', textDecoration: 'none',
              color: 'rgba(237,233,255,0.4)', flexShrink: 0,
              transition: 'color 0.12s ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(237,233,255,0.8)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(237,233,255,0.4)'; }}
          >
            <ArrowLeft size={14} />
          </Link>
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: accentColor, flexShrink: 0 }} />
          <span style={{
            fontSize: '13px', fontWeight: 600, color: '#ede9ff',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1, minWidth: 0,
          }}>
            {notebook?.name ?? '...'}
          </span>
        </div>
      </div>

      {/* ── Scrollable body: Files + Chats ──────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* ── FILES section ──────────────────────────────────────── */}
        <div style={{ padding: '10px 0 0' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 14px 6px',
          }}>
            <span style={{
              fontSize: '10px', fontWeight: 700, color: 'rgba(237,233,255,0.35)',
              letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>
              Sections
            </span>
            <button
              onClick={() => setIsCreatingSection(true)}
              title="Add section"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '18px', height: '18px', borderRadius: '4px',
                border: 'none', background: 'transparent', cursor: 'pointer',
                color: 'rgba(237,233,255,0.25)', padding: 0,
                transition: 'color 0.12s ease',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,233,255,0.7)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,233,255,0.25)'; }}
            >
              <Plus size={13} />
            </button>
          </div>

          {/* Section tree */}
          {sections.map(section => (
            <SectionTreeItem key={section.id} section={section} />
          ))}

          {/* Inline section creation */}
          {isCreatingSection && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '6px 14px',
              borderLeft: '3px solid rgba(140,82,255,0.4)',
            }}>
              <FolderPlus size={12} style={{ color: 'rgba(237,233,255,0.3)', flexShrink: 0 }} />
              <input
                ref={sectionInputRef}
                type="text"
                value={sectionDraft}
                onChange={e => setSectionDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); handleCreateSection(); }
                  else if (e.key === 'Escape') { setIsCreatingSection(false); setSectionDraft(''); }
                }}
                onBlur={() => { if (!sectionDraft.trim()) { setIsCreatingSection(false); setSectionDraft(''); } else handleCreateSection(); }}
                placeholder="Section name..."
                style={{
                  flex: 1, minWidth: 0,
                  background: 'rgba(140,82,255,0.08)',
                  border: '1px solid rgba(140,82,255,0.3)',
                  borderRadius: '4px',
                  padding: '3px 7px',
                  fontFamily: "'Gliker', 'DM Sans', sans-serif",
                  fontSize: '12px',
                  color: '#ede9ff',
                  outline: 'none',
                }}
              />
            </div>
          )}

          {sections.length === 0 && !isCreatingSection && (
            <div style={{ padding: '16px 14px', textAlign: 'center' }}>
              <p style={{ fontSize: '12px', color: 'rgba(237,233,255,0.2)', margin: 0, lineHeight: 1.5 }}>
                No sections yet.
              </p>
            </div>
          )}
        </div>

        {/* ── Divider ────────────────────────────────────────────── */}
        <div style={{
          margin: '12px 14px',
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(140,82,255,0.25), transparent)',
        }} />

        {/* ── CHATS section ─────────────────────────────────────── */}
        <ChatTreeSection />
      </div>
    </aside>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SectionTreeItem — Recursive section with inline pages (OneNote-style)
   ═══════════════════════════════════════════════════════════════════════════ */

function SectionTreeItem({ section, depth = 0 }: { section: SectionNode; depth?: number }) {
  const router = useRouter();
  const {
    activeSectionId, setActiveSectionId, notebookId,
    refreshSections, activePageId, activeFlashcardSetId,
  } = useNotebookWorkspace();

  const [expanded, setExpanded] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [isCreatingChild, setIsCreatingChild] = useState(false);
  const [childDraft, setChildDraft] = useState('');
  const [isCreatingPage, setIsCreatingPage] = useState(false);
  const [pageDraft, setPageDraft] = useState('');
  const childInputRef = useRef<HTMLInputElement>(null);
  const pageInputRef = useRef<HTMLInputElement>(null);

  const isActive = activeSectionId === section.id;
  const color = getSectionColor(section);
  const hasChildren = section.children.length > 0;
  const hasPages = section.pages.length > 0;
  const hasFlashcardSets = (section.flashcardSets?.length ?? 0) > 0;
  const hasContent = hasChildren || hasPages || hasFlashcardSets || isCreatingChild || isCreatingPage;

  useEffect(() => {
    if (isCreatingChild && childInputRef.current) childInputRef.current.focus();
  }, [isCreatingChild]);

  useEffect(() => {
    if (isCreatingPage && pageInputRef.current) pageInputRef.current.focus();
  }, [isCreatingPage]);

  const handleDelete = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Delete section "${section.title}" and all its pages?`)) return;
    try {
      await fetch(`/api/notebooks/${notebookId}/sections/${section.id}`, { method: 'DELETE' });
      refreshSections();
    } catch { /* silent */ }
  }, [notebookId, section.id, section.title, refreshSections]);

  const handleAddSubsection = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(true);
    setIsCreatingChild(true);
  }, []);

  const handleCreateChild = useCallback(async () => {
    const title = childDraft.trim();
    if (!title) { setIsCreatingChild(false); setChildDraft(''); return; }
    try {
      await fetch(`/api/notebooks/${notebookId}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, parentId: section.id }),
      });
      setChildDraft('');
      setIsCreatingChild(false);
      refreshSections();
    } catch { setIsCreatingChild(false); setChildDraft(''); }
  }, [notebookId, section.id, childDraft, refreshSections]);

  const handleAddPage = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(true);
    setIsCreatingPage(true);
  }, []);

  const handleCreatePage = useCallback(async () => {
    const title = pageDraft.trim() || 'Untitled';
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/sections/${section.id}/pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      const json = await res.json();
      setPageDraft('');
      setIsCreatingPage(false);
      refreshSections();
      if (json.success && json.data?.id) {
        router.push(`/notebooks/${notebookId}/pages/${json.data.id}`);
      }
    } catch { setIsCreatingPage(false); setPageDraft(''); }
  }, [notebookId, section.id, pageDraft, refreshSections, router]);

  const handleDeletePage = useCallback(async (pageId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await fetch(`/api/notebooks/${notebookId}/pages/${pageId}`, { method: 'DELETE' });
      refreshSections();
      if (activePageId === pageId) router.push(`/notebooks/${notebookId}`);
    } catch { /* silent */ }
  }, [notebookId, activePageId, router, refreshSections]);

  const paddingLeft = 12 + depth * 14;

  return (
    <>
      {/* ── Section row ─────────────────────────────────────────── */}
      <div
        onClick={() => { setActiveSectionId(section.id); setExpanded(true); }}
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
          background: isActive ? 'rgba(140,82,255,0.12)' : hovered ? 'rgba(237,233,255,0.04)' : 'transparent',
          borderLeft: `3px solid ${isActive ? color : hovered ? color + '80' : color + '50'}`,
          transition: 'background 0.12s ease, border-color 0.12s ease',
          userSelect: 'none',
        }}
      >
        {/* Expand/collapse chevron */}
        <div
          onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
          style={{ display: 'flex', flexShrink: 0, color: 'rgba(237,233,255,0.3)', marginLeft: '-4px', width: '14px' }}
        >
          {hasContent ? (
            <ChevronRight
              size={13}
              style={{
                transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.12s ease',
              }}
            />
          ) : (
            <div style={{ width: '13px' }} />
          )}
        </div>

        {/* Section title */}
        <span style={{
          flex: 1,
          fontFamily: "'DM Sans', sans-serif",
          fontSize: depth === 0 ? '13px' : '12px',
          fontWeight: isActive ? 600 : 400,
          color: isActive ? '#ede9ff' : 'rgba(237,233,255,0.65)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          minWidth: 0,
        }}>
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
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '20px', height: '20px', borderRadius: '4px',
                border: 'none', background: 'transparent', cursor: 'pointer',
                color: 'rgba(237,233,255,0.3)', padding: 0, flexShrink: 0,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#69d2a0'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,233,255,0.3)'; }}
            >
              <FilePlus size={11} />
            </button>
            {/* Add subsection */}
            <button
              onClick={handleAddSubsection}
              title="Add subsection"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '20px', height: '20px', borderRadius: '4px',
                border: 'none', background: 'transparent', cursor: 'pointer',
                color: 'rgba(237,233,255,0.3)', padding: 0, flexShrink: 0,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#a47bff'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,233,255,0.3)'; }}
            >
              <FolderPlus size={11} />
            </button>
            {/* Delete section */}
            <button
              onClick={handleDelete}
              title="Delete section"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '20px', height: '20px', borderRadius: '4px',
                border: 'none', background: 'transparent', cursor: 'pointer',
                color: 'rgba(237,233,255,0.3)', padding: 0, flexShrink: 0,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,233,255,0.3)'; }}
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>

      {/* ── Expanded children: pages + subsections ──────────────── */}
      {expanded && (
        <>
          {/* Pages inside this section */}
          {section.pages.map(page => {
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
          {section.flashcardSets?.map(fc => {
            const isFcActive = fc.id === activeFlashcardSetId;
            return (
              <FlashcardSetTreeRow
                key={fc.id}
                flashcardSet={fc}
                isActive={isFcActive}
                notebookId={notebookId}
                accentColor={color}
                depth={depth}
              />
            );
          })}

          {/* Inline page creation */}
          {isCreatingPage && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              paddingLeft: `${paddingLeft + 18}px`,
              paddingRight: '8px',
              paddingTop: '5px', paddingBottom: '5px',
              borderLeft: `3px solid ${color}60`,
            }}>
              <FilePlus size={11} style={{ color: 'rgba(237,233,255,0.3)', flexShrink: 0 }} />
              <input
                ref={pageInputRef}
                type="text"
                value={pageDraft}
                onChange={e => setPageDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); handleCreatePage(); }
                  else if (e.key === 'Escape') { setIsCreatingPage(false); setPageDraft(''); }
                }}
                onBlur={() => { if (!pageDraft.trim()) { setIsCreatingPage(false); setPageDraft(''); } else handleCreatePage(); }}
                placeholder="Page title..."
                style={{
                  flex: 1, minWidth: 0,
                  background: 'rgba(140,82,255,0.08)',
                  border: '1px solid rgba(140,82,255,0.3)',
                  borderRadius: '4px',
                  padding: '3px 7px',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '12px',
                  color: '#ede9ff',
                  outline: 'none',
                }}
              />
            </div>
          )}

          {/* Subsection creation input */}
          {isCreatingChild && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              paddingLeft: `${paddingLeft + 18}px`,
              paddingRight: '8px',
              paddingTop: '5px', paddingBottom: '5px',
              borderLeft: '3px solid rgba(140,82,255,0.4)',
            }}>
              <FolderPlus size={11} style={{ color: 'rgba(237,233,255,0.3)', flexShrink: 0 }} />
              <input
                ref={childInputRef}
                type="text"
                value={childDraft}
                onChange={e => setChildDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); handleCreateChild(); }
                  else if (e.key === 'Escape') { setIsCreatingChild(false); setChildDraft(''); }
                }}
                onBlur={() => { if (!childDraft.trim()) { setIsCreatingChild(false); setChildDraft(''); } else handleCreateChild(); }}
                placeholder="Subsection name..."
                style={{
                  flex: 1, minWidth: 0,
                  background: 'rgba(140,82,255,0.08)',
                  border: '1px solid rgba(140,82,255,0.3)',
                  borderRadius: '4px',
                  padding: '3px 7px',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '12px',
                  color: '#ede9ff',
                  outline: 'none',
                }}
              />
            </div>
          )}

          {/* Child sections (recursive) */}
          {section.children.map(child => (
            <SectionTreeItem key={child.id} section={child} depth={depth + 1} />
          ))}
        </>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   PageTreeRow — A page nested inside a section tree
   ═══════════════════════════════════════════════════════════════════════════ */

function PageTreeRow({ page, isActive, notebookId, accentColor, depth, onDelete }: {
  page: { id: string; title: string };
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
          display: 'flex', alignItems: 'center', gap: '7px',
          paddingLeft: `${paddingLeft}px`,
          paddingRight: '8px',
          paddingTop: '5px',
          paddingBottom: '5px',
          background: isActive
            ? `linear-gradient(135deg, ${accentColor}18 0%, rgba(81,112,255,0.10) 100%)`
            : hovered ? 'rgba(237,233,255,0.04)' : 'transparent',
          borderLeft: isActive ? `3px solid ${accentColor}` : '3px solid transparent',
          transition: 'background 0.1s ease',
          cursor: 'pointer',
        }}
      >
        <FileText
          size={12}
          style={{ color: isActive ? accentColor : 'rgba(237,233,255,0.25)', flexShrink: 0 }}
        />
        <span style={{
          flex: 1, minWidth: 0,
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '12px',
          fontWeight: isActive ? 600 : 400,
          color: isActive ? '#ede9ff' : 'rgba(237,233,255,0.55)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {page.title}
        </span>
        {hovered && !isActive && (
          <button
            onClick={e => onDelete(page.id, e)}
            title="Delete page"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '18px', height: '18px', borderRadius: '3px',
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: 'rgba(237,233,255,0.3)', padding: 0, flexShrink: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,233,255,0.3)'; }}
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   FlashcardSetTreeRow — A flashcard set nested inside a section tree
   ═══════════════════════════════════════════════════════════════════════════ */

function FlashcardSetTreeRow({ flashcardSet, isActive, notebookId, accentColor, depth }: {
  flashcardSet: { id: string; title: string };
  isActive: boolean;
  notebookId: string;
  accentColor: string;
  depth: number;
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
          display: 'flex', alignItems: 'center', gap: '7px',
          paddingLeft: `${paddingLeft}px`,
          paddingRight: '8px',
          paddingTop: '5px',
          paddingBottom: '5px',
          background: isActive
            ? `linear-gradient(135deg, ${accentColor}18 0%, rgba(81,112,255,0.10) 100%)`
            : hovered ? 'rgba(237,233,255,0.04)' : 'transparent',
          borderLeft: isActive ? `3px solid ${accentColor}` : '3px solid transparent',
          transition: 'background 0.1s ease',
          cursor: 'pointer',
        }}
      >
        <Layers
          size={12}
          style={{ color: isActive ? accentColor : 'rgba(140,82,255,0.45)', flexShrink: 0 }}
        />
        <span style={{
          flex: 1, minWidth: 0,
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '12px',
          fontWeight: isActive ? 600 : 400,
          color: isActive ? '#ede9ff' : 'rgba(237,233,255,0.55)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {flashcardSet.title}
        </span>
      </div>
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ChatTreeSection — Scholar Chats area
   ═══════════════════════════════════════════════════════════════════════════ */

function ChatTreeSection() {
  const router = useRouter();
  const { notebookId, chats, activeChatId, refreshChats } = useNotebookWorkspace();
  const [expanded, setExpanded] = useState(true);

  const handleDeleteChat = useCallback(async (chatId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await fetch(`/api/notebooks/${notebookId}/chats/${chatId}`, { method: 'DELETE' });
      refreshChats();
      if (activeChatId === chatId) router.push(`/notebooks/${notebookId}`);
    } catch { /* silent */ }
  }, [notebookId, activeChatId, router, refreshChats]);

  return (
    <div style={{ paddingBottom: '12px' }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 14px 6px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ChevronRight
            size={12}
            style={{
              color: 'rgba(196,169,255,0.5)',
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.12s ease',
            }}
          />
          <div style={{
            width: '16px', height: '16px', borderRadius: '4px',
            background: 'linear-gradient(135deg, rgba(140,82,255,0.4), rgba(81,112,255,0.3))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Sparkles size={9} style={{ color: '#c4a9ff' }} />
          </div>
          <span style={{
            fontSize: '10px', fontWeight: 700,
            color: 'rgba(196,169,255,0.55)',
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            Scholar Chats
          </span>
        </div>

        <Link
          href={`/notebooks/${notebookId}?new=1`}
          onClick={e => e.stopPropagation()}
          title="New chat"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '18px', height: '18px', borderRadius: '4px',
            background: 'transparent', textDecoration: 'none',
            color: 'rgba(196,169,255,0.35)',
            transition: 'color 0.12s ease',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(196,169,255,0.8)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(196,169,255,0.35)'; }}
        >
          <Plus size={13} />
        </Link>
      </div>

      {expanded && (
        <>
          {chats.length === 0 && (
            <div style={{ padding: '12px 14px', textAlign: 'center' }}>
              <p style={{ fontSize: '12px', color: 'rgba(237,233,255,0.2)', margin: 0, lineHeight: 1.5 }}>
                No chats yet.
              </p>
            </div>
          )}

          {chats.map(chat => (
            <ChatTreeRow
              key={chat.id}
              chat={chat}
              isActive={chat.id === activeChatId}
              notebookId={notebookId}
              onDelete={handleDeleteChat}
            />
          ))}
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ChatTreeRow — Individual chat item
   ═══════════════════════════════════════════════════════════════════════════ */

function ChatTreeRow({ chat, isActive, notebookId, onDelete }: {
  chat: NotebookChatItem;
  isActive: boolean;
  notebookId: string;
  onDelete: (id: string, e: React.MouseEvent) => void;
}) {
  const { activeFlashcardSetId } = useNotebookWorkspace();
  const [hovered, setHovered] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const accentColor = '#8c52ff';
  const hasFlashcards = chat.flashcardSets && chat.flashcardSets.length > 0;

  // Auto-expand if a flashcard set in this chat is active
  useEffect(() => {
    if (activeFlashcardSetId && hasFlashcards) {
      const match = chat.flashcardSets.some(fs => fs.id === activeFlashcardSetId);
      if (match) setExpanded(true);
    }
  }, [activeFlashcardSetId, hasFlashcards, chat.flashcardSets]);

  return (
    <>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          padding: '5px 14px 5px 22px',
          background: isActive
            ? `linear-gradient(135deg, ${accentColor}18 0%, rgba(81,112,255,0.10) 100%)`
            : hovered ? 'rgba(237,233,255,0.04)' : 'transparent',
          borderLeft: isActive ? `3px solid ${accentColor}` : '3px solid transparent',
          transition: 'background 0.1s ease',
          cursor: 'pointer',
        }}
      >
        {/* Expand chevron (only if has flashcard sub-items) */}
        {hasFlashcards ? (
          <div
            onClick={e => { e.preventDefault(); e.stopPropagation(); setExpanded(v => !v); }}
            style={{ display: 'flex', flexShrink: 0, color: 'rgba(237,233,255,0.3)', width: '14px' }}
          >
            <ChevronRight
              size={12}
              style={{
                transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.12s ease',
              }}
            />
          </div>
        ) : (
          <div style={{ width: '14px', flexShrink: 0 }} />
        )}

        <Link
          href={`/notebooks/${notebookId}/chats/${chat.id}`}
          style={{
            textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '7px',
            flex: 1, minWidth: 0,
          }}
        >
          <MessageSquare
            size={12}
            style={{ color: isActive ? '#c4a9ff' : 'rgba(237,233,255,0.25)', flexShrink: 0 }}
          />
          <span style={{
            flex: 1, minWidth: 0,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '12px',
            fontWeight: isActive ? 600 : 400,
            color: isActive ? '#ede9ff' : 'rgba(237,233,255,0.55)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {chat.title}
          </span>
        </Link>
        {hovered && !isActive && (
          <button
            onClick={e => onDelete(chat.id, e)}
            title="Delete chat"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '18px', height: '18px', borderRadius: '3px',
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: 'rgba(237,233,255,0.3)', padding: 0, flexShrink: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,233,255,0.3)'; }}
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>

      {/* Flashcard sub-items */}
      {expanded && hasFlashcards && chat.flashcardSets.map(fs => {
        const isSetActive = fs.id === activeFlashcardSetId;
        return (
          <FlashcardSetRow
            key={fs.id}
            flashcardSet={fs}
            isActive={isSetActive}
            notebookId={notebookId}
          />
        );
      })}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   FlashcardSetRow — Sub-item under a chat for a flashcard set
   ═══════════════════════════════════════════════════════════════════════════ */

function FlashcardSetRow({ flashcardSet, isActive, notebookId }: {
  flashcardSet: { id: string; title: string };
  isActive: boolean;
  notebookId: string;
}) {
  const [hovered, setHovered] = useState(false);
  const accentColor = '#8c52ff';

  return (
    <Link
      href={`/notebooks/${notebookId}/flashcards/${flashcardSet.id}`}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: '7px',
          padding: '4px 14px 4px 52px',
          background: isActive
            ? `linear-gradient(135deg, ${accentColor}18 0%, rgba(81,112,255,0.10) 100%)`
            : hovered ? 'rgba(237,233,255,0.04)' : 'transparent',
          borderLeft: isActive ? `3px solid ${accentColor}` : '3px solid transparent',
          transition: 'background 0.1s ease',
          cursor: 'pointer',
        }}
      >
        <Layers
          size={11}
          style={{ color: isActive ? '#c4a9ff' : 'rgba(237,233,255,0.2)', flexShrink: 0 }}
        />
        <span style={{
          flex: 1, minWidth: 0,
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '11px',
          fontWeight: isActive ? 600 : 400,
          color: isActive ? '#ede9ff' : 'rgba(237,233,255,0.45)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {flashcardSet.title}
        </span>
      </div>
    </Link>
  );
}
