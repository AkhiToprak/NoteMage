'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FileText, Pencil, Trash2, Clock } from 'lucide-react';

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
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function NotebookCard({ notebook, onEdit, onDelete }: NotebookCardProps) {
  const [hovered, setHovered] = useState(false);
  const accentColor = notebook.color || '#8c52ff';

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link
        href={`/notebooks/${notebook.id}`}
        style={{ textDecoration: 'none', display: 'block' }}
      >
        <div
          style={{
            background: '#0d0c20',
            border: `1px solid ${hovered ? `${accentColor}40` : 'rgba(140,82,255,0.15)'}`,
            borderRadius: '14px',
            padding: '0',
            overflow: 'hidden',
            boxShadow: hovered
              ? `0 8px 32px rgba(0,0,0,0.35), 0 0 0 1px ${accentColor}20`
              : '0 4px 20px rgba(0,0,0,0.25)',
            transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
            transition: 'transform 0.18s cubic-bezier(0.22,1,0.36,1), box-shadow 0.18s ease, border-color 0.18s ease',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Top accent bar */}
          <div style={{ height: '4px', background: accentColor, flexShrink: 0 }} />

          <div style={{ padding: '18px 20px 16px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
            {/* Subject tag */}
            {notebook.subject && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                    fontFamily: "'Gliker', 'DM Sans', sans-serif",
                    fontSize: '11px',
                    fontWeight: '600',
                    color: accentColor,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {notebook.subject}
                </span>
              </div>
            )}

            {/* Notebook name */}
            <h3
              style={{
                fontFamily: "'Gliker', 'DM Sans', sans-serif",
                fontSize: '16px',
                fontWeight: '700',
                color: '#ede9ff',
                margin: 0,
                letterSpacing: '-0.02em',
                lineHeight: 1.3,
              }}
            >
              {notebook.name}
            </h3>

            {/* Description */}
            {notebook.description && (
              <p
                style={{
                  fontFamily: "'Gliker', 'DM Sans', sans-serif",
                  fontSize: '13px',
                  color: 'rgba(237,233,255,0.45)',
                  margin: 0,
                  lineHeight: 1.5,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {notebook.description}
              </p>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '10px 20px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTop: '1px solid rgba(140,82,255,0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <FileText size={13} style={{ color: 'rgba(237,233,255,0.3)' }} />
              <span
                style={{
                  fontFamily: "'Gliker', 'DM Sans', sans-serif",
                  fontSize: '12px',
                  color: 'rgba(237,233,255,0.3)',
                }}
              >
                {notebook._count.pages != null && notebook._count.pages > 0
                  ? `${notebook._count.pages} page${notebook._count.pages !== 1 ? 's' : ''}`
                  : `${notebook._count.documents} doc${notebook._count.documents !== 1 ? 's' : ''}`}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Clock size={12} style={{ color: 'rgba(237,233,255,0.25)' }} />
              <span
                style={{
                  fontFamily: "'Gliker', 'DM Sans', sans-serif",
                  fontSize: '12px',
                  color: 'rgba(237,233,255,0.25)',
                }}
              >
                {formatDate(notebook.updatedAt)}
              </span>
            </div>
          </div>
        </div>
      </Link>

      {/* Edit / Delete buttons — shown on hover */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          display: 'flex',
          gap: '4px',
          opacity: hovered ? 1 : 0,
          transform: hovered ? 'translateY(0)' : 'translateY(-4px)',
          transition: 'opacity 0.15s ease, transform 0.15s ease',
          pointerEvents: hovered ? 'auto' : 'none',
          zIndex: 10,
        }}
      >
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onEdit(notebook);
          }}
          title="Edit notebook"
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            background: 'rgba(13,12,32,0.9)',
            border: '1px solid rgba(140,82,255,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'rgba(237,233,255,0.6)',
            transition: 'background 0.12s ease, color 0.12s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(140,82,255,0.2)';
            (e.currentTarget as HTMLButtonElement).style.color = '#8c52ff';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(13,12,32,0.9)';
            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,233,255,0.6)';
          }}
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(notebook);
          }}
          title="Delete notebook"
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            background: 'rgba(13,12,32,0.9)',
            border: '1px solid rgba(239,68,68,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'rgba(237,233,255,0.6)',
            transition: 'background 0.12s ease, color 0.12s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.15)';
            (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(13,12,32,0.9)';
            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,233,255,0.6)';
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
