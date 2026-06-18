'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import DocumentList, { type DocumentItem } from '@/components/features/DocumentList';
import VideoMaterialPicker, { type AddedVideo } from '@/components/study-packs/VideoMaterialPicker';
import { NMCard } from '@/components/rework/NMCard';
import { Button } from '@/components/ui/Button';
import { useDirectUpload } from '@/hooks/useDirectUpload';
import {
  uploadFileAsDocument,
  addYouTubeVideoToNotebook,
} from '@/lib/study-pack-material';

// Inline material browser for a Study Pack (= a Notebook). Lists the stored
// documents (uploaded PDFs/files + captioned transcripts) and imported pages
// (native video notes / PDF imports), and lets the learner add more or delete —
// all without the old notebook workspace.

interface PageItem {
  id: string;
  title: string;
  sectionTitle: string;
}

const ACCEPT = '.pdf,.doc,.docx,.txt,.md,.ppt,.pptx,.csv,.xlsx';

export default function MaterialBrowser({ notebookId }: { notebookId: string }) {
  const { upload } = useDirectUpload();
  const [documents, setDocuments] = useState<DocumentItem[] | null>(null);
  const [pages, setPages] = useState<PageItem[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [showVideo, setShowVideo] = useState(false);
  const [queuedVideos, setQueuedVideos] = useState<AddedVideo[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch(`/api/notebooks/${encodeURIComponent(notebookId)}/documents`);
      const json = await res.json();
      setDocuments(json?.success ? (json.data as DocumentItem[]) : []);
    } catch {
      setDocuments([]);
    }
  }, [notebookId]);

  const loadPages = useCallback(async () => {
    try {
      const res = await fetch(`/api/notebooks/${encodeURIComponent(notebookId)}/inventory`);
      const json = await res.json();
      setPages(json?.success ? ((json.data?.pages as PageItem[]) ?? []) : []);
    } catch {
      setPages([]);
    }
  }, [notebookId]);

  useEffect(() => {
    loadDocuments();
    loadPages();
    return () => abortRef.current?.abort();
  }, [loadDocuments, loadPages]);

  const handleDeleteDocument = useCallback(
    async (docId: string) => {
      setDeletingId(docId);
      try {
        const res = await fetch(
          `/api/notebooks/${encodeURIComponent(notebookId)}/documents/${encodeURIComponent(docId)}`,
          { method: 'DELETE' },
        );
        if (res.ok) {
          setDocuments((prev) => (prev ?? []).filter((d) => d.id !== docId));
        }
      } finally {
        setDeletingId(null);
      }
    },
    [notebookId],
  );

  const handleAddFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const files = Array.from(fileList);
      setError(null);
      setBusy(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        for (let i = 0; i < files.length; i++) {
          setPhase(`Uploading ${files[i].name} (${i + 1}/${files.length})…`);
          await uploadFileAsDocument(notebookId, files[i], upload, ctrl.signal);
        }
        await loadDocuments();
      } catch (e) {
        if ((e as Error)?.name !== 'AbortError') {
          setError((e as Error)?.message || 'Could not add those files.');
        }
      } finally {
        setBusy(false);
        setPhase('');
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [notebookId, upload, loadDocuments],
  );

  const handleAddVideos = useCallback(async () => {
    const pending = queuedVideos.filter((v) => !v.docId);
    if (pending.length === 0) {
      setShowVideo(false);
      return;
    }
    setError(null);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      for (const v of pending) {
        await addYouTubeVideoToNotebook(
          notebookId,
          { videoId: v.videoId, url: v.url, title: v.title, durationSec: v.durationSec },
          setPhase,
          ctrl.signal,
        );
      }
      setQueuedVideos([]);
      setShowVideo(false);
      await Promise.all([loadDocuments(), loadPages()]);
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        setError((e as Error)?.message || 'Could not add that video.');
      }
    } finally {
      setBusy(false);
      setPhase('');
    }
  }, [notebookId, queuedVideos, loadDocuments, loadPages]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4, 16px)' }}>
      {/* Add bar */}
      <div style={{ display: 'flex', gap: 'var(--space-3, 12px)', flexWrap: 'wrap' }}>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT}
          onChange={(e) => handleAddFiles(e.target.files)}
          style={{ display: 'none' }}
        />
        <Button
          variant="primary"
          shape="pill"
          leadingIcon="upload_file"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          Add files
        </Button>
        <Button
          variant="secondary"
          shape="pill"
          leadingIcon="smart_display"
          disabled={busy}
          onClick={() => setShowVideo(true)}
        >
          Add video
        </Button>
      </div>

      {busy && (
        <NMCard style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 18, color: 'var(--accent-strong)', animation: 'spin 1s linear infinite' }}
            aria-hidden
          >
            progress_activity
          </span>
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--on-surface-variant)' }}>
            {phase || 'Working…'}
          </span>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </NMCard>
      )}

      {error && (
        <NMCard style={{ borderColor: 'var(--error)' }}>
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--error)' }}>{error}</span>
        </NMCard>
      )}

      {/* Documents */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3, 12px)' }}>
        <SectionLabel icon="description" label="Documents & files" />
        {documents === null ? (
          <p style={dim}>Loading…</p>
        ) : (
          <DocumentList
            documents={documents}
            notebookId={notebookId}
            onDelete={handleDeleteDocument}
            deletingId={deletingId}
          />
        )}
      </section>

      {/* Imported pages (native video notes, PDF imports) */}
      {pages && pages.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3, 12px)' }}>
          <SectionLabel icon="article" label="Notes & imported pages" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pages.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  borderRadius: 10,
                  background: 'rgba(237,233,255,0.03)',
                  border: '1px solid rgba(237,233,255,0.07)',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--nm-lesson)', flexShrink: 0 }} aria-hidden>
                  article
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 13,
                    color: 'var(--on-surface)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={p.title}
                >
                  {p.title}
                </span>
                <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', flexShrink: 0 }}>
                  {p.sectionTitle}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Add-video modal */}
      {showVideo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add a video"
          onClick={() => !busy && setShowVideo(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(560px, 100%)',
              maxHeight: '85vh',
              overflowY: 'auto',
              background: 'var(--surface)',
              border: '1px solid var(--outline-variant)',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-5, 20px)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4, 16px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}>
                Add YouTube videos
              </h3>
              <button
                type="button"
                onClick={() => !busy && setShowVideo(false)}
                aria-label="Close"
                style={{ background: 'none', border: 'none', color: 'var(--on-surface-variant)', cursor: 'pointer', display: 'flex' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>

            <VideoMaterialPicker videos={queuedVideos} onChange={setQueuedVideos} />

            <Button
              variant="primary"
              shape="pill"
              leadingIcon="add"
              disabled={busy || queuedVideos.filter((v) => !v.docId).length === 0}
              onClick={handleAddVideos}
            >
              {busy ? 'Adding…' : 'Add to pack'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ icon, label }: { icon: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--on-surface-variant)' }} aria-hidden>
        {icon}
      </span>
      <h4 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--on-surface)', margin: 0 }}>
        {label}
      </h4>
    </div>
  );
}

const dim: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--fs-sm)',
  color: 'var(--on-surface-variant)',
  margin: 0,
};
