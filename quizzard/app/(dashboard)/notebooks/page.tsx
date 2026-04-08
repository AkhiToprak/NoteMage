'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import NotebookCard, { type NotebookData } from '@/components/features/NotebookCard';
import NotebookForm, {
  type FormData as NotebookFormData,
} from '@/components/features/NotebookForm';
import FolderCard, { type FolderData } from '@/components/features/FolderCard';
import FolderForm from '@/components/features/FolderForm';
import FolderBreadcrumbs from '@/components/features/FolderBreadcrumbs';
import { PRESETS, getPresetForSubject } from '@/lib/presets';
import { useSearch } from '@/hooks/useSearch';
import SearchDropdown from '@/components/search/SearchDropdown';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { responsiveValue } from '@/lib/responsive';

const ALL_LABEL = 'All Subjects';

function SkeletonCard() {
  return (
    <div
      style={{
        background: '#12122a',
        borderRadius: '12px',
        overflow: 'hidden',
        minHeight: '160px',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '8px',
          background: 'rgba(174,137,255,0.2)',
        }}
      />
      <div
        style={{
          padding: '24px 24px 24px 40px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '20px',
            borderRadius: '9999px',
            background: 'rgba(229,227,255,0.06)',
          }}
        />
        <div
          style={{
            width: '80%',
            height: '18px',
            borderRadius: '6px',
            background: 'rgba(229,227,255,0.08)',
          }}
        />
        <div
          style={{
            width: '60%',
            height: '14px',
            borderRadius: '5px',
            background: 'rgba(229,227,255,0.05)',
          }}
        />
      </div>
      <style>{`
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      `}</style>
    </div>
  );
}

function NotebooksPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isPhone, isTablet, bp } = useBreakpoint();
  const currentFolderId = searchParams.get('folder') || null;

  const [notebooks, setNotebooks] = useState<NotebookData[]>([]);
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState(ALL_LABEL);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Notebook form state
  const [showForm, setShowForm] = useState(false);
  const [editingNotebook, setEditingNotebook] = useState<NotebookData | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<NotebookData | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Search state
  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    results: searchResults,
    isLoading: searchLoading,
    clearResults,
  } = useSearch('notebooks');
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchDropdownVisible, setSearchDropdownVisible] = useState(false);
  const searchDropdownMouseRef = useRef(false);

  // Folder form state
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [editingFolder, setEditingFolder] = useState<FolderData | null>(null);
  const [folderFormLoading, setFolderFormLoading] = useState(false);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<FolderData | null>(null);
  const [deleteFolderLoading, setDeleteFolderLoading] = useState(false);

  const fetchContents = useCallback(async () => {
    setIsLoading(true);
    try {
      const folderParam = currentFolderId ?? 'root';

      const fetches: Promise<Response>[] = [
        fetch(`/api/notebook-folders?parentId=${folderParam}`),
        fetch(`/api/notebooks?folderId=${folderParam}`),
      ];

      // Fetch breadcrumbs if inside a folder
      if (currentFolderId) {
        fetches.push(fetch(`/api/notebook-folders/${currentFolderId}`));
      }

      const results = await Promise.all(fetches);
      const [foldersJson, notebooksJson] = await Promise.all(
        results.slice(0, 2).map((r) => r.json())
      );

      if (foldersJson.success) setFolders(foldersJson.data);
      if (notebooksJson.success) setNotebooks(notebooksJson.data);

      if (currentFolderId && results[2]) {
        const breadcrumbJson = await results[2].json();
        if (breadcrumbJson.success) {
          setBreadcrumbs(breadcrumbJson.data.breadcrumbs);
        }
      } else {
        setBreadcrumbs([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [currentFolderId]);

  useEffect(() => {
    fetchContents();
  }, [fetchContents]);

  useEffect(() => {
    if (!filterOpen) return;
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [filterOpen]);

  // --- Notebook handlers ---
  const handleCreate = async (data: NotebookFormData) => {
    setFormLoading(true);
    try {
      const res = await fetch('/api/notebooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, folderId: currentFolderId }),
      });
      const json = await res.json();
      if (json.success) {
        setShowForm(false);
        if (data.presetId && json.data?.id) {
          fetch(`/api/notebooks/${json.data.id}/scaffold`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ presetId: data.presetId }),
          }).catch(() => {});
        }
        await fetchContents();
      }
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = async (data: NotebookFormData) => {
    if (!editingNotebook) return;
    setFormLoading(true);
    try {
      const res = await fetch(`/api/notebooks/${editingNotebook.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) {
        setEditingNotebook(null);
        setShowForm(false);
        await fetchContents();
      }
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/notebooks/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setDeleteTarget(null);
        await fetchContents();
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  // --- Folder handlers ---
  const handleFolderNavigate = (folderId: string | null) => {
    if (folderId) {
      router.push(`/notebooks?folder=${folderId}`);
    } else {
      router.push('/notebooks');
    }
  };

  const handleFolderCreate = async (data: { name: string; color?: string }) => {
    setFolderFormLoading(true);
    try {
      const res = await fetch('/api/notebook-folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, parentId: currentFolderId }),
      });
      const json = await res.json();
      if (json.success) {
        setShowFolderForm(false);
        await fetchContents();
      }
    } finally {
      setFolderFormLoading(false);
    }
  };

  const handleFolderRename = async (data: { name: string; color?: string }) => {
    if (!editingFolder) return;
    setFolderFormLoading(true);
    try {
      const res = await fetch(`/api/notebook-folders/${editingFolder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) {
        setEditingFolder(null);
        setShowFolderForm(false);
        await fetchContents();
      }
    } finally {
      setFolderFormLoading(false);
    }
  };

  const handleFolderDelete = async () => {
    if (!deleteFolderTarget) return;
    setDeleteFolderLoading(true);
    try {
      const res = await fetch(`/api/notebook-folders/${deleteFolderTarget.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.success) {
        setDeleteFolderTarget(null);
        await fetchContents();
      }
    } finally {
      setDeleteFolderLoading(false);
    }
  };

  // --- Drag & drop: move notebook into folder ---
  const handleNotebookDragStart = (e: React.DragEvent, notebook: NotebookData) => {
    e.dataTransfer.setData('application/notebook-id', notebook.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDropNotebookIntoFolder = async (notebookId: string, folder: FolderData) => {
    try {
      const res = await fetch(`/api/notebooks/${notebookId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: folder.id }),
      });
      const json = await res.json();
      if (json.success) await fetchContents();
    } catch {
      // silently fail
    }
  };

  const filteredNotebooks =
    activeFilter === 'All Subjects'
      ? notebooks
      : notebooks.filter((nb) => getPresetForSubject(nb.subject)?.label === activeFilter);

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: responsiveValue(bp, { phone: '0 16px', tablet: '0 20px', desktop: '0' }) }}>
      {/* Breadcrumbs */}
      {(currentFolderId || breadcrumbs.length > 0) && (
        <FolderBreadcrumbs
          breadcrumbs={breadcrumbs}
          onNavigate={handleFolderNavigate}
          onDropNotebook={async (notebookId, targetFolderId) => {
            try {
              const res = await fetch(`/api/notebooks/${notebookId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderId: targetFolderId }),
              });
              const json = await res.json();
              if (json.success) await fetchContents();
            } catch {
              /* silently fail */
            }
          }}
        />
      )}

      {/* Toolbar: filter dropdown + add buttons */}
      <div
        style={{
          display: 'flex',
          alignItems: isPhone ? 'stretch' : 'center',
          flexDirection: isPhone ? 'column' : 'row',
          gap: '12px',
          marginBottom: responsiveValue(bp, { phone: '20px', tablet: '24px', desktop: '32px' }),
          flexWrap: 'wrap',
        }}
      >
        {/* Subject filter dropdown */}
        <div ref={filterRef} style={{ position: 'relative' }}>
          {/* Trigger button */}
          <button
            onClick={() => setFilterOpen((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 14px 8px 12px',
              borderRadius: '10px',
              border: `1px solid ${filterOpen ? 'rgba(174,137,255,0.35)' : 'rgba(174,137,255,0.12)'}`,
              background: filterOpen ? 'rgba(174,137,255,0.08)' : '#1a1a2e',
              color: '#e5e3ff',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'border-color 0.15s, background 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {activeFilter !== ALL_LABEL ? (
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: PRESETS.find((p) => p.label === activeFilter)?.color ?? '#ae89ff',
                  flexShrink: 0,
                }}
              />
            ) : (
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '15px', color: 'rgba(174,137,255,0.6)' }}
              >
                filter_list
              </span>
            )}
            <span style={{ color: activeFilter !== ALL_LABEL ? '#e5e3ff' : '#aaa8c8' }}>
              {activeFilter !== ALL_LABEL ? activeFilter : 'All Subjects'}
            </span>
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: '16px',
                color: 'rgba(174,137,255,0.5)',
                marginLeft: '2px',
                transition: 'transform 0.15s',
                transform: filterOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            >
              expand_more
            </span>
          </button>

          {/* Dropdown panel */}
          {filterOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                zIndex: 200,
                background: '#18182e',
                border: '1px solid rgba(174,137,255,0.18)',
                borderRadius: '12px',
                boxShadow: '0 16px 48px rgba(0,0,0,0.4), 0 0 0 1px rgba(174,137,255,0.06)',
                padding: '6px',
                minWidth: '200px',
                animation: 'dropIn 0.12s cubic-bezier(0.22,1,0.36,1)',
              }}
            >
              <style>{`
                @keyframes dropIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }
              `}</style>

              <button
                onClick={() => {
                  setActiveFilter(ALL_LABEL);
                  setFilterOpen(false);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  border: 'none',
                  background: activeFilter === ALL_LABEL ? 'rgba(174,137,255,0.12)' : 'transparent',
                  color: activeFilter === ALL_LABEL ? '#e5e3ff' : '#aaa8c8',
                  fontSize: '13px',
                  fontWeight: activeFilter === ALL_LABEL ? 600 : 400,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (activeFilter !== ALL_LABEL)
                    (e.currentTarget as HTMLButtonElement).style.background =
                      'rgba(174,137,255,0.06)';
                }}
                onMouseLeave={(e) => {
                  if (activeFilter !== ALL_LABEL)
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'rgba(174,137,255,0.4)',
                    flexShrink: 0,
                  }}
                />
                All Subjects
                {activeFilter === ALL_LABEL && (
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: '14px', color: '#ae89ff', marginLeft: 'auto' }}
                  >
                    check
                  </span>
                )}
              </button>

              <div
                style={{ height: '1px', background: 'rgba(174,137,255,0.08)', margin: '4px 6px' }}
              />

              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => {
                    setActiveFilter(preset.label);
                    setFilterOpen(false);
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: 'none',
                    background:
                      activeFilter === preset.label ? 'rgba(174,137,255,0.12)' : 'transparent',
                    color: activeFilter === preset.label ? '#e5e3ff' : '#aaa8c8',
                    fontSize: '13px',
                    fontWeight: activeFilter === preset.label ? 600 : 400,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    if (activeFilter !== preset.label)
                      (e.currentTarget as HTMLButtonElement).style.background =
                        'rgba(174,137,255,0.06)';
                  }}
                  onMouseLeave={(e) => {
                    if (activeFilter !== preset.label)
                      (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  }}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: preset.color,
                      flexShrink: 0,
                    }}
                  />
                  {preset.label}
                  {activeFilter === preset.label && (
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: '14px', color: '#ae89ff', marginLeft: 'auto' }}
                    >
                      check
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Active filter badge */}
        {activeFilter !== ALL_LABEL && (
          <button
            onClick={() => setActiveFilter(ALL_LABEL)}
            title="Clear filter"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px 5px 8px',
              borderRadius: '8px',
              border: `1px solid ${PRESETS.find((p) => p.label === activeFilter)?.color ?? '#ae89ff'}33`,
              background: `${PRESETS.find((p) => p.label === activeFilter)?.color ?? '#ae89ff'}18`,
              color: PRESETS.find((p) => p.label === activeFilter)?.color ?? '#ae89ff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: PRESETS.find((p) => p.label === activeFilter)?.color ?? '#ae89ff',
              }}
            />
            {activeFilter}
            <span className="material-symbols-outlined" style={{ fontSize: '13px', opacity: 0.7 }}>
              close
            </span>
          </button>
        )}

        {/* Search bar */}
        <div style={{ position: 'relative', flex: 1, maxWidth: isPhone ? '100%' : 320 }}>
          <span
            className="material-symbols-outlined"
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 18,
              color: searchFocused ? '#ae89ff' : '#8888a8',
              transition: 'color 0.2s',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            search
          </span>
          <input
            type="text"
            placeholder="Search notebooks, pages, users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => {
              setSearchFocused(true);
              setSearchDropdownVisible(true);
            }}
            onBlur={() => {
              setSearchFocused(false);
              if (!searchDropdownMouseRef.current) setSearchDropdownVisible(false);
            }}
            style={{
              width: '100%',
              padding: '8px 12px 8px 38px',
              borderRadius: 10,
              border: `1.5px solid ${searchFocused ? '#ae89ff' : 'rgba(174,137,255,0.12)'}`,
              background: '#1a1a2e',
              color: '#e5e3ff',
              fontSize: 13,
              outline: 'none',
              fontFamily: 'inherit',
              transition: 'border-color 0.2s',
              boxSizing: 'border-box',
            }}
          />
          <div
            onMouseEnter={() => {
              searchDropdownMouseRef.current = true;
            }}
            onMouseLeave={() => {
              searchDropdownMouseRef.current = false;
            }}
          >
            <SearchDropdown
              query={searchQuery}
              results={searchResults}
              isLoading={searchLoading}
              isVisible={searchDropdownVisible && searchQuery.length >= 2}
              onClose={() => {
                setSearchDropdownVisible(false);
                clearResults();
              }}
              context="notebooks"
            />
          </div>
        </div>

        {/* Right-side buttons */}
        <div style={{ marginLeft: isPhone ? undefined : 'auto', display: 'flex', gap: '10px', width: isPhone ? '100%' : undefined }}>
          {/* New Folder button */}
          <button
            onClick={() => {
              setEditingFolder(null);
              setShowFolderForm(true);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '8px 20px',
              borderRadius: '9999px',
              border: '1px solid rgba(174,137,255,0.25)',
              background: 'transparent',
              color: '#ae89ff',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              flex: isPhone ? 1 : undefined,
              transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1), background 0.2s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.05)';
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(174,137,255,0.08)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
            onMouseDown={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.95)';
            }}
            onMouseUp={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.05)';
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              create_new_folder
            </span>
            New Folder
          </button>

          {/* Add Notebook button */}
          <button
            onClick={() => {
              setEditingNotebook(null);
              setShowForm(true);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '8px 24px',
              borderRadius: '9999px',
              border: 'none',
              background: '#ae89ff',
              color: '#2a0066',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              flex: isPhone ? 1 : undefined,
              boxShadow: '0 4px 16px rgba(174,137,255,0.25)',
              transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
            }}
            onMouseDown={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.95)';
            }}
            onMouseUp={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.05)';
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              add
            </span>
            Add Notebook
          </button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: responsiveValue(bp, { phone: '1fr', tablet: 'repeat(auto-fill, minmax(240px, 1fr))', desktop: 'repeat(auto-fill, minmax(280px, 1fr))' }),
            gap: responsiveValue(bp, { phone: '16px', tablet: '20px', desktop: '24px' }),
          }}
        >
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Grid */}
      {!isLoading && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: responsiveValue(bp, { phone: '1fr', tablet: 'repeat(auto-fill, minmax(240px, 1fr))', desktop: 'repeat(auto-fill, minmax(280px, 1fr))' }),
            gap: responsiveValue(bp, { phone: '16px', tablet: '20px', desktop: '24px' }),
          }}
        >
          {/* Folders first */}
          {folders.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              onClick={(f) => handleFolderNavigate(f.id)}
              onRename={(f) => {
                setEditingFolder(f);
                setShowFolderForm(true);
              }}
              onDelete={(f) => setDeleteFolderTarget(f)}
              onDropNotebook={handleDropNotebookIntoFolder}
            />
          ))}

          {/* Then notebooks */}
          {filteredNotebooks.map((nb) => (
            <NotebookCard
              key={nb.id}
              notebook={nb}
              onEdit={(n) => {
                setEditingNotebook(n);
                setShowForm(true);
              }}
              onDelete={(n) => setDeleteTarget(n)}
              draggable
              onDragStart={handleNotebookDragStart}
            />
          ))}

          {/* Add folder card */}
          <div
            onClick={() => {
              setEditingFolder(null);
              setShowFolderForm(true);
            }}
            style={{
              background: 'rgba(18,18,42,0.5)',
              borderRadius: '12px',
              border: '2px dashed rgba(70,69,96,0.3)',
              minHeight: '160px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'border-color 0.3s cubic-bezier(0.22,1,0.36,1)',
              gap: '8px',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(174,137,255,0.5)';
              const icon = (e.currentTarget as HTMLDivElement).querySelector<HTMLSpanElement>(
                '.add-folder-icon-wrap'
              );
              if (icon) {
                icon.style.background = 'rgba(174,137,255,0.2)';
                icon.style.transform = 'scale(1.1)';
              }
              const label = (e.currentTarget as HTMLDivElement).querySelector<HTMLParagraphElement>(
                '.add-folder-label'
              );
              if (label) label.style.color = '#e5e3ff';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(70,69,96,0.3)';
              const icon = (e.currentTarget as HTMLDivElement).querySelector<HTMLSpanElement>(
                '.add-folder-icon-wrap'
              );
              if (icon) {
                icon.style.background = '#1c1c38';
                icon.style.transform = 'scale(1)';
              }
              const label = (e.currentTarget as HTMLDivElement).querySelector<HTMLParagraphElement>(
                '.add-folder-label'
              );
              if (label) label.style.color = '#aaa8c8';
            }}
          >
            <span
              className="add-folder-icon-wrap"
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: '#1c1c38',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition:
                  'background 0.3s cubic-bezier(0.22,1,0.36,1), transform 0.3s cubic-bezier(0.22,1,0.36,1)',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '28px', color: '#8888a8' }}
              >
                create_new_folder
              </span>
            </span>
            <p
              className="add-folder-label"
              style={{
                fontWeight: 700,
                color: '#aaa8c8',
                margin: '4px 0 0',
                transition: 'color 0.2s',
              }}
            >
              New Folder
            </p>
            <p
              style={{
                fontSize: '12px',
                color: '#8888a8',
                margin: 0,
                textAlign: 'center',
                padding: '0 24px',
              }}
            >
              Group your notebooks together
            </p>
          </div>

          {/* Add notebook card */}
          <div
            onClick={() => {
              setEditingNotebook(null);
              setShowForm(true);
            }}
            style={{
              background: 'rgba(18,18,42,0.5)',
              borderRadius: '12px',
              border: '2px dashed rgba(70,69,96,0.3)',
              minHeight: '160px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'border-color 0.3s cubic-bezier(0.22,1,0.36,1)',
              gap: '8px',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(174,137,255,0.5)';
              const icon = (e.currentTarget as HTMLDivElement).querySelector<HTMLSpanElement>(
                '.add-icon-wrap'
              );
              if (icon) {
                icon.style.background = 'rgba(174,137,255,0.2)';
                icon.style.transform = 'scale(1.1)';
              }
              const label = (e.currentTarget as HTMLDivElement).querySelector<HTMLParagraphElement>(
                '.add-label'
              );
              if (label) label.style.color = '#e5e3ff';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(70,69,96,0.3)';
              const icon = (e.currentTarget as HTMLDivElement).querySelector<HTMLSpanElement>(
                '.add-icon-wrap'
              );
              if (icon) {
                icon.style.background = '#1c1c38';
                icon.style.transform = 'scale(1)';
              }
              const label = (e.currentTarget as HTMLDivElement).querySelector<HTMLParagraphElement>(
                '.add-label'
              );
              if (label) label.style.color = '#aaa8c8';
            }}
          >
            <span
              className="add-icon-wrap"
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: '#1c1c38',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition:
                  'background 0.3s cubic-bezier(0.22,1,0.36,1), transform 0.3s cubic-bezier(0.22,1,0.36,1)',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '28px', color: '#8888a8' }}
              >
                add
              </span>
            </span>
            <p
              className="add-label"
              style={{
                fontWeight: 700,
                color: '#aaa8c8',
                margin: '4px 0 0',
                transition: 'color 0.2s',
              }}
            >
              New Subject
            </p>
            <p
              style={{
                fontSize: '12px',
                color: '#8888a8',
                margin: 0,
                textAlign: 'center',
                padding: '0 24px',
              }}
            >
              Organize your thoughts in a new notebook
            </p>
          </div>
        </div>
      )}


      {/* Create / Edit notebook modal */}
      {showForm && (
        <NotebookForm
          notebook={editingNotebook}
          onSubmit={editingNotebook ? handleEdit : handleCreate}
          onCancel={() => {
            setShowForm(false);
            setEditingNotebook(null);
          }}
          isLoading={formLoading}
        />
      )}

      {/* Create / Rename folder modal */}
      {showFolderForm && (
        <FolderForm
          folder={editingFolder}
          onSubmit={editingFolder ? handleFolderRename : handleFolderCreate}
          onCancel={() => {
            setShowFolderForm(false);
            setEditingFolder(null);
          }}
          isLoading={folderFormLoading}
        />
      )}

      {/* Delete notebook confirmation modal */}
      {deleteTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => {
            if (!deleteLoading) setDeleteTarget(null);
          }}
        >
          <div
            style={{
              background: '#1c1c38',
              borderRadius: '20px',
              padding: '32px',
              width: '100%',
              maxWidth: '400px',
              boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
              animation: 'slideUp 0.2s cubic-bezier(0.22,1,0.36,1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <style>{`
              @keyframes slideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
            `}</style>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'rgba(253,111,133,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ color: '#fd6f85', fontSize: '24px' }}
              >
                delete
              </span>
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 8px' }}>
              Delete &ldquo;{deleteTarget.name}&rdquo;?
            </h3>
            <p style={{ fontSize: '14px', color: '#aaa8c8', margin: '0 0 28px', lineHeight: 1.6 }}>
              This will permanently delete the notebook and all its documents and chat history. This
              action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  if (!deleteLoading) setDeleteTarget(null);
                }}
                disabled={deleteLoading}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '12px',
                  background: '#2a2a4c',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#aaa8c8',
                  cursor: deleteLoading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '12px',
                  background: deleteLoading ? 'rgba(253,111,133,0.2)' : '#fd6f85',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: 700,
                  color: deleteLoading ? '#aaa8c8' : '#490013',
                  cursor: deleteLoading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {deleteLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete folder confirmation modal */}
      {deleteFolderTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => {
            if (!deleteFolderLoading) setDeleteFolderTarget(null);
          }}
        >
          <div
            style={{
              background: '#1c1c38',
              borderRadius: '20px',
              padding: '32px',
              width: '100%',
              maxWidth: '400px',
              boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
              animation: 'slideUp 0.2s cubic-bezier(0.22,1,0.36,1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <style>{`
              @keyframes slideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
            `}</style>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'rgba(253,111,133,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ color: '#fd6f85', fontSize: '24px' }}
              >
                folder_delete
              </span>
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 8px' }}>
              Delete &ldquo;{deleteFolderTarget.name}&rdquo;?
            </h3>
            <p style={{ fontSize: '14px', color: '#aaa8c8', margin: '0 0 28px', lineHeight: 1.6 }}>
              This will delete the folder and all sub-folders. Notebooks inside will be moved to the
              root level. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  if (!deleteFolderLoading) setDeleteFolderTarget(null);
                }}
                disabled={deleteFolderLoading}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '12px',
                  background: '#2a2a4c',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#aaa8c8',
                  cursor: deleteFolderLoading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleFolderDelete}
                disabled={deleteFolderLoading}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '12px',
                  background: deleteFolderLoading ? 'rgba(253,111,133,0.2)' : '#fd6f85',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: 700,
                  color: deleteFolderLoading ? '#aaa8c8' : '#490013',
                  cursor: deleteFolderLoading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {deleteFolderLoading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => {
          setEditingNotebook(null);
          setShowForm(true);
        }}
        title="Quick Note"
        style={{
          position: 'fixed',
          bottom: responsiveValue(bp, { phone: '20px', tablet: '24px', desktop: '32px' }),
          right: responsiveValue(bp, { phone: '16px', tablet: '24px', desktop: '32px' }),
          width: responsiveValue(bp, { phone: '56px', tablet: '60px', desktop: '64px' }),
          height: responsiveValue(bp, { phone: '56px', tablet: '60px', desktop: '64px' }),
          borderRadius: '50%',
          background: '#ffde59',
          border: 'none',
          color: '#5f4f00',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 8px 32px rgba(255,222,89,0.3)',
          zIndex: 50,
          transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
        }}
        onMouseDown={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.9)';
        }}
        onMouseUp={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)';
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: '28px',
            fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24",
          }}
        >
          edit_note
        </span>
      </button>
    </div>
  );
}

export default function NotebooksPage() {
  return (
    <Suspense
      fallback={
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 16px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: '24px',
            }}
          >
            {[0, 1, 2].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      }
    >
      <NotebooksPageContent />
    </Suspense>
  );
}
