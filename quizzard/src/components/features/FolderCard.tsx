'use client';

import { useState } from 'react';

export interface FolderData {
  id: string;
  name: string;
  color: string | null;
  parentId: string | null;
  updatedAt: string;
  _count: { children: number; notebooks: number };
}

interface FolderCardProps {
  folder: FolderData;
  onClick: (folder: FolderData) => void;
  onRename: (folder: FolderData) => void;
  onDelete: (folder: FolderData) => void;
  onDropNotebook?: (notebookId: string, folder: FolderData) => void;
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function FolderCard({ folder, onClick, onRename, onDelete, onDropNotebook }: FolderCardProps) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const accent = folder.color || '#ae89ff';
  const accentBg = `${accent}1a`;
  const hoverBorder = `${accent}66`;

  const itemCount = [];
  if (folder._count.notebooks > 0) {
    itemCount.push(`${folder._count.notebooks} notebook${folder._count.notebooks !== 1 ? 's' : ''}`);
  }
  if (folder._count.children > 0) {
    itemCount.push(`${folder._count.children} folder${folder._count.children !== 1 ? 's' : ''}`);
  }
  const countLabel = itemCount.length > 0 ? itemCount.join(', ') : 'Empty';

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setMenuOpen(false); }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(true); }}
      onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => {
        // Only clear if leaving the card entirely (not entering a child)
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const notebookId = e.dataTransfer.getData('application/notebook-id');
        if (notebookId && onDropNotebook) onDropNotebook(notebookId, folder);
      }}
    >
      <div
        onClick={() => onClick(folder)}
        style={{
          position: 'relative',
          background: dragOver ? `${accent}15` : '#12122a',
          borderRadius: '12px',
          overflow: 'hidden',
          border: `1px solid ${dragOver ? accent : hovered ? hoverBorder : 'rgba(70,69,96,0.1)'}`,
          boxShadow: dragOver
            ? `0 0 0 2px ${accent}, 0 20px 40px rgba(0,0,0,0.4)`
            : hovered
              ? `0 20px 40px rgba(0,0,0,0.4), 0 0 0 1px ${hoverBorder}`
              : '0 8px 24px rgba(0,0,0,0.3)',
          transform: dragOver ? 'scale(1.03)' : hovered ? 'translateY(-4px)' : 'translateY(0)',
          transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s cubic-bezier(0.22,1,0.36,1), border-color 0.2s cubic-bezier(0.22,1,0.36,1), background 0.2s',
          cursor: 'pointer',
          minHeight: '160px',
        }}
      >
        {/* Left accent strip */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '8px',
            background: accent,
            zIndex: 2,
          }}
        />

        {/* Content */}
        <div
          style={{
            padding: '24px 24px 24px 28px',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            minHeight: '160px',
          }}
        >
          {/* Top row: folder badge + menu */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <span
              style={{
                padding: '3px 10px',
                background: accentBg,
                border: `1px solid ${accent}33`,
                borderRadius: '9999px',
                fontSize: '10px',
                fontWeight: 700,
                color: accent,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Folder
            </span>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#aaa8c8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '2px',
                borderRadius: '6px',
                transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = accent; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#aaa8c8'; }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>more_vert</span>
            </button>
          </div>

          {/* Folder name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: '24px',
                color: hovered ? accent : '#aaa8c8',
                transition: 'color 0.3s cubic-bezier(0.22,1,0.36,1)',
                fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24",
              }}
            >
              folder
            </span>
            <h3
              style={{
                fontFamily: '"Epilogue", serif',
                fontSize: '18px',
                fontWeight: 700,
                color: hovered ? accent : '#e5e3ff',
                margin: 0,
                lineHeight: 1.3,
                transition: 'color 0.3s cubic-bezier(0.22,1,0.36,1)',
              }}
            >
              {folder.name}
            </h3>
          </div>

          {/* Footer */}
          <div
            style={{
              marginTop: 'auto',
              paddingTop: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTop: '1px solid rgba(70,69,96,0.05)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#aaa8c8' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>inventory_2</span>
              <span style={{ fontSize: '12px' }}>{countLabel}</span>
            </div>
            <span style={{ fontSize: '10px', color: '#8888a8', fontStyle: 'italic' }}>
              Updated {formatDate(folder.updatedAt)}
            </span>
          </div>
        </div>
      </div>

      {/* Dropdown menu */}
      {menuOpen && (
        <div
          style={{
            position: 'absolute',
            top: '48px',
            right: '24px',
            background: '#232342',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            overflow: 'hidden',
            zIndex: 100,
            minWidth: '140px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onRename(folder); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              padding: '12px 16px',
              background: 'transparent',
              border: 'none',
              color: '#e5e3ff',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#2a2a4c'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#ae89ff' }}>edit</span>
            Rename
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(folder); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              padding: '12px 16px',
              background: 'transparent',
              border: 'none',
              color: '#fd6f85',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(253,111,133,0.1)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
