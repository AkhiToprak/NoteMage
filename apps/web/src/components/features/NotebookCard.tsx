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

const DEFAULT_NOTEBOOK_COLOR = '#8c52ff';

/**
 * Build an accent theme from the notebook's own stored color, so each swatch
 * renders as the color the user actually picked. (The previous version ran an
 * RGB heuristic that quantised every color into one of four fixed themes —
 * green, orange and blue all collapsed onto purple/pink/periwinkle and the
 * chosen hex was never shown.) Tints are derived from the hex; badge and title
 * text mix toward --on-surface, which flips with the theme, so the text stays
 * readable in both light and dark mode instead of being light-on-light.
 */
function getAccent(color: string | null): AccentTheme {
  const base =
    color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_NOTEBOOK_COLOR;
  const hex = base.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16) || 0;
  const g = parseInt(hex.slice(2, 4), 16) || 0;
  const b = parseInt(hex.slice(4, 6), 16) || 0;
  const tint = (a: number) => `rgba(${r},${g},${b},${a})`;

  return {
    accent: base,
    accentBg: tint(0.1),
    badgeBg: tint(0.12),
    badgeBorder: tint(0.32),
    badgeText: `color-mix(in srgb, ${base}, var(--on-surface) 42%)`,
    hoverBorder: tint(0.5),
  };
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

export default function NotebookCard({
  notebook,
  onEdit,
  onDelete,
  draggable,
  onDragStart,
}: NotebookCardProps) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const theme = getAccent(notebook.color);
  const docCount =
    notebook._count.pages != null && notebook._count.pages > 0
      ? `${notebook._count.pages} page${notebook._count.pages !== 1 ? 's' : ''}`
      : `${notebook._count.documents} doc${notebook._count.documents !== 1 ? 's' : ''}`;

  return (
    <div
      style={{ position: 'relative' }}
      draggable={draggable}
      onDragStart={(e) => {
        if (onDragStart) onDragStart(e, notebook);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setMenuOpen(false);
      }}
    >
      <Link href={`/notebooks/${notebook.id}`} style={{ textDecoration: 'none', display: 'block' }}>
        <div
          style={{
            position: 'relative',
            background: 'var(--surface-container)',
            borderRadius: '12px',
            overflow: 'hidden',
            border: `1px solid ${hovered ? theme.hoverBorder : 'rgba(70,69,96,0.1)'}`,
            boxShadow: hovered
              ? `0 20px 40px rgba(0,0,0,0.4), 0 0 0 1px ${theme.hoverBorder}`
              : '0 8px 24px rgba(0,0,0,0.3)',
            transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
            transition:
              'transform 0.5s cubic-bezier(0.22,1,0.36,1), box-shadow 0.5s cubic-bezier(0.22,1,0.36,1), border-color 0.5s cubic-bezier(0.22,1,0.36,1)',
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
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  border: '1.5px solid var(--outline)',
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
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '16px',
              }}
            >
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
                  color: 'var(--on-surface-variant)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '2px',
                  borderRadius: '6px',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = theme.badgeText;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--on-surface-variant)';
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>
                  more_vert
                </span>
              </button>
            </div>

            {/* Title */}
            <h3
              style={{
                fontFamily: '"Epilogue", serif',
                fontSize: '18px',
                fontWeight: 700,
                color: hovered ? theme.badgeText : 'var(--on-surface)',
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
                borderTop: '1px solid rgba(70,69,96,0.10)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--on-surface-variant)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
                  description
                </span>
                <span style={{ fontSize: '12px' }}>{docCount}</span>
              </div>
              <span style={{ fontSize: '10px', color: 'var(--outline)', fontStyle: 'italic' }}>
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
            background: 'var(--surface-container-high)',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            overflow: 'hidden',
            zIndex: 100,
            minWidth: '140px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.preventDefault();
              setMenuOpen(false);
              onEdit(notebook);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              padding: '12px 16px',
              background: 'transparent',
              border: 'none',
              color: 'var(--on-surface)',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--card-hover-bg-strong)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '18px', color: 'var(--md-h4)' }}
            >
              edit
            </span>
            Edit
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              setMenuOpen(false);
              onDelete(notebook);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              padding: '12px 16px',
              background: 'transparent',
              border: 'none',
              color: 'var(--error)',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(253,111,133,0.1)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              delete
            </span>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
