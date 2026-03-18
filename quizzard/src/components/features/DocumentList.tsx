'use client';

import { FileText, Trash2, Loader } from 'lucide-react';

export interface DocumentItem {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  createdAt: string;
}

interface DocumentListProps {
  documents: DocumentItem[];
  onDelete: (docId: string) => void;
  deletingId: string | null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function DocumentList({ documents, onDelete, deletingId }: DocumentListProps) {
  if (documents.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {documents.map((doc) => {
        const isDeleting = deletingId === doc.id;
        return (
          <div
            key={doc.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              borderRadius: '10px',
              background: isDeleting ? 'rgba(239,68,68,0.05)' : 'rgba(237,233,255,0.03)',
              border: isDeleting
                ? '1px solid rgba(239,68,68,0.15)'
                : '1px solid rgba(237,233,255,0.07)',
              transition: 'background 0.15s ease, border-color 0.15s ease',
              opacity: isDeleting ? 0.6 : 1,
            }}
          >
            {/* Icon */}
            <FileText size={15} style={{ color: '#5170ff', flexShrink: 0 }} />

            {/* File name */}
            <span
              style={{
                fontFamily: "'Gliker', 'DM Sans', sans-serif",
                fontSize: '13px',
                color: 'rgba(237,233,255,0.75)',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
              title={doc.fileName}
            >
              {doc.fileName}
            </span>

            {/* File size */}
            <span
              style={{
                fontFamily: "'Gliker', 'DM Sans', sans-serif",
                fontSize: '11px',
                color: 'rgba(237,233,255,0.25)',
                flexShrink: 0,
              }}
            >
              {formatFileSize(doc.fileSize)}
            </span>

            {/* Date */}
            <span
              style={{
                fontFamily: "'Gliker', 'DM Sans', sans-serif",
                fontSize: '11px',
                color: 'rgba(237,233,255,0.22)',
                flexShrink: 0,
              }}
            >
              {formatDate(doc.createdAt)}
            </span>

            {/* Delete button */}
            <button
              onClick={() => !isDeleting && onDelete(doc.id)}
              disabled={isDeleting}
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '7px',
                background: 'none',
                border: '1px solid transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: isDeleting ? 'not-allowed' : 'pointer',
                color: 'rgba(237,233,255,0.25)',
                transition: 'background 0.12s ease, color 0.12s ease, border-color 0.12s ease',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                if (!isDeleting) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.12)';
                  (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.2)';
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'none';
                (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,233,255,0.25)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent';
              }}
              title="Delete document"
            >
              {isDeleting
                ? <Loader size={12} style={{ animation: 'spin 0.8s linear infinite' }} />
                : <Trash2 size={12} />
              }
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </button>
          </div>
        );
      })}
    </div>
  );
}
