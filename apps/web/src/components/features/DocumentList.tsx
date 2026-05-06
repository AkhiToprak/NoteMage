'use client';

import { useState } from 'react';
import { FileText, Trash2, Loader, Sparkles, X } from 'lucide-react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';

export interface DocumentItem {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  createdAt: string;
}

interface DocumentListProps {
  documents: DocumentItem[];
  notebookId: string;
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

export default function DocumentList({
  documents,
  notebookId,
  onDelete,
  deletingId,
}: DocumentListProps) {
  const [summaryDoc, setSummaryDoc] = useState<DocumentItem | null>(null);
  const [summaryContent, setSummaryContent] = useState('');
  const [summaryLength, setSummaryLength] = useState<'brief' | 'detailed'>('brief');
  const [loadingSummary, setLoadingSummary] = useState(false);

  const handleSummarize = async (doc: DocumentItem, length: 'brief' | 'detailed' = 'brief') => {
    setSummaryDoc(doc);
    setSummaryLength(length);
    setSummaryContent('');
    setLoadingSummary(true);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/documents/${doc.id}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ length }),
      });
      const json = await res.json();
      if (json.success && json.data?.summary) {
        setSummaryContent(json.data.summary);
      } else {
        setSummaryContent(
          'Failed to generate summary. The document may not have extractable text.'
        );
      }
    } catch {
      setSummaryContent('Network error. Please try again.');
    }
    setLoadingSummary(false);
  };

  const switchLength = (newLength: 'brief' | 'detailed') => {
    if (newLength !== summaryLength && summaryDoc) {
      handleSummarize(summaryDoc, newLength);
    }
  };

  if (documents.length === 0) return null;

  return (
    <>
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
              <FileText size={15} style={{ color: '#5170ff', flexShrink: 0 }} />
              <span
                style={{
                  fontFamily: 'inherit',
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
              <span
                style={{
                  fontFamily: 'inherit',
                  fontSize: '11px',
                  color: 'rgba(237,233,255,0.25)',
                  flexShrink: 0,
                }}
              >
                {formatFileSize(doc.fileSize)}
              </span>
              <span
                style={{
                  fontFamily: 'inherit',
                  fontSize: '11px',
                  color: 'rgba(237,233,255,0.22)',
                  flexShrink: 0,
                }}
              >
                {formatDate(doc.createdAt)}
              </span>

              {/* Summarize button */}
              <button
                onClick={() => handleSummarize(doc)}
                title="Summarize document"
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '7px',
                  background: 'none',
                  border: '1px solid transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'rgba(237,233,255,0.25)',
                  transition: 'background 0.12s ease, color 0.12s ease, border-color 0.12s ease',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(140,82,255,0.12)';
                  (e.currentTarget as HTMLButtonElement).style.color = '#c4a9ff';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(140,82,255,0.2)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'none';
                  (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,233,255,0.25)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent';
                }}
              >
                <Sparkles size={12} />
              </button>

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
                    (e.currentTarget as HTMLButtonElement).style.background =
                      'rgba(239,68,68,0.12)';
                    (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5';
                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                      'rgba(239,68,68,0.2)';
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'none';
                  (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,233,255,0.25)';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent';
                }}
                title="Delete document"
              >
                {isDeleting ? (
                  <Loader size={12} style={{ animation: 'spin 0.8s linear infinite' }} />
                ) : (
                  <Trash2 size={12} />
                )}
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
              </button>
            </div>
          );
        })}
      </div>

      {/* Summary modal */}
      {summaryDoc && (
        <div
          onClick={() => setSummaryDoc(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '520px',
              maxHeight: '600px',
              background: '#1a1a36',
              border: '1px solid rgba(140,82,255,0.25)',
              borderRadius: '16px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid rgba(140,82,255,0.15)',
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize: '15px',
                    fontWeight: 700,
                    color: '#ede9ff',
                    margin: 0,
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Sparkles size={16} style={{ color: '#c4a9ff' }} /> AI Summary
                </h3>
                <p style={{ fontSize: '12px', color: 'rgba(237,233,255,0.35)', margin: '4px 0 0' }}>
                  {summaryDoc.fileName}
                </p>
              </div>
              <button
                onClick={() => setSummaryDoc(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(237,233,255,0.4)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Length toggle */}
            <div
              style={{
                display: 'flex',
                gap: '4px',
                padding: '12px 20px 0',
              }}
            >
              {(['brief', 'detailed'] as const).map((len) => (
                <button
                  key={len}
                  onClick={() => switchLength(len)}
                  disabled={loadingSummary}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    border:
                      summaryLength === len
                        ? '1px solid rgba(140,82,255,0.4)'
                        : '1px solid rgba(255,255,255,0.06)',
                    background: summaryLength === len ? 'rgba(140,82,255,0.15)' : 'transparent',
                    color: summaryLength === len ? '#c4a9ff' : 'rgba(237,233,255,0.4)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: loadingSummary ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    transition: 'background 0.12s',
                    textTransform: 'capitalize',
                  }}
                >
                  {len}
                </button>
              ))}
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {loadingSummary ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '48px 0',
                    gap: '12px',
                  }}
                >
                  <Loader
                    size={24}
                    style={{ color: '#c4a9ff', animation: 'spin 1s linear infinite' }}
                  />
                  <span style={{ fontSize: '13px', color: 'rgba(237,233,255,0.4)' }}>
                    Generating {summaryLength} summary...
                  </span>
                </div>
              ) : (
                <div style={{ fontSize: '14px', color: 'rgba(237,233,255,0.75)', lineHeight: 1.7 }}>
                  <MarkdownRenderer content={summaryContent} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
