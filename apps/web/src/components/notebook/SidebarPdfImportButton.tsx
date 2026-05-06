'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileUp, Loader2 } from 'lucide-react';
import { useDirectUpload } from '@/hooks/useDirectUpload';
import { renderPdfToPngs } from '@/lib/pdf-client-render';

interface SidebarPdfImportButtonProps {
  notebookId: string;
  onImported: () => void;
}

/**
 * Top-level "Import PDF" button shown in the notebook sidebar.
 *
 * Each page of the PDF is rendered to a PNG in the browser, uploaded
 * as a page image, and inserted as a resizableImage node. This avoids
 * the near-impossible problem of recovering semantic structure from a
 * PDF and gives the user pixel-perfect pages to draw / highlight on
 * top of using the existing pen tooling.
 *
 * If the notebook has no sections, an "Imports" section is created
 * on the fly.
 */
export default function SidebarPdfImportButton({
  notebookId,
  onImported,
}: SidebarPdfImportButtonProps) {
  const router = useRouter();
  const { upload } = useDirectUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ensureSectionId = useCallback(async (): Promise<string> => {
    const res = await fetch(`/api/notebooks/${notebookId}/sections`);
    const json = await res.json();
    if (json?.success && Array.isArray(json.data) && json.data.length > 0) {
      return json.data[0].id as string;
    }
    const created = await fetch(`/api/notebooks/${notebookId}/sections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Imports' }),
    });
    const createdJson = await created.json();
    if (!createdJson?.success || !createdJson?.data?.id) {
      throw new Error('Could not create a section for the imported PDF');
    }
    return createdJson.data.id as string;
  }, [notebookId]);

  const handleFile = useCallback(
    async (file: File) => {
      if (file.type !== 'application/pdf') {
        setError('Only PDF files are supported here');
        setTimeout(() => setError(null), 3000);
        return;
      }
      setBusy(true);
      setError(null);
      setProgressText('Rendering PDF…');

      try {
        const sectionId = await ensureSectionId();
        const title = file.name.replace(/\.[^.]+$/, '');

        // 1) Render all pages in the browser.
        const pages = await renderPdfToPngs(file, {
          onProgress: ({ current, total }) =>
            setProgressText(`Rendering page ${current} / ${total}`),
        });

        if (pages.length === 0) throw new Error('No pages found in PDF');

        // 2) Create the empty page so we have an id for uploads.
        setProgressText('Creating page…');
        const createRes = await fetch(
          `/api/notebooks/${notebookId}/sections/${sectionId}/pages`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title }),
          }
        );
        const createJson = await createRes.json();
        if (!createRes.ok || !createJson?.success || !createJson?.data?.id) {
          throw new Error(createJson?.error || 'Failed to create page');
        }
        const pageId: string = createJson.data.id;

        // 3) Upload each rendered page and collect image nodes.
        const imageNodes: unknown[] = [];
        for (const page of pages) {
          setProgressText(`Uploading page ${page.pageNumber} / ${pages.length}`);
          const pngFile = new File([page.blob], `page-${page.pageNumber}.png`, {
            type: 'image/png',
          });
          const { storagePath } = await upload(pngFile, 'page-image', {
            notebookId,
            sectionId,
            pageId,
          });
          const registerRes = await fetch(
            `/api/notebooks/${notebookId}/pages/${pageId}/images`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ storagePath, fileName: pngFile.name }),
            }
          );
          const registerJson = await registerRes.json();
          if (!registerJson?.success || !registerJson?.data?.url) continue;

          imageNodes.push({
            type: 'resizableImage',
            attrs: {
              src: registerJson.data.url,
              alt: `${title} – page ${page.pageNumber}`,
              width: null,
            },
          });
        }

        if (imageNodes.length === 0) {
          throw new Error('Failed to upload any PDF pages');
        }

        // 4) Write the full page document.
        setProgressText('Saving…');
        const content = { type: 'doc', content: imageNodes };
        const updateRes = await fetch(`/api/notebooks/${notebookId}/pages/${pageId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        });
        if (!updateRes.ok) {
          throw new Error(`Save failed (${updateRes.status})`);
        }

        onImported();
        router.push(`/notebooks/${notebookId}/pages/${pageId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Import failed');
        setTimeout(() => setError(null), 4000);
      } finally {
        setBusy(false);
        setProgressText(null);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [notebookId, upload, ensureSectionId, onImported, router]
  );

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
        style={{ display: 'none' }}
      />
      <button
        onClick={() => !busy && inputRef.current?.click()}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        disabled={busy}
        title="Import PDF as a new page"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          padding: '7px 0',
          marginBottom: '6px',
          borderRadius: '6px',
          border: '1px solid rgba(140,82,255,0.25)',
          background: hovered ? 'rgba(140,82,255,0.14)' : 'rgba(140,82,255,0.06)',
          color: hovered ? '#ede9ff' : 'rgba(237,233,255,0.72)',
          fontFamily: 'inherit',
          fontSize: '12px',
          fontWeight: 600,
          cursor: busy ? 'progress' : 'pointer',
          transition: 'background 0.12s ease, color 0.12s ease',
        }}
      >
        {busy ? (
          <>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            {progressText ?? 'Importing PDF…'}
          </>
        ) : (
          <>
            <FileUp size={14} />
            Import PDF
          </>
        )}
      </button>
      {error && (
        <div
          style={{
            marginBottom: '6px',
            padding: '6px 8px',
            fontSize: '11px',
            color: '#fca5a5',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: '6px',
            textAlign: 'center',
          }}
        >
          {error}
        </div>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
