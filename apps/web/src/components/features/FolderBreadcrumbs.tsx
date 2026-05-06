'use client';

import { useState } from 'react';

interface BreadcrumbItem {
  id: string;
  name: string;
}

interface FolderBreadcrumbsProps {
  breadcrumbs: BreadcrumbItem[];
  onNavigate: (folderId: string | null) => void;
  onDropNotebook?: (notebookId: string, targetFolderId: string | null) => void;
}

function DroppableCrumb({
  children,
  folderId,
  onDropNotebook,
}: {
  children: React.ReactNode;
  folderId: string | null;
  onDropNotebook?: (notebookId: string, targetFolderId: string | null) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <span
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOver(true);
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const notebookId = e.dataTransfer.getData('application/notebook-id');
        if (notebookId && onDropNotebook) onDropNotebook(notebookId, folderId);
      }}
      style={{
        borderRadius: '6px',
        outline: dragOver ? '2px solid #ae89ff' : 'none',
        background: dragOver ? 'rgba(174,137,255,0.15)' : 'none',
        transition: 'outline 0.15s, background 0.15s',
      }}
    >
      {children}
    </span>
  );
}

export default function FolderBreadcrumbs({
  breadcrumbs,
  onNavigate,
  onDropNotebook,
}: FolderBreadcrumbsProps) {
  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        marginBottom: '20px',
        flexWrap: 'wrap',
      }}
    >
      {/* Root */}
      <DroppableCrumb folderId={null} onDropNotebook={onDropNotebook}>
        <button
          onClick={() => onNavigate(null)}
          style={{
            background: 'none',
            border: 'none',
            color: breadcrumbs.length > 0 ? '#ae89ff' : '#e5e3ff',
            fontSize: '14px',
            fontWeight: 600,
            cursor: breadcrumbs.length > 0 ? 'pointer' : 'default',
            fontFamily: 'inherit',
            padding: '4px 6px',
            borderRadius: '6px',
            transition: 'background 0.15s',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
          onMouseEnter={(e) => {
            if (breadcrumbs.length > 0)
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(174,137,255,0.1)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'none';
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
            home
          </span>
          My Notebooks
        </button>
      </DroppableCrumb>

      {breadcrumbs.map((crumb, i) => {
        const isLast = i === breadcrumbs.length - 1;
        return (
          <span key={crumb.id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '16px', color: '#8888a8' }}
            >
              chevron_right
            </span>
            <DroppableCrumb folderId={crumb.id} onDropNotebook={onDropNotebook}>
              <button
                onClick={() => {
                  if (!isLast) onNavigate(crumb.id);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: isLast ? '#e5e3ff' : '#ae89ff',
                  fontSize: '14px',
                  fontWeight: isLast ? 700 : 600,
                  cursor: isLast ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                  padding: '4px 6px',
                  borderRadius: '6px',
                  transition: 'background 0.15s',
                  maxWidth: '200px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => {
                  if (!isLast)
                    (e.currentTarget as HTMLButtonElement).style.background =
                      'rgba(174,137,255,0.1)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'none';
                }}
              >
                {crumb.name}
              </button>
            </DroppableCrumb>
          </span>
        );
      })}
    </nav>
  );
}
