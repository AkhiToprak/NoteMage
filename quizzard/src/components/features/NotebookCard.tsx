'use client';

import Link from 'next/link';
import { useState } from 'react';

export interface NotebookData {
  id: string;
  name: string;
  description: string | null;
  subject: string | null;
  color: string | null;
  updatedAt: string;
  _count: { documents: number; pages?: number };
}

interface NotebookCardProps {
  notebook: NotebookData;
  onEdit: (notebook: NotebookData) => void;
  onDelete: (notebook: NotebookData) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, notebook: NotebookData) => void;
}

interface AccentTheme {
  accent: string;
  accentBg: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  hoverBorder: string;
}

/** Map stored color hex → Neon Scholar accent theme */
function getAccent(color: string | null): AccentTheme {
  if (!color) return PRIMARY_THEME;
  const hex = color.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16) || 0;
  const g = parseInt(hex.slice(2, 4), 16) || 0;
  const b = parseInt(hex.slice(4, 6), 16) || 0;

  // Yellow / warm
  if (r > 180 && g > 150 && b < 120) return TERTIARY_THEME;
  // Red / pink dominant
  if (r > g + 40 && r > b + 40) return ERROR_THEME;
  // Blue / periwinkle
  if (b > r + 20 && b > g - 30 && r < 160) return SECONDARY_THEME;
  return PRIMARY_THEME;
}

const PRIMARY_THEME: AccentTheme = {
  accent: '#ae89ff',
  accentBg: 'rgba(174,137,255,0.1)',
  badgeBg: 'rgba(174,137,255,0.1)',
  badgeBorder: 'rgba(174,137,255,0.2)',
  badgeText: '#ae89ff',
  hoverBorder: 'rgba(174,137,255,0.4)',
};
const SECONDARY_THEME: AccentTheme = {
  accent: '#b9c3ff',
  accentBg: 'rgba(185,195,255,0.1)',
  badgeBg: 'rgba(185,195,255,0.1)',
  badgeBorder: 'rgba(185,195,255,0.32)',
  badgeText: '#b9c3ff',
  hoverBorder: 'rgba(185,195,255,0.55)',
};
const TERTIARY_THEME: AccentTheme = {
  accent: '#ffedb3',
  accentBg: 'rgba(255,237,179,0.1)',
  badgeBg: 'rgba(255,237,179,0.1)',
  badgeBorder: 'rgba(255,237,179,0.2)',
  badgeText: '#f0d04c',
  hoverBorder: 'rgba(255,237,179,0.4)',
};
const ERROR_THEME: AccentTheme = {
  accent: '#fd6f85',
  accentBg: 'rgba(253,111,133,0.1)',
  badgeBg: 'rgba(253,111,133,0.1)',
  badgeBorder: 'rgba(253,111,133,0.2)',
  badgeText: '#c8475d',
  hoverBorder: 'rgba(253,111,133,0.4)',
};

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

export default function NotebookCard({ notebook, onEdit, onDelete, draggable, onDragStart }: NotebookCardProps) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const theme = getAccent(notebook.color);
  const docCount = notebook._count.pages != null && notebook._count.pages > 0
    ? `${notebook._count.pages} page${notebook._count.pages !== 1 ? 's' : ''}`
    : `${notebook._count.documents} doc${notebook._count.documents !== 1 ? 's' : ''}`;

  return (
    <div
      style={{ position: 'relative' }}
      draggable={draggable}
      onDragStart={(e) => { if (onDragStart) onDragStart(e, notebook); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setMenuOpen(false); }}
    >
      <Link href={`/notebooks/${notebook.id}`} style={{ textDecoration: 'none', display: 'block' }}>
        <div
          style={{
            position: 'relative',
            background: '#12122a',
            borderRadius: '12px',
            overflow: 'hidden',
            border: `1px solid ${hovered ? theme.hoverBorder : 'rgba(70,69,96,0.1)'}`,
            boxShadow: hovered
              ? `0 20px 40px rgba(0,0,0,0.4), 0 0 0 1px ${theme.hoverBorder}`
              : '0 8px 24px rgba(0,0,0,0.3)',
            transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
            transition: 'transform 0.5s cubic-bezier(0.22,1,0.36,1), box-shadow 0.5s cubic-bezier(0.22,1,0.36,1), border-color 0.5s cubic-bezier(0.22,1,0.36,1)',
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
              background: theme.accent,
              zIndex: 2,
            }}
          />

          {/* Spiral rings */}
          <div
            style={{
              position: 'absolute',
              left: '8px',
              top: 0,
              bottom: 0,
              width: '16px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-around',
              padding: '16px 0',
              opacity: 0.3,
              zIndex: 2,
            }}
          >
            {[0,1,2,3,4,5].map((i) => (
              <div
                key={i}
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  border: '1.5px solid #ffffff',
                }}
              />
            ))}
          </div>

          {/* Dot pattern + content */}
          <div
            className="notebook-pattern"
            style={{
              paddingLeft: '40px',
              padding: '24px 24px 24px 40px',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              minHeight: '160px',
            }}
          >
            {/* Top row: badge + more_vert */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              {notebook.subject ? (
                <span
                  style={{
                    padding: '3px 10px',
                    background: theme.badgeBg,
                    border: `1px solid ${theme.badgeBorder}`,
                    borderRadius: '9999px',
                    fontSize: '10px',
                    fontWeight: 700,
                    color: theme.badgeText,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  {notebook.subject}
                </span>
              ) : (
                <div />
              )}

              {/* more_vert trigger — intercept click */}
              <button
                onClick={(e) => {
                  e.preventDefault();
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
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = theme.accent; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#aaa8c8'; }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>more_vert</span>
              </button>
            </div>

            {/* Title */}
            <h3
              style={{
                fontFamily: '"Epilogue", serif',
                fontSize: '18px',
                fontWeight: 700,
                color: hovered ? theme.accent : '#e5e3ff',
                margin: 0,
                lineHeight: 1.3,
                transition: 'color 0.3s cubic-bezier(0.22,1,0.36,1)',
              }}
            >
              {notebook.name}
            </h3>

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
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>description</span>
                <span style={{ fontSize: '12px' }}>{docCount}</span>
              </div>
              <span style={{ fontSize: '10px', color: '#8888a8', fontStyle: 'italic' }}>
                Updated {formatDate(notebook.updatedAt)}
              </span>
            </div>
          </div>
        </div>
      </Link>

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
            onClick={(e) => { e.preventDefault(); setMenuOpen(false); onEdit(notebook); }}
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
            Edit
          </button>
          <button
            onClick={(e) => { e.preventDefault(); setMenuOpen(false); onDelete(notebook); }}
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
