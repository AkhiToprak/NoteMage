'use client';

import React, { useState, useEffect, useCallback } from 'react';

const COLORS = {
  pageBg: '#1a1a36',
  cardBg: '#21213e',
  elevated: '#2d2d52',
  inputBg: '#35355c',
  primary: '#ae89ff',
  deepPurple2: '#8348f6',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  yellow: '#ffde59',
  border: '#555578',
  success: '#4ade80',
} as const;

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

interface FolderOption {
  id: string;
  name: string;
  color: string | null;
  _count?: { children: number; notebooks: number };
}

interface NotebookOption {
  id: string;
  name: string;
  subject: string | null;
  folderId: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  groupId: string;
  sharedId: string;
  contentType: string;
  contentTitle: string;
  onSaved: () => void;
}

export default function SaveDestinationModal({
  open,
  onClose,
  groupId,
  sharedId,
  contentType,
  contentTitle,
  onSaved,
}: Props) {
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [notebooks, setNotebooks] = useState<NotebookOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // For notebook type: pick a folder (or root)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  // For other types: pick a notebook or create new
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(null);
  const [createNew, setCreateNew] = useState(false);
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  // Section picker (for flashcard_set and quiz_set after selecting a notebook)
  const [sections, setSections] = useState<{ id: string; title: string; sortOrder: number }[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [creatingSection, setCreatingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const needsSection = contentType === 'flashcard_set' || contentType === 'quiz_set';
  // Folder browsing for non-notebook types
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<{ id: string | null; name: string }[]>([
    { id: null, name: 'My Library' },
  ]);

  const [search, setSearch] = useState('');
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [hoveredClose, setHoveredClose] = useState(false);

  const isNotebook = contentType === 'notebook';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [foldersRes, notebooksRes] = await Promise.all([
        fetch('/api/notebook-folders?parentId=root'),
        isNotebook ? Promise.resolve(null) : fetch('/api/notebooks?folderId=all'),
      ]);

      if (foldersRes.ok) {
        const fJson = await foldersRes.json();
        setFolders(fJson.data || []);
      }
      if (notebooksRes && notebooksRes.ok) {
        const nJson = await notebooksRes.json();
        const list = nJson.data?.notebooks || nJson.data || [];
        setNotebooks(list);
      }
    } catch {
      setError('Failed to load data');
    }
    setLoading(false);
  }, [isNotebook]);

  // Fetch sections when a notebook is selected (for flashcard/quiz types)
  useEffect(() => {
    if (!needsSection || !selectedNotebookId) {
      setSections([]);
      setSelectedSectionId(null);
      return;
    }
    setSectionsLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/notebooks/${selectedNotebookId}/sections`);
        if (res.ok) {
          const json = await res.json();
          const raw: Array<{ id: string; title: string; sortOrder?: number }> =
            json.data?.sections || json.data || [];
          setSections(raw.map((s) => ({ id: s.id, title: s.title, sortOrder: s.sortOrder || 0 })));
        }
      } catch {
        /* ignore */
      }
      setSectionsLoading(false);
    })();
  }, [selectedNotebookId, needsSection]);

  // Fetch subfolders when navigating
  const fetchSubfolders = useCallback(async (parentId: string | null) => {
    try {
      const param = parentId || 'root';
      const res = await fetch(`/api/notebook-folders?parentId=${param}`);
      if (res.ok) {
        const json = await res.json();
        setFolders(json.data || []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchData();
      setSearch('');
      setSelectedFolderId(null);
      setSelectedNotebookId(null);
      setCreateNew(false);
      setCurrentFolderId(null);
      setFolderPath([{ id: null, name: 'My Library' }]);
      setSaving(false);
      setSaved(false);
      setError(null);
    }
  }, [open, fetchData]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const navigateToFolder = (folderId: string | null, folderName: string) => {
    if (folderId === currentFolderId) return;
    setCurrentFolderId(folderId);
    if (folderId === null) {
      setFolderPath([{ id: null, name: 'My Library' }]);
    } else {
      const existingIdx = folderPath.findIndex((p) => p.id === folderId);
      if (existingIdx >= 0) {
        setFolderPath(folderPath.slice(0, existingIdx + 1));
      } else {
        setFolderPath([...folderPath, { id: folderId, name: folderName }]);
      }
    }
    fetchSubfolders(folderId);
    setSelectedFolderId(null);
    setSelectedNotebookId(null);
  };

  const handleSave = async () => {
    if (saving || saved) return;
    setSaving(true);
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: any = {};
      if (isNotebook) {
        // For notebooks: resolve folder ID — '__current__' means current browsed folder, else specific folder
        const fid = selectedFolderId === '__current__' ? currentFolderId : selectedFolderId;
        if (fid) body.targetFolderId = fid;
      } else {
        // For other types: pass notebook ID or nothing (creates new)
        if (!createNew && selectedNotebookId) {
          body.targetNotebookId = selectedNotebookId;
          if (selectedSectionId) body.targetSectionId = selectedSectionId;
        }
      }
      const res = await fetch(`/api/groups/${groupId}/shared/${sharedId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || 'Failed to save');
      }
      setSaved(true);
      onSaved();
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
    setSaving(false);
  };

  if (!open) return null;

  // Filter notebooks in the current folder view
  const notebooksInFolder = notebooks.filter((nb) => {
    const inFolder = currentFolderId ? nb.folderId === currentFolderId : !nb.folderId;
    if (!search.trim()) return inFolder;
    return inFolder && nb.name.toLowerCase().includes(search.toLowerCase());
  });

  const filteredFolders = search.trim()
    ? folders.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    : folders;

  const canSave =
    isNotebook ||
    createNew ||
    (needsSection ? selectedNotebookId && selectedSectionId : selectedNotebookId);

  return (
    <>
      <style>{`
        @keyframes sdmFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes sdmSlideUp { from { opacity: 0; transform: translateY(20px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .sdm-scroll::-webkit-scrollbar { width: 6px; }
        .sdm-scroll::-webkit-scrollbar-track { background: transparent; }
        .sdm-scroll::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 3px; }
      `}</style>

      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'sdmFadeIn 0.2s ease-out',
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          style={{
            maxWidth: 520,
            width: 'calc(100% - 32px)',
            maxHeight: 'calc(100vh - 64px)',
            background: COLORS.cardBg,
            borderRadius: 24,
            boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
            animation: `sdmSlideUp 0.3s ${EASING}`,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{ padding: '24px 28px 16px', borderBottom: `1px solid ${COLORS.border}1a` }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 4,
              }}
            >
              <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>
                Save to Library
              </h2>
              <button
                onClick={onClose}
                onMouseEnter={() => setHoveredClose(true)}
                onMouseLeave={() => setHoveredClose(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: hoveredClose ? COLORS.textPrimary : COLORS.textMuted,
                  transition: `color 0.2s ${EASING}`,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
                  close
                </span>
              </button>
            </div>
            <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: 0 }}>{contentTitle}</p>
          </div>

          {/* Breadcrumb */}
          <div
            style={{
              padding: '12px 28px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              flexWrap: 'wrap',
            }}
          >
            {folderPath.map((crumb, idx) => (
              <React.Fragment key={crumb.id ?? 'root'}>
                {idx > 0 && (
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 16, color: COLORS.textMuted }}
                  >
                    chevron_right
                  </span>
                )}
                <button
                  onClick={() => navigateToFolder(crumb.id, crumb.name)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    color: idx === folderPath.length - 1 ? COLORS.textPrimary : COLORS.textMuted,
                    transition: `color 0.15s ${EASING}`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = COLORS.primary;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color =
                      idx === folderPath.length - 1 ? COLORS.textPrimary : COLORS.textMuted;
                  }}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: '8px 20px 0' }}>
            <div style={{ position: 'relative' }}>
              <span
                className="material-symbols-outlined"
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: 18,
                  color: COLORS.textMuted,
                  pointerEvents: 'none',
                }}
              >
                search
              </span>
              <input
                type="text"
                placeholder={isNotebook ? 'Search folders...' : 'Search...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  background: COLORS.inputBg,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 10,
                  padding: '10px 12px 10px 38px',
                  fontSize: 13,
                  color: COLORS.textPrimary,
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: `border-color 0.2s ${EASING}`,
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = COLORS.primary;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = COLORS.border;
                }}
              />
            </div>
          </div>

          {error && (
            <div style={{ padding: '8px 28px 0', fontSize: 13, color: '#fd6f85' }}>{error}</div>
          )}

          {/* Content list */}
          <div
            className="sdm-scroll"
            style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 12px', maxHeight: 340 }}
          >
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0' }}>
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px' }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: COLORS.elevated,
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          width: '55%',
                          height: 14,
                          borderRadius: 6,
                          background: COLORS.elevated,
                          marginBottom: 5,
                        }}
                      />
                      <div
                        style={{
                          width: '30%',
                          height: 11,
                          borderRadius: 6,
                          background: COLORS.elevated,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {/* ── For notebook type: pick folder destination ── */}
                {isNotebook && (
                  <>
                    {/* Save to current folder (root or whatever we browsed to) */}
                    <ItemRow
                      icon="save"
                      iconBg={COLORS.primary}
                      label={currentFolderId ? 'Save here' : 'Save to root (no folder)'}
                      sublabel={
                        currentFolderId
                          ? `Inside "${folderPath[folderPath.length - 1]?.name}"`
                          : 'Top level of your library'
                      }
                      selected={selectedFolderId === '__current__'}
                      hovered={hoveredItem === '__current__'}
                      onHover={(h) => setHoveredItem(h ? '__current__' : null)}
                      onClick={() => setSelectedFolderId('__current__')}
                      dashed
                    />
                    {/* Subfolders to navigate into */}
                    {filteredFolders.map((f) => (
                      <FolderRow
                        key={f.id}
                        folder={f}
                        hovered={hoveredItem === f.id}
                        onHover={(h) => setHoveredItem(h ? f.id : null)}
                        onNavigate={() => navigateToFolder(f.id, f.name)}
                        onSelect={() => {
                          setSelectedFolderId(f.id);
                        }}
                        selected={selectedFolderId === f.id}
                      />
                    ))}
                    {filteredFolders.length === 0 && !loading && (
                      <EmptyState search={search} icon="folder_off" text="No subfolders here" />
                    )}
                  </>
                )}

                {/* ── For flashcards/quizzes/documents: pick notebook ── */}
                {!isNotebook && (
                  <>
                    {/* Create new notebook — NOT available for flashcard/quiz sets */}
                    {!needsSection && (
                      <ItemRow
                        icon="add"
                        iconBg={COLORS.primary}
                        label="Create New Notebook"
                        sublabel="Save into a brand new notebook"
                        selected={createNew}
                        hovered={hoveredItem === '__new__'}
                        onHover={(h) => setHoveredItem(h ? '__new__' : null)}
                        onClick={() => {
                          setCreateNew(true);
                          setSelectedNotebookId(null);
                        }}
                        dashed
                      />
                    )}

                    {/* Download as CSV — only for flashcard sets */}
                    {contentType === 'flashcard_set' && (
                      <ItemRow
                        icon="download"
                        iconBg={COLORS.yellow}
                        iconColor="#5f4f00"
                        label="Download as CSV"
                        sublabel="Export flashcards to a spreadsheet"
                        selected={false}
                        hovered={hoveredItem === '__csv__'}
                        onHover={(h) => setHoveredItem(h ? '__csv__' : null)}
                        onClick={async () => {
                          if (downloadingCsv) return;
                          setDownloadingCsv(true);
                          try {
                            const res = await fetch(
                              `/api/groups/${groupId}/shared/${sharedId}/csv`
                            );
                            if (res.ok) {
                              const blob = await res.blob();
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `${contentTitle.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;
                              a.click();
                              URL.revokeObjectURL(url);
                            }
                          } catch {
                            /* ignore */
                          }
                          setDownloadingCsv(false);
                        }}
                        dashed
                      />
                    )}

                    {/* Folders to navigate into */}
                    {filteredFolders.map((f) => (
                      <FolderRow
                        key={f.id}
                        folder={f}
                        hovered={hoveredItem === `folder-${f.id}`}
                        onHover={(h) => setHoveredItem(h ? `folder-${f.id}` : null)}
                        onNavigate={() => navigateToFolder(f.id, f.name)}
                      />
                    ))}

                    {/* Notebooks in current folder */}
                    {notebooksInFolder.map((nb) => {
                      const isSelected = !createNew && selectedNotebookId === nb.id;
                      return (
                        <ItemRow
                          key={nb.id}
                          icon="auto_stories"
                          iconBg={`linear-gradient(135deg, ${COLORS.primary}, ${COLORS.deepPurple2})`}
                          iconColor="#fff"
                          label={nb.name}
                          sublabel={nb.subject || undefined}
                          selected={isSelected}
                          hovered={hoveredItem === nb.id}
                          onHover={(h) => setHoveredItem(h ? nb.id : null)}
                          onClick={() => {
                            setSelectedNotebookId(nb.id);
                            setCreateNew(false);
                          }}
                        />
                      );
                    })}

                    {filteredFolders.length === 0 && notebooksInFolder.length === 0 && !loading && (
                      <EmptyState
                        search={search}
                        icon={search ? 'search_off' : 'auto_stories'}
                        text={search ? 'No results' : 'Empty folder'}
                      />
                    )}

                    {/* Section picker — shown after selecting a notebook for flashcard/quiz types */}
                    {needsSection && selectedNotebookId && !createNew && (
                      <div
                        style={{
                          marginTop: 12,
                          paddingTop: 12,
                          borderTop: `1px solid ${COLORS.border}1a`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            color: COLORS.textMuted,
                            marginBottom: 8,
                            paddingLeft: 4,
                          }}
                        >
                          Choose a section
                        </div>

                        {/* Create new section */}
                        {!creatingSection ? (
                          <ItemRow
                            icon="add"
                            iconBg={COLORS.primary}
                            label="Create New Section"
                            sublabel="Name a new section for this content"
                            selected={false}
                            hovered={hoveredItem === '__new_section__'}
                            onHover={(h) => setHoveredItem(h ? '__new_section__' : null)}
                            onClick={() => {
                              setCreatingSection(true);
                              setSelectedSectionId(null);
                              setNewSectionName('');
                            }}
                            dashed
                          />
                        ) : (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '8px 12px',
                              border: `2px solid ${COLORS.primary}`,
                              borderRadius: 12,
                              background: `${COLORS.primary}0d`,
                              marginBottom: 2,
                            }}
                          >
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 10,
                                flexShrink: 0,
                                background: `${COLORS.primary}1a`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <span
                                className="material-symbols-outlined"
                                style={{ fontSize: 18, color: COLORS.primary }}
                              >
                                add
                              </span>
                            </div>
                            <input
                              autoFocus
                              value={newSectionName}
                              onChange={(e) => setNewSectionName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                  setCreatingSection(false);
                                  setNewSectionName('');
                                }
                              }}
                              placeholder="Section name..."
                              maxLength={100}
                              style={{
                                flex: 1,
                                background: 'transparent',
                                border: 'none',
                                outline: 'none',
                                color: COLORS.textPrimary,
                                fontSize: 14,
                                fontWeight: 600,
                                fontFamily: 'inherit',
                              }}
                            />
                            <button
                              onClick={async () => {
                                if (!newSectionName.trim() || !selectedNotebookId) return;
                                try {
                                  const res = await fetch(
                                    `/api/notebooks/${selectedNotebookId}/sections`,
                                    {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ title: newSectionName.trim() }),
                                    }
                                  );
                                  if (res.ok) {
                                    const json = await res.json();
                                    const newId = json.data?.id;
                                    if (newId) {
                                      setSections((prev) => [
                                        ...prev,
                                        {
                                          id: newId,
                                          title: newSectionName.trim(),
                                          sortOrder: prev.length,
                                        },
                                      ]);
                                      setSelectedSectionId(newId);
                                      setCreatingSection(false);
                                      setNewSectionName('');
                                    }
                                  }
                                } catch {
                                  /* ignore */
                                }
                              }}
                              disabled={!newSectionName.trim()}
                              style={{
                                background: newSectionName.trim()
                                  ? COLORS.primary
                                  : COLORS.elevated,
                                color: newSectionName.trim() ? '#fff' : COLORS.textMuted,
                                border: 'none',
                                borderRadius: 8,
                                padding: '6px 12px',
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: newSectionName.trim() ? 'pointer' : 'default',
                                fontFamily: 'inherit',
                              }}
                            >
                              Create
                            </button>
                          </div>
                        )}

                        {sectionsLoading ? (
                          <div
                            style={{
                              padding: '16px 0',
                              textAlign: 'center',
                              color: COLORS.textMuted,
                              fontSize: 13,
                            }}
                          >
                            Loading sections...
                          </div>
                        ) : sections.length === 0 && !creatingSection ? (
                          <div
                            style={{
                              padding: '16px 0',
                              textAlign: 'center',
                              color: COLORS.textMuted,
                              fontSize: 13,
                            }}
                          >
                            No sections yet — create one above
                          </div>
                        ) : (
                          sections.map((s) => (
                            <ItemRow
                              key={s.id}
                              icon="segment"
                              iconBg={COLORS.primary}
                              label={s.title}
                              selected={selectedSectionId === s.id}
                              hovered={hoveredItem === `section-${s.id}`}
                              onHover={(h) => setHoveredItem(h ? `section-${s.id}` : null)}
                              onClick={() => {
                                setSelectedSectionId(s.id);
                                setCreatingSection(false);
                              }}
                            />
                          ))
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: '16px 28px 24px', borderTop: `1px solid ${COLORS.border}1a` }}>
            <button
              onClick={handleSave}
              disabled={saving || saved || (!isNotebook && !canSave)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: '100%',
                padding: '12px 0',
                borderRadius: 12,
                border: 'none',
                background: saved
                  ? COLORS.success
                  : isNotebook || canSave
                    ? `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.deepPurple2})`
                    : COLORS.elevated,
                color: saved ? '#000' : isNotebook || canSave ? '#fff' : COLORS.textMuted,
                fontSize: 14,
                fontWeight: 700,
                fontFamily: 'inherit',
                cursor: saving || saved || (!isNotebook && !canSave) ? 'default' : 'pointer',
                opacity: saving ? 0.7 : 1,
                transition: `opacity 0.2s ${EASING}`,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                {saved ? 'check_circle' : saving ? 'progress_activity' : 'library_add'}
              </span>
              {saved
                ? 'Saved to Library!'
                : saving
                  ? 'Saving...'
                  : getSaveLabel(
                      isNotebook,
                      createNew,
                      selectedNotebookId,
                      selectedFolderId,
                      needsSection,
                      selectedSectionId
                    )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function getSaveLabel(
  isNotebook: boolean,
  createNew: boolean,
  selectedNotebookId: string | null,
  selectedFolderId: string | null,
  needsSection?: boolean,
  selectedSectionId?: string | null
): string {
  if (isNotebook) {
    if (selectedFolderId === '__current__' || selectedFolderId === null)
      return 'Clone Notebook Here';
    return 'Clone into Folder';
  }
  if (createNew) return 'Save to New Notebook';
  if (needsSection && selectedNotebookId && !selectedSectionId) return 'Select a section';
  if (selectedNotebookId) return 'Save to Section';
  return 'Select a destination';
}

/* ── Shared sub-components ── */

function ItemRow({
  icon,
  iconBg,
  iconColor,
  label,
  sublabel,
  selected,
  hovered,
  onHover,
  onClick,
  dashed,
}: {
  icon: string;
  iconBg: string;
  iconColor?: string;
  label: string;
  sublabel?: string;
  selected: boolean;
  hovered: boolean;
  onHover: (h: boolean) => void;
  onClick: () => void;
  dashed?: boolean;
}) {
  return (
    <div
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        borderRadius: 12,
        cursor: 'pointer',
        border: selected
          ? `2px solid ${COLORS.primary}`
          : dashed && !selected
            ? `2px dashed ${hovered ? COLORS.primary : COLORS.border}`
            : '2px solid transparent',
        background: selected ? `${COLORS.primary}0d` : hovered ? COLORS.elevated : 'transparent',
        transition: `background 0.15s ${EASING}, border-color 0.15s ${EASING}`,
        marginBottom: 2,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          flexShrink: 0,
          background: iconBg.includes('gradient') ? iconBg : `${iconBg}1a`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: 18,
            color: iconColor || (iconBg.includes('gradient') ? '#fff' : iconBg),
          }}
        >
          {icon}
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: dashed && !selected ? COLORS.primary : COLORS.textPrimary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
        {sublabel && (
          <div
            style={{
              fontSize: 12,
              color: COLORS.textMuted,
              marginTop: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {sublabel}
          </div>
        )}
      </div>
      {selected && (
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 20, color: COLORS.primary, flexShrink: 0 }}
        >
          check_circle
        </span>
      )}
    </div>
  );
}

function FolderRow({
  folder,
  hovered,
  onHover,
  onNavigate,
  onSelect,
  selected,
}: {
  folder: FolderOption;
  hovered: boolean;
  onHover: (h: boolean) => void;
  onNavigate: () => void;
  onSelect?: () => void;
  selected?: boolean;
}) {
  return (
    <div
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        borderRadius: 12,
        border: selected ? `2px solid ${COLORS.primary}` : '2px solid transparent',
        background: selected ? `${COLORS.primary}0d` : hovered ? COLORS.elevated : 'transparent',
        transition: `background 0.15s ${EASING}, border-color 0.15s ${EASING}`,
        marginBottom: 2,
        cursor: 'pointer',
      }}
    >
      {/* Click folder name to select OR navigate */}
      <div
        onClick={onSelect || onNavigate}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flex: 1,
          minWidth: 0,
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            flexShrink: 0,
            background: folder.color ? `${folder.color}33` : `${COLORS.yellow}1a`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 18, color: folder.color || COLORS.yellow }}
          >
            folder
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: COLORS.textPrimary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {folder.name}
          </div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 1 }}>
            {folder._count?.notebooks || 0} notebooks
            {folder._count?.children ? ` · ${folder._count.children} subfolders` : ''}
          </div>
        </div>
      </div>
      {selected && (
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 20, color: COLORS.primary, flexShrink: 0 }}
        >
          check_circle
        </span>
      )}
      {/* Navigate arrow */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onNavigate();
        }}
        style={{
          background: 'none',
          border: 'none',
          padding: 4,
          cursor: 'pointer',
          color: hovered ? COLORS.primary : COLORS.textMuted,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: `color 0.15s ${EASING}`,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
          chevron_right
        </span>
      </button>
    </div>
  );
}

function EmptyState({ search, icon, text }: { search: string; icon: string; text: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 16px', color: COLORS.textMuted }}>
      <span
        className="material-symbols-outlined"
        style={{ fontSize: 36, opacity: 0.4, display: 'block', marginBottom: 8 }}
      >
        {icon}
      </span>
      <p style={{ fontSize: 13, margin: 0 }}>{search ? 'No results found' : text}</p>
    </div>
  );
}
