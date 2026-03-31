'use client';

import { useState, useEffect, use, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useNotebookWorkspace } from '@/components/notebook/NotebookWorkspaceContext';
import CreateChatModal from '@/components/notebook/CreateChatModal';

interface DocumentItem {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  createdAt: string;
}

interface SectionRef {
  id: string;
  title: string;
  pages: { id: string; title: string }[];
  children?: SectionRef[];
  parentId?: string | null;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getFileIcon(fileType: string): { icon: string; color: string; bg: string } {
  if (fileType.includes('pdf')) return { icon: 'picture_as_pdf', color: '#fd6f85', bg: 'rgba(253,111,133,0.1)' };
  if (fileType.includes('image')) return { icon: 'image', color: '#f0d04c', bg: 'rgba(240,208,76,0.1)' };
  if (fileType.includes('audio')) return { icon: 'audio_file', color: '#ae89ff', bg: 'rgba(174,137,255,0.1)' };
  return { icon: 'description', color: '#b9c3ff', bg: 'rgba(185,195,255,0.1)' };
}

const ALLOWED_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown'];

export default function NotebookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { notebook, flatSections, refreshChats } = useNotebookWorkspace();

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const fetchDocs = useCallback(async () => {
    const res = await fetch(`/api/notebooks/${id}/documents`);
    const json = await res.json();
    if (json.success) setDocuments(json.data ?? []);
  }, [id]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  // Auto-open modal when ?new=1 is in URL (e.g. from "New chat" sidebar button)
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowCreateModal(true);
      // Clean up the query param without navigation
      router.replace(`/notebooks/${id}`);
    }
  }, [searchParams, id, router]);

  const upload = async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError('Unsupported file type. Allowed: PDF, DOCX, TXT, MD');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setUploadError('File too large. Maximum size is 50MB');
      return;
    }
    setUploadError(null);
    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await fetch(`/api/notebooks/${id}/documents`, { method: 'POST', body: fd });
      await fetchDocs();
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  };

  const handleDelete = async (docId: string) => {
    setDeletingId(docId);
    try {
      await fetch(`/api/notebooks/${id}/documents/${docId}`, { method: 'DELETE' });
      await fetchDocs();
    } finally {
      setDeletingId(null);
    }
  };

  const handleChatCreated = (chatId: string) => {
    setShowCreateModal(false);
    refreshChats();
    router.push(`/notebooks/${id}/chats/${chatId}`);
  };

  // Build section tree for modal (reuse flatSections from context)
  const sectionTree: SectionRef[] = flatSections
    .filter(s => !s.parentId)
    .map(s => ({
      id: s.id,
      title: s.title,
      pages: s.pages,
      children: flatSections
        .filter(c => c.parentId === s.id)
        .map(c => ({ id: c.id, title: c.title, pages: c.pages })),
    }));

  return (
    <div style={{ flex: 1, overflowY: 'auto', height: '100%' }}>
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px' }}>
      {/* Header */}
      <header style={{ marginBottom: '48px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '24px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Breadcrumb chips */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {notebook?.color && (
                <span style={{
                  padding: '4px 12px',
                  background: 'rgba(174,137,255,0.2)',
                  color: '#cdb5ff',
                  borderRadius: '9999px',
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '13px', fontVariationSettings: "'FILL' 1" }}>auto_fix_high</span>
                  Scholar
                </span>
              )}
            </div>

            {/* Notebook name */}
            <h2 style={{
              fontFamily: '"Shrikhand", serif',
              fontStyle: 'italic',
              fontSize: '52px',
              fontWeight: 400,
              color: '#e5e3ff',
              margin: 0,
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
            }}>
              {notebook?.name ?? '…'}
            </h2>

            <p style={{ fontSize: '15px', color: '#8888a8', margin: 0, fontWeight: 500 }}>
              Feed the Scholar, review your vault, and start AI-powered chats.
            </p>
          </div>

          {/* Start Chat CTA */}
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              background: '#ffde59',
              color: '#5f4f00',
              padding: '16px 32px',
              borderRadius: '16px',
              fontWeight: 900,
              fontSize: '17px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 8px 24px rgba(255,222,89,0.2)',
              transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
              flexShrink: 0,
              fontFamily: 'inherit',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
            onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.95)'; }}
            onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)'; }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '22px', fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}
            >
              auto_fix_high
            </span>
            Start Chat
          </button>
        </div>
      </header>

      <style>{`
        @keyframes nb-fade-up {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes nb-pulse-glow {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 1; }
        }
        @keyframes nb-flame {
          0%, 100% { transform: scaleY(1) rotate(-3deg); }
          50%       { transform: scaleY(1.12) rotate(3deg); }
        }
        .nb-card {
          animation: nb-fade-up 0.45s cubic-bezier(0.22,1,0.36,1) both;
        }
        .nb-card:nth-child(1) { animation-delay: 0ms;   }
        .nb-card:nth-child(2) { animation-delay: 80ms;  }
        .nb-card:nth-child(3) { animation-delay: 160ms; }
        .nb-card:nth-child(4) { animation-delay: 60ms;  }
        .nb-upload:hover .nb-upload-icon {
          transform: translateY(-2px) scale(1.06);
        }
        .nb-upload-icon {
          transition: transform 0.25s cubic-bezier(0.22,1,0.36,1);
        }
        .nb-doc-row:hover .nb-doc-actions { opacity: 1; }
        .nb-doc-actions { opacity: 0; transition: opacity 0.15s ease; }
      `}</style>

      {/* ── Bento grid ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1.75fr',
        gridTemplateRows: 'auto auto 1fr',
        gridTemplateAreas: `
          "upload vault"
          "streak vault"
          "insight vault"
        `,
        gap: '16px',
        alignItems: 'start',
      }}>
        {/* ── Upload zone ── */}
        <div
          className="nb-card nb-upload"
          style={{ gridArea: 'upload' }}
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }}
          />
          <div style={{
            borderRadius: '20px',
            padding: '18px 22px',
            border: `2px dashed ${isDragging ? 'rgba(174,137,255,0.8)' : 'rgba(70,69,96,0.4)'}`,
            background: isDragging
              ? 'rgba(174,137,255,0.06)'
              : 'linear-gradient(135deg, #1a1a2e 0%, #232342 100%)',
            display: 'flex',
            alignItems: 'center',
            gap: '18px',
            cursor: 'pointer',
            transition: 'border-color 0.2s ease, background 0.2s ease',
            boxShadow: isDragging
              ? '0 0 0 4px rgba(174,137,255,0.12), inset 0 1px 0 rgba(255,255,255,0.06)'
              : 'inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(174,137,255,0.5)'; }}
            onMouseLeave={e => { if (!isDragging) (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(70,69,96,0.4)'; }}
          >
            <div className="nb-upload-icon" style={{
              width: '48px', height: '48px', borderRadius: '14px',
              background: 'linear-gradient(135deg, rgba(174,137,255,0.18) 0%, rgba(81,112,255,0.12) 100%)',
              border: '1px solid rgba(174,137,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '26px', color: '#ae89ff' }}>
                {isUploading ? 'hourglass_empty' : 'cloud_upload'}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '14px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 3px', letterSpacing: '-0.01em' }}>
                {isUploading ? 'Uploading…' : 'Feed the Scholar'}
              </p>
              <p style={{ fontSize: '12px', color: '#8888a8', margin: 0, lineHeight: 1.5 }}>
                PDF · DOCX · TXT · MD &nbsp;·&nbsp; max 50 MB
              </p>
              {uploadError && (
                <p style={{ fontSize: '11px', color: '#fd6f85', margin: '4px 0 0' }}>{uploadError}</p>
              )}
            </div>
            <div style={{
              padding: '7px 16px', borderRadius: '10px',
              background: 'rgba(174,137,255,0.14)', border: '1px solid rgba(174,137,255,0.25)',
              fontSize: '12px', fontWeight: 700, color: '#c4a9ff', flexShrink: 0,
              letterSpacing: '0.01em',
            }}>
              Browse
            </div>
          </div>
        </div>

        {/* ── Study Streak ── */}
        <div className="nb-card" style={{
          gridArea: 'streak',
          borderRadius: '20px',
          padding: '20px 22px',
          background: 'linear-gradient(135deg, #141424 0%, #0f0f1e 100%)',
          border: '1px solid rgba(255,222,89,0.08)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', gap: '18px',
        }}>
          <div style={{
            width: '46px', height: '46px', borderRadius: '13px',
            background: 'radial-gradient(circle at 50% 80%, rgba(255,165,0,0.18) 0%, rgba(255,222,89,0.06) 100%)',
            border: '1px solid rgba(255,222,89,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span className="material-symbols-outlined" style={{
              fontSize: '24px', color: '#ffde59', fontVariationSettings: "'FILL' 1",
              display: 'inline-block', animation: 'nb-flame 2.5s ease-in-out infinite', transformOrigin: 'bottom center',
            }}>
              local_fire_department
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,222,89,0.5)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {notebook?.name ?? '…'} Streak
              </span>
              <span style={{ fontFamily: '"Shrikhand", serif', fontStyle: 'italic', fontSize: '22px', color: '#ffde59', lineHeight: 1, opacity: 0.6 }}>
                —
              </span>
            </div>
            <div style={{ display: 'flex', gap: '5px', marginBottom: '8px' }}>
              {['M','T','W','T','F','S','S'].map((d, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <div style={{ height: '5px', borderRadius: '9999px', background: 'rgba(255,255,255,0.07)', width: '100%' }} />
                  <span style={{ fontSize: '9px', color: '#555578', fontWeight: 600 }}>{d}</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: '11px', color: '#555578', margin: 0 }}>Start studying to build your streak!</p>
          </div>
        </div>

        {/* ── AI Insight ── */}
        <div className="nb-card" style={{
          gridArea: 'insight',
          borderRadius: '20px',
          padding: '22px',
          background: 'linear-gradient(145deg, rgba(140,82,255,0.12) 0%, rgba(81,112,255,0.06) 50%, rgba(17,17,38,0.8) 100%)',
          border: '1px solid rgba(140,82,255,0.18)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), 0 8px 32px rgba(140,82,255,0.06)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(140,82,255,0.25) 0%, transparent 70%)',
            pointerEvents: 'none', animation: 'nb-pulse-glow 4s ease-in-out infinite',
          }} />
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '8px',
                background: 'rgba(140,82,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#ae89ff', fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
              </div>
              <span style={{ fontFamily: '"Shrikhand", serif', fontStyle: 'italic', fontSize: '18px', color: '#ae89ff' }}>
                AI Insight
              </span>
            </div>
            <p style={{ fontSize: '13px', lineHeight: 1.75, color: 'rgba(185,195,255,0.7)', fontWeight: 400, margin: '0 0 16px' }}>
              {documents.length > 0
                ? <>Based on your {documents.length} document{documents.length !== 1 ? 's' : ''}, I&apos;m ready to help you study. Start a chat to dive in.</>
                : 'Upload your first document to get AI-powered insights and study recommendations.'}
            </p>
            {documents.length > 0 ? (
              <button
                onClick={() => setShowCreateModal(true)}
                style={{
                  padding: '9px 20px',
                  background: 'linear-gradient(135deg, #8c52ff, #5170ff)',
                  color: '#fff', border: 'none', borderRadius: '10px',
                  fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: '0 4px 16px rgba(140,82,255,0.3)',
                  transition: 'transform 0.18s cubic-bezier(0.22,1,0.36,1)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
              >
                Start a chat
              </button>
            ) : (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'rgba(140,82,255,0.5)', fontWeight: 600 }}>
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>lock</span>
                Unlock by uploading
              </div>
            )}
          </div>
        </div>

        {/* ── Document Vault ── */}
        <div className="nb-card" style={{
          gridArea: 'vault',
          background: 'linear-gradient(170deg, #1c1c30 0%, #1c1c38 60%)',
          borderRadius: '22px', padding: '26px', alignSelf: 'stretch',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), 0 24px 48px rgba(0,0,0,0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#e5e3ff', margin: 0, letterSpacing: '-0.02em' }}>
                Document Vault
              </h3>
              <span style={{
                padding: '3px 8px', background: 'rgba(174,137,255,0.1)', color: '#ae89ff',
                fontSize: '10px', fontWeight: 900, borderRadius: '6px', letterSpacing: '0.06em',
                border: '1px solid rgba(174,137,255,0.15)',
              }}>
                {String(documents.length).padStart(2, '0')} FILES
              </span>
            </div>
            <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '10px', padding: '4px' }}>
              {['grid_view','list'].map((icon, i) => (
                <button key={icon} style={{
                  padding: '6px 8px', background: i === 1 ? 'rgba(174,137,255,0.12)' : 'transparent',
                  border: 'none', color: i === 1 ? '#ae89ff' : '#555578', borderRadius: '7px', cursor: 'pointer', display: 'flex',
                  transition: 'background 0.12s, color 0.12s',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{icon}</span>
                </button>
              ))}
            </div>
          </div>

          {documents.length === 0 ? (
            <div style={{ padding: '56px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '18px',
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: '32px', color: '#555578' }}>folder_open</span>
              </div>
              <div>
                <p style={{ fontSize: '15px', fontWeight: 700, color: '#aaa8c8', margin: '0 0 4px' }}>Vault is empty</p>
                <p style={{ fontSize: '13px', color: '#555578', margin: 0 }}>Upload files above or select notebook pages when starting a chat.</p>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {documents.map(doc => {
                const { icon, color, bg } = getFileIcon(doc.fileType);
                return (
                  <div
                    key={doc.id}
                    className="nb-doc-row"
                    style={{
                      display: 'flex', alignItems: 'center', gap: '14px',
                      padding: '13px 14px',
                      background: 'rgba(255,255,255,0.025)', borderRadius: '14px',
                      border: '1px solid rgba(255,255,255,0.07)',
                      transition: 'background 0.18s ease, border-color 0.18s ease', cursor: 'default',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.07)';
                      (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(174,137,255,0.15)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.025)';
                      (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.07)';
                    }}
                  >
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span className="material-symbols-outlined" style={{ color, fontSize: '19px' }}>{icon}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '13px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.fileName}
                      </p>
                      <p style={{ fontSize: '11px', color: '#8888a8', margin: 0 }}>
                        {formatBytes(doc.fileSize)} · {formatDate(doc.createdAt)}
                      </p>
                    </div>
                    <div className="nb-doc-actions" style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        disabled={deletingId === doc.id}
                        style={{ padding: '6px', background: 'transparent', border: 'none', color: '#8888a8', cursor: 'pointer', borderRadius: '7px', display: 'flex', transition: 'color 0.12s, background 0.12s' }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLButtonElement).style.color = '#fd6f85';
                          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(253,111,133,0.08)';
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLButtonElement).style.color = '#8888a8';
                          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                          {deletingId === doc.id ? 'hourglass_empty' : 'delete'}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Create chat modal */}
      {showCreateModal && (
        <CreateChatModal
          notebookId={id}
          notebookName={notebook?.name ?? ''}
          sections={sectionTree}
          documents={documents}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleChatCreated}
        />
      )}
    </div>
    </div>
  );
}
