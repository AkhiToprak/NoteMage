'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useDirectUpload } from '@/hooks/useDirectUpload';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { getMageName } from '@/lib/scholar';
import { trackEvent } from '@/lib/telemetry';
import VideoInputMask, { captionsUnavailableError } from '@/components/video/VideoInputMask';

// ── Types ─────────────────────────────────────────────────────────────────

interface PageRef {
  id: string;
  title: string;
}
interface SectionRef {
  id: string;
  title: string;
  pages: PageRef[];
  children?: SectionRef[];
}
interface DocRef {
  id: string;
  fileName: string;
  fileSize: number;
  fileType?: string | null;
}

const VIDEO_TRANSCRIPT_TYPE = 'text/youtube-transcript';

function isVideoDoc(doc: DocRef): boolean {
  return doc.fileType === VIDEO_TRANSCRIPT_TYPE;
}

interface NotebookListItem {
  id: string;
  name: string;
  color: string | null;
  kind: 'standard' | 'inbox';
  pageCount: number;
  sections: SectionRef[]; // Empty until expanded.
  documents: DocRef[]; // Empty until expanded.
  sectionsLoaded: boolean;
  documentsLoaded: boolean;
}

interface NotebooksApiItem {
  id: string;
  name: string;
  color: string | null;
  kind: string | null;
  _count?: { pages?: number };
}

interface SectionsApiItem {
  id: string;
  title: string;
  parentId: string | null;
  sortOrder: number;
  pages: { id: string; title: string; sortOrder: number }[];
}

interface Props {
  defaultNotebookId?: string;
  defaultContextPageIds?: string[];
  defaultContextDocIds?: string[];
  onClose: () => void;
  onCreate: (chatId: string) => void;
}

const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
];

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Build a section tree (root + children) from a flat sections API response.
function buildSectionTree(sections: SectionsApiItem[]): SectionRef[] {
  return sections
    .filter((s) => !s.parentId)
    .map((s) => ({
      id: s.id,
      title: s.title,
      pages: s.pages.map((p) => ({ id: p.id, title: p.title })),
      children: sections
        .filter((c) => c.parentId === s.id)
        .map((c) => ({
          id: c.id,
          title: c.title,
          pages: c.pages.map((p) => ({ id: p.id, title: p.title })),
        })),
    }));
}

function countSelectedPagesInTree(tree: SectionRef[], selected: Set<string>): number {
  let total = 0;
  for (const section of tree) {
    for (const page of section.pages) {
      if (selected.has(page.id)) total++;
    }
    if (section.children) {
      total += countSelectedPagesInTree(section.children, selected);
    }
  }
  return total;
}

// ── Component ─────────────────────────────────────────────────────────────

export default function CreateChatModal({
  defaultNotebookId,
  defaultContextPageIds,
  defaultContextDocIds,
  onClose,
  onCreate,
}: Props) {
  const { upload } = useDirectUpload();
  const { isPhone } = useBreakpoint();
  const { data: session } = useSession();
  const mageName = getMageName(session?.user?.scholarName);

  const [notebooks, setNotebooks] = useState<NotebookListItem[] | null>(null);
  const [notebooksError, setNotebooksError] = useState<string | null>(null);
  const [expandedNotebookIds, setExpandedNotebookIds] = useState<Set<string>>(
    () => new Set(defaultNotebookId ? [defaultNotebookId] : [])
  );

  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(
    () => new Set(defaultContextPageIds ?? [])
  );
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(
    () => new Set(defaultContextDocIds ?? [])
  );

  const [showTitleInput, setShowTitleInput] = useState(false);
  const [title, setTitle] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState<string | 'inbox' | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Initial notebook list fetch ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch('/api/notebooks?folderId=all');
        const json = await res.json();
        if (cancelled) return;
        if (!json?.success) {
          setNotebooksError(json?.error ?? 'Failed to load notebooks');
          setNotebooks([]);
          return;
        }
        const rows = (json.data ?? []) as NotebooksApiItem[];
        const mapped: NotebookListItem[] = rows.map((nb) => ({
          id: nb.id,
          name: nb.name,
          color: nb.color ?? null,
          kind: nb.kind === 'inbox' ? 'inbox' : 'standard',
          pageCount: nb._count?.pages ?? 0,
          sections: [],
          documents: [],
          sectionsLoaded: false,
          documentsLoaded: false,
        }));
        setNotebooks(mapped);
      } catch {
        if (!cancelled) {
          setNotebooksError('Failed to load notebooks');
          setNotebooks([]);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load sections / docs lazily when a notebook expands.
  const loadNotebookContents = useCallback(async (notebookId: string, kind: 'standard' | 'inbox') => {
    // Inbox renders just the Inbox documents (no sections tree).
    if (kind === 'inbox') {
      try {
        const res = await fetch('/api/learn/uploads');
        const json = await res.json();
        const docs = json?.success ? (json.data as DocRef[]) : [];
        setNotebooks((prev) =>
          prev
            ? prev.map((nb) =>
                nb.id === notebookId
                  ? { ...nb, documents: docs, documentsLoaded: true, sectionsLoaded: true }
                  : nb
              )
            : prev
        );
      } catch {
        setNotebooks((prev) =>
          prev
            ? prev.map((nb) =>
                nb.id === notebookId
                  ? { ...nb, documents: [], documentsLoaded: true, sectionsLoaded: true }
                  : nb
              )
            : prev
        );
      }
      return;
    }

    try {
      const [secRes, docRes] = await Promise.all([
        fetch(`/api/notebooks/${notebookId}/sections`),
        fetch(`/api/notebooks/${notebookId}/documents`),
      ]);
      const secJson = await secRes.json();
      const docJson = await docRes.json();
      const sections = secJson?.success ? buildSectionTree(secJson.data as SectionsApiItem[]) : [];
      const docs = docJson?.success ? (docJson.data as DocRef[]) : [];
      setNotebooks((prev) =>
        prev
          ? prev.map((nb) =>
              nb.id === notebookId
                ? {
                    ...nb,
                    sections,
                    documents: docs,
                    sectionsLoaded: true,
                    documentsLoaded: true,
                  }
                : nb
            )
          : prev
      );
    } catch {
      setNotebooks((prev) =>
        prev
          ? prev.map((nb) =>
              nb.id === notebookId
                ? { ...nb, sections: [], documents: [], sectionsLoaded: true, documentsLoaded: true }
                : nb
            )
          : prev
      );
    }
  }, []);

  // Eagerly load the default notebook's contents (and the inbox if it's our
  // only candidate for default doc selection).
  useEffect(() => {
    if (!notebooks) return;
    if (defaultNotebookId) {
      const target = notebooks.find((n) => n.id === defaultNotebookId);
      if (target && !target.sectionsLoaded) {
        void loadNotebookContents(target.id, target.kind);
      }
    }
    // If we have default selected docs, also eagerly load the inbox so the
    // checkbox state shows up.
    if ((defaultContextDocIds?.length ?? 0) > 0) {
      const inbox = notebooks.find((n) => n.kind === 'inbox');
      if (inbox && !inbox.documentsLoaded) {
        void loadNotebookContents(inbox.id, 'inbox');
      }
    }
  }, [notebooks, defaultNotebookId, defaultContextDocIds, loadNotebookContents]);

  const toggleNotebookExpand = (id: string, kind: 'standard' | 'inbox') => {
    setExpandedNotebookIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        const nb = notebooks?.find((n) => n.id === id);
        if (nb && !nb.sectionsLoaded) {
          void loadNotebookContents(id, kind);
        }
      }
      return next;
    });
  };

  const togglePage = (pageId: string) => {
    setSelectedPageIds((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  };
  const toggleDoc = (docId: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  // ── Upload ─────────────────────────────────────────────────────────────
  const uploadFile = useCallback(
    async (file: File, target: { notebookId?: string; toInbox?: boolean }) => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setUploadError('Unsupported file type. Allowed: PDF, DOCX, TXT, MD');
        return;
      }
      setUploadError(null);
      setIsUploading(true);
      try {
        const uploadCtx = target.notebookId ? { notebookId: target.notebookId } : undefined;
        const { storagePath } = await upload(file, 'document', uploadCtx);
        const endpoint = target.notebookId
          ? `/api/notebooks/${target.notebookId}/documents`
          : '/api/learn/uploads';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storagePath, fileName: file.name, fileType: file.type }),
        });
        const json = await res.json();
        if (json.success && json.data?.id) {
          const newDoc = json.data as DocRef;
          setSelectedDocIds((prev) => new Set([...prev, newDoc.id]));
          // Phase 9.6 — fire-and-forget telemetry on successful Inbox upload.
          // Skipped for per-notebook uploads (those have their own funnel).
          if (!target.notebookId) {
            trackEvent('chat.inbox_upload', {
              fileType: file.type,
              fileSizeKb: Math.max(1, Math.round(file.size / 1024)),
            });
          }
          if (target.notebookId) {
            setNotebooks((prev) =>
              prev
                ? prev.map((nb) =>
                    nb.id === target.notebookId
                      ? { ...nb, documents: [newDoc, ...nb.documents], documentsLoaded: true }
                      : nb
                  )
                : prev
            );
            setExpandedNotebookIds((prev) => new Set([...prev, target.notebookId!]));
          } else {
            // Inbox upload — find the inbox row, prepend the doc, and create
            // it locally if it didn't exist yet.
            setNotebooks((prev) => {
              if (!prev) return prev;
              const inboxIdx = prev.findIndex((n) => n.kind === 'inbox');
              if (inboxIdx >= 0) {
                const next = [...prev];
                next[inboxIdx] = {
                  ...next[inboxIdx],
                  documents: [newDoc, ...next[inboxIdx].documents],
                  documentsLoaded: true,
                  sectionsLoaded: true,
                };
                return next;
              }
              return prev;
            });
            // Ensure the inbox row is expanded.
            setNotebooks((prev) => {
              if (!prev) return prev;
              const inbox = prev.find((n) => n.kind === 'inbox');
              if (inbox) {
                setExpandedNotebookIds((p) => new Set([...p, inbox.id]));
              }
              return prev;
            });
          }
        } else {
          setUploadError(json?.error ?? 'Upload failed. Please try again.');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        setUploadError(message);
      } finally {
        setIsUploading(false);
        setUploadTarget(null);
      }
    },
    [upload]
  );

  const handleDrop = (e: React.DragEvent, target: { notebookId?: string; toInbox?: boolean }) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void uploadFile(file, target);
  };

  // ── Attach a pasted YouTube URL as a transcript Document ─────────────────
  // Mirrors ChatThread's `attachYouTubeUrl` notebook-resolution: a default
  // notebook hits the notebook-scoped route, otherwise the learn-scoped route
  // auto-creates/picks the Inbox notebook. The created Document is dropped into
  // the matching list row and pre-selected so it rides into the chat's
  // contextDocIds at create time. A 422 (no captions) re-throws the mask's
  // CaptionsUnavailable error so the card renders the upsell inline.
  const attachYouTubeUrl = useCallback(
    async (url: string) => {
      const endpoint = defaultNotebookId
        ? `/api/notebooks/${defaultNotebookId}/documents/youtube`
        : '/api/learn/documents/youtube';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (res.status === 422) {
        throw captionsUnavailableError();
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success || !json.data?.document?.id) {
        throw new Error(json?.error ?? 'Could not add this video.');
      }

      const newDoc = json.data.document as DocRef;
      setSelectedDocIds((prev) => new Set([...prev, newDoc.id]));

      if (defaultNotebookId) {
        setNotebooks((prev) =>
          prev
            ? prev.map((nb) =>
                nb.id === defaultNotebookId
                  ? { ...nb, documents: [newDoc, ...nb.documents], documentsLoaded: true }
                  : nb
              )
            : prev
        );
        setExpandedNotebookIds((prev) => new Set([...prev, defaultNotebookId]));
      } else {
        setNotebooks((prev) => {
          if (!prev) return prev;
          const inboxIdx = prev.findIndex((n) => n.kind === 'inbox');
          if (inboxIdx >= 0) {
            const next = [...prev];
            next[inboxIdx] = {
              ...next[inboxIdx],
              documents: [newDoc, ...next[inboxIdx].documents],
              documentsLoaded: true,
              sectionsLoaded: true,
            };
            setExpandedNotebookIds((p) => new Set([...p, next[inboxIdx].id]));
            return next;
          }
          return prev;
        });
      }
    },
    [defaultNotebookId]
  );

  // ── Submit ─────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    const chatTitle = title.trim() || undefined;
    setIsCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/learn/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: chatTitle,
          contextPageIds: [...selectedPageIds],
          contextDocIds: [...selectedDocIds],
        }),
      });
      const json = await res.json();
      if (json.success && json.data?.id) {
        // Phase 9.6 — fire-and-forget telemetry when the user spans more
        // than one notebook in a single chat (the headline product win of
        // Phase 9). `hasInbox` flags whether any selected source was an
        // Inbox doc — we infer it from the notebooks list we already loaded.
        const ctxIds: string[] = Array.isArray(json.data?.contextNotebookIds)
          ? json.data.contextNotebookIds
          : [];
        if (ctxIds.length > 1) {
          const inboxIds = new Set(
            (notebooks ?? []).filter((n) => n.kind === 'inbox').map((n) => n.id)
          );
          const hasInbox = ctxIds.some((id) => inboxIds.has(id));
          trackEvent('chat.multi_notebook_created', {
            contextNotebookCount: ctxIds.length,
            hasInbox,
          });
        }
        onCreate(json.data.id);
      } else {
        setCreateError(json.error ?? 'Failed to create chat. Please try again.');
      }
    } catch (err) {
      console.error('[CreateChatModal] Failed to create chat:', err);
      setCreateError('Network error. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const totalContext = selectedPageIds.size + selectedDocIds.size;

  // Selected counts per notebook (for chip display).
  const perNotebookSelected = useMemo(() => {
    const out = new Map<string, { pages: number; docs: number; total: number }>();
    if (!notebooks) return out;
    for (const nb of notebooks) {
      const pages = countSelectedPagesInTree(nb.sections, selectedPageIds);
      const docs = nb.documents.filter((d) => selectedDocIds.has(d.id)).length;
      out.set(nb.id, { pages, docs, total: pages + docs });
    }
    return out;
  }, [notebooks, selectedPageIds, selectedDocIds]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 1000,
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: isPhone ? 0 : '50%',
          left: isPhone ? 0 : '50%',
          transform: isPhone ? 'none' : 'translate(-50%, -50%)',
          zIndex: 1001,
          width: isPhone ? '100vw' : '620px',
          height: isPhone ? '100dvh' : undefined,
          maxWidth: isPhone ? 'none' : 'calc(100vw - 40px)',
          maxHeight: isPhone ? 'none' : 'calc(100vh - 40px)',
          background: 'var(--background)',
          border: isPhone ? 'none' : '1px solid rgba(174,137,255,0.40)',
          borderRadius: isPhone ? 0 : '20px',
          boxShadow: isPhone
            ? 'none'
            : '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px var(--ink-08) inset',
          fontFamily: 'inherit',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: isPhone ? '16px 16px 14px' : '20px 24px 16px',
            borderBottom: '1px solid rgba(174,137,255,0.20)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '16px',
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '7px',
                  background: 'rgba(140,82,255,0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '14px', color: '#c4a9ff', fontVariationSettings: "'FILL' 1" }}
                >
                  auto_fix_high
                </span>
              </div>
              <h2
                style={{
                  margin: 0,
                  fontSize: '16px',
                  fontWeight: 700,
                  color: 'var(--on-surface)',
                  letterSpacing: '-0.01em',
                }}
              >
                New {mageName} Chat
              </h2>
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--on-surface-variant)' }}>
              Pick pages and uploads to feed {mageName} — across any of your notebooks.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--ink-08)',
              color: 'var(--ink-40)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'background 0.12s, color 0.12s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--ink-12)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--on-surface)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--ink-08)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-40)';
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>close</span>
          </button>
        </div>

        {/* Scrollable body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: isPhone ? '14px 16px 20px' : '18px 24px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Picker — notebooks list */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '8px',
              }}
            >
              <label
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--on-surface-variant)',
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                }}
              >
                Feed {mageName}
              </label>
              {totalContext > 0 && (
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    background: 'rgba(140,82,255,0.2)',
                    border: '1px solid rgba(140,82,255,0.3)',
                    fontSize: '10px',
                    fontWeight: 700,
                    color: 'var(--md-h4)',
                    letterSpacing: '0.04em',
                  }}
                >
                  {totalContext} selected
                </span>
              )}
            </div>

            <div
              style={{
                background: 'var(--ink-04)',
                borderRadius: '12px',
                border: '1px solid var(--ink-12)',
                overflow: 'hidden',
              }}
            >
              {notebooks === null ? (
                <div style={{ padding: '24px', textAlign: 'center' }}>
                  <p style={{ fontSize: '13px', color: 'var(--on-surface-variant)', margin: 0 }}>
                    Loading notebooks…
                  </p>
                </div>
              ) : notebooksError && notebooks.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center' }}>
                  <p style={{ fontSize: '13px', color: 'var(--error)', margin: 0 }}>
                    {notebooksError}
                  </p>
                </div>
              ) : notebooks.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center' }}>
                  <p style={{ fontSize: '13px', color: 'var(--on-surface-variant)', margin: 0 }}>
                    No notebooks yet. Create one first, or drop a file below.
                  </p>
                </div>
              ) : (
                notebooks.map((nb) => {
                  const expanded = expandedNotebookIds.has(nb.id);
                  const counts = perNotebookSelected.get(nb.id) ?? { pages: 0, docs: 0, total: 0 };
                  const isInbox = nb.kind === 'inbox';
                  return (
                    <div key={nb.id} style={{ borderBottom: '1px solid var(--ink-12)' }}>
                      <button
                        type="button"
                        onClick={() => toggleNotebookExpand(nb.id, nb.kind)}
                        aria-expanded={expanded}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          width: '100%',
                          padding: '12px 14px',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--on-surface)',
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background =
                            'var(--ink-08)';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                        }}
                      >
                        <span
                          style={{
                            color: 'var(--on-surface-variant)',
                            display: 'flex',
                            transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
                            transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>expand_more</span>
                        </span>
                        {isInbox ? (
                          <span
                            className="material-symbols-outlined"
                            style={{ fontSize: '18px', color: 'var(--on-surface-variant)' }}
                          >
                            mail
                          </span>
                        ) : (
                          <span
                            style={{
                              width: '10px',
                              height: '10px',
                              borderRadius: '9999px',
                              background: nb.color ?? 'var(--outline)',
                              border: '1px solid var(--outline-variant)',
                              flexShrink: 0,
                            }}
                          />
                        )}
                        <span
                          style={{
                            flex: 1,
                            fontSize: '14px',
                            fontWeight: 600,
                            color: 'var(--on-surface)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {isInbox ? 'Inbox / uploads' : nb.name}
                        </span>
                        <span
                          style={{
                            fontSize: '11px',
                            color: 'var(--on-surface-variant)',
                            fontWeight: 600,
                          }}
                        >
                          {isInbox
                            ? counts.docs > 0
                              ? `${counts.docs}/${nb.documents.length || '…'}`
                              : `${nb.documents.length || ''}`.trim()
                            : `${counts.total}/${nb.pageCount}`}
                        </span>
                      </button>

                      {expanded && (
                        <div style={{ padding: '0 0 8px' }}>
                          {!nb.sectionsLoaded ? (
                            <div style={{ padding: '12px 14px' }}>
                              <span
                                style={{
                                  fontSize: '12px',
                                  color: 'var(--on-surface-variant)',
                                }}
                              >
                                Loading…
                              </span>
                            </div>
                          ) : isInbox ? (
                            <InboxDocsList
                              documents={nb.documents}
                              selectedDocIds={selectedDocIds}
                              onToggle={toggleDoc}
                            />
                          ) : (
                            <>
                              {nb.sections.length === 0 && nb.documents.length === 0 ? (
                                <div style={{ padding: '10px 14px' }}>
                                  <span
                                    style={{
                                      fontSize: '12px',
                                      color: 'var(--on-surface-variant)',
                                    }}
                                  >
                                    No pages or documents yet.
                                  </span>
                                </div>
                              ) : (
                                <>
                                  {nb.sections.map((section) => (
                                    <SectionPickerItem
                                      key={section.id}
                                      section={section}
                                      selectedPageIds={selectedPageIds}
                                      onTogglePage={togglePage}
                                      depth={0}
                                    />
                                  ))}
                                  {nb.documents.length > 0 && (
                                    <NotebookDocsList
                                      documents={nb.documents}
                                      selectedDocIds={selectedDocIds}
                                      onToggle={toggleDoc}
                                    />
                                  )}
                                </>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Upload zone */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--on-surface-variant)',
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                marginBottom: '8px',
              }}
            >
              Upload file
            </label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) =>
                handleDrop(e, defaultNotebookId ? { notebookId: defaultNotebookId } : { toInbox: true })
              }
              onClick={() => {
                setUploadTarget(defaultNotebookId ?? 'inbox');
                fileInputRef.current?.click();
              }}
              style={{
                borderRadius: '12px',
                border: `2px dashed ${isDragging ? 'rgba(140,82,255,0.7)' : 'rgba(70,69,96,0.4)'}`,
                background: isDragging ? 'rgba(140,82,255,0.05)' : 'var(--ink-04)',
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                cursor: 'pointer',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const target = uploadTarget;
                  void uploadFile(
                    f,
                    target && target !== 'inbox' ? { notebookId: target } : { toInbox: true }
                  );
                  // Reset for next selection
                  e.target.value = '';
                }}
              />
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  flexShrink: 0,
                  background: 'rgba(140,82,255,0.12)',
                  border: '1px solid rgba(140,82,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isUploading ? (
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 18, color: 'var(--md-h4)', animation: 'spin 0.8s linear infinite' }}
                    aria-hidden
                  >
                    progress_activity
                  </span>
                ) : (
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--md-h4)' }} aria-hidden>upload</span>
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    margin: '0 0 2px',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: 'var(--on-surface)',
                  }}
                >
                  {isUploading ? 'Uploading…' : 'Drop file or click to browse'}
                </p>
                <p style={{ margin: 0, fontSize: '11px', color: 'var(--on-surface-variant)' }}>
                  {defaultNotebookId
                    ? 'Uploads attach to the current notebook.'
                    : 'Uploads land in Inbox — they stay available across all chats.'}
                </p>
                {uploadError && (
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#fd6f85' }}>
                    {uploadError}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Add a video */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--on-surface-variant)',
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                marginBottom: '8px',
              }}
            >
              Add a video
            </label>
            <VideoInputMask dense onConfirmUrl={({ url }) => attachYouTubeUrl(url)} />
            <p style={{ margin: '6px 0 0', fontSize: '11px', color: 'var(--on-surface-variant)' }}>
              {defaultNotebookId
                ? 'Transcripts attach to the current notebook.'
                : 'Transcripts land in Inbox — available across all chats.'}
            </p>
          </div>

          {/* Title disclosure */}
          <div>
            {!showTitleInput ? (
              <button
                type="button"
                onClick={() => setShowTitleInput(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--outline-variant)',
                  background: 'transparent',
                  color: 'var(--on-surface-variant)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background 0.12s, color 0.12s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--ink-08)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--on-surface)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--on-surface-variant)';
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>chevron_right</span>
                Custom title (optional)
              </button>
            ) : (
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--on-surface-variant)',
                    letterSpacing: '0.07em',
                    textTransform: 'uppercase',
                    marginBottom: '6px',
                  }}
                >
                  Custom title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Auto-generated from your first message"
                  autoFocus
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    background: 'var(--ink-08)',
                    border: '1px solid rgba(140,82,255,0.2)',
                    borderRadius: 'var(--radius-md)',
                    padding: '9px 12px',
                    fontSize: '14px',
                    color: 'var(--on-surface)',
                    outline: 'none',
                    fontFamily: 'inherit',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={(e) => {
                    (e.currentTarget as HTMLInputElement).style.borderColor =
                      'rgba(140,82,255,0.5)';
                  }}
                  onBlur={(e) => {
                    (e.currentTarget as HTMLInputElement).style.borderColor =
                      'rgba(140,82,255,0.2)';
                  }}
                />
              </div>
            )}
          </div>

          {createError && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(253,111,133,0.08)',
                border: '1px solid rgba(253,111,133,0.25)',
                fontSize: '12px',
                color: '#fd6f85',
                fontWeight: 500,
              }}
            >
              {createError}
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <div
          style={{
            padding: isPhone ? '12px 16px 16px' : '14px 24px 18px',
            borderTop: '1px solid rgba(174,137,255,0.16)',
            display: 'flex',
            gap: '10px',
            justifyContent: 'flex-end',
            flexShrink: 0,
            background: 'var(--background)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 20px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--ink-08)',
              background: 'transparent',
              color: 'var(--on-surface-variant)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'background 0.12s, color 0.12s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--ink-08)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--on-surface)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--on-surface-variant)';
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={isCreating}
            style={{
              padding: '10px 24px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: isCreating ? 'rgba(140,82,255,0.4)' : '#8c52ff',
              color: 'var(--on-surface)',
              fontSize: '13px',
              fontWeight: 700,
              cursor: isCreating ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              boxShadow: isCreating ? 'none' : '0 4px 16px rgba(140,82,255,0.35)',
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              transition: 'opacity 0.15s, transform 0.15s cubic-bezier(0.22,1,0.36,1)',
            }}
            onMouseEnter={(e) => {
              if (!isCreating) {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
            }}
          >
            {isCreating ? (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 13, animation: 'spin 0.8s linear infinite' }} aria-hidden>progress_activity</span> Creating…
              </>
            ) : (
              <>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}
                >
                  auto_fix_high
                </span>
                Start Chat
              </>
            )}
          </button>
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </>
  );
}

// ── Per-notebook docs list ────────────────────────────────────────────────

function NotebookDocsList({
  documents,
  selectedDocIds,
  onToggle,
}: {
  documents: DocRef[];
  selectedDocIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div style={{ borderTop: '1px solid var(--ink-12)' }}>
      <div
        style={{
          padding: '8px 14px 4px',
          fontSize: '10px',
          fontWeight: 600,
          color: 'var(--on-surface-variant)',
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
        }}
      >
        Documents
      </div>
      {documents.map((doc) => (
        <DocRow
          key={doc.id}
          doc={doc}
          isSelected={selectedDocIds.has(doc.id)}
          onToggle={() => onToggle(doc.id)}
        />
      ))}
    </div>
  );
}

function InboxDocsList({
  documents,
  selectedDocIds,
  onToggle,
}: {
  documents: DocRef[];
  selectedDocIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (documents.length === 0) {
    return (
      <div style={{ padding: '10px 14px' }}>
        <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)' }}>
          No uploads yet. Drop a file below to start.
        </span>
      </div>
    );
  }
  return (
    <div>
      {documents.map((doc) => (
        <DocRow
          key={doc.id}
          doc={doc}
          isSelected={selectedDocIds.has(doc.id)}
          onToggle={() => onToggle(doc.id)}
        />
      ))}
    </div>
  );
}

function DocRow({
  doc,
  isSelected,
  onToggle,
}: {
  doc: DocRef;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const isVideo = isVideoDoc(doc);
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 14px 8px 28px',
        cursor: 'pointer',
        background: isSelected ? 'rgba(140,82,255,0.08)' : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      <div
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '4px',
          flexShrink: 0,
          border: `1.5px solid ${isSelected ? '#8c52ff' : 'rgba(140,82,255,0.25)'}`,
          background: isSelected ? '#8c52ff' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'border-color 0.1s, background 0.1s',
        }}
      >
        {isSelected && <span className="material-symbols-outlined" style={{ fontSize: 10, color: 'var(--on-surface)' }} aria-hidden>check</span>}
      </div>
      <span
        className="material-symbols-outlined"
        aria-hidden
        style={{ fontSize: 15, color: 'var(--on-surface-variant)', flexShrink: 0 }}
      >
        {isVideo ? 'smart_display' : 'description'}
      </span>
      <span
        style={{
          fontSize: '12px',
          color: 'var(--on-surface)',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {doc.fileName}
      </span>
      {isVideo && (
        <span
          style={{
            fontSize: '10px',
            fontWeight: 600,
            color: 'var(--on-surface-variant)',
            letterSpacing: '0.04em',
            flexShrink: 0,
          }}
        >
          Video
        </span>
      )}
      <span style={{ fontSize: '10px', color: 'var(--on-surface-variant)', flexShrink: 0 }}>
        {formatBytes(doc.fileSize)}
      </span>
    </div>
  );
}

// ── Section picker tree item ──────────────────────────────────────────────

function SectionPickerItem({
  section,
  selectedPageIds,
  onTogglePage,
  depth,
}: {
  section: SectionRef;
  selectedPageIds: Set<string>;
  onTogglePage: (id: string) => void;
  depth: number;
}) {
  const [open, setOpen] = useState(true);
  const hasPages = section.pages.length > 0;
  const hasChildren = (section.children?.length ?? 0) > 0;

  return (
    <div>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: `7px 14px 7px ${28 + depth * 14}px`,
          cursor: 'pointer',
        }}
      >
        <span style={{ color: 'var(--on-surface-variant)', display: 'flex' }}>
          {open ? <span className="material-symbols-outlined" style={{ fontSize: 11 }} aria-hidden>expand_more</span> : <span className="material-symbols-outlined" style={{ fontSize: 11 }} aria-hidden>chevron_right</span>}
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--on-surface-variant)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            flex: 1,
          }}
        >
          {section.title}
        </span>
        {hasPages && (
          <span style={{ fontSize: '10px', color: 'var(--on-surface-variant)' }}>
            {section.pages.filter((p) => selectedPageIds.has(p.id)).length}/{section.pages.length}
          </span>
        )}
      </div>

      {open && (
        <>
          {section.pages.map((page) => {
            const isSelected = selectedPageIds.has(page.id);
            return (
              <div
                key={page.id}
                onClick={() => onTogglePage(page.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: `7px 14px 7px ${40 + depth * 14}px`,
                  cursor: 'pointer',
                  background: isSelected ? 'rgba(140,82,255,0.08)' : 'transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected)
                    (e.currentTarget as HTMLDivElement).style.background = 'var(--ink-08)';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected)
                    (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                }}
              >
                <div
                  style={{
                    width: '15px',
                    height: '15px',
                    borderRadius: '4px',
                    flexShrink: 0,
                    border: `1.5px solid ${isSelected ? '#8c52ff' : 'rgba(140,82,255,0.25)'}`,
                    background: isSelected ? '#8c52ff' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'border-color 0.1s, background 0.1s',
                  }}
                >
                  {isSelected && <span className="material-symbols-outlined" style={{ fontSize: 9, color: 'var(--on-surface)' }} aria-hidden>check</span>}
                </div>
                <span
                  style={{
                    fontSize: '12px',
                    color: isSelected ? 'var(--on-surface)' : 'var(--on-surface-variant)',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {page.title}
                </span>
              </div>
            );
          })}
          {section.children?.map((child) => (
            <SectionPickerItem
              key={child.id}
              section={child}
              selectedPageIds={selectedPageIds}
              onTogglePage={onTogglePage}
              depth={depth + 1}
            />
          ))}
          {!hasPages && !hasChildren && (
            <div style={{ padding: `6px 14px 6px ${40 + depth * 14}px` }}>
              <span style={{ fontSize: '11px', color: 'var(--on-surface-variant)' }}>
                No pages
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
