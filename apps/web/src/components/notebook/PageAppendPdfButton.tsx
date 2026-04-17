'use client';

import { useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { FileUp, Loader2 } from 'lucide-react';
import { useDirectUpload } from '@/hooks/useDirectUpload';
import { renderPdfToPngs } from '@/lib/pdf-client-render';

interface PageAppendPdfButtonProps {
  editor: Editor;
  notebookId: string;
  sectionId: string;
  pageId: string;
}

/**
 * Toolbar button that renders a PDF to PNG pages in the browser and
 * appends each page as a resizableImage node on the current page.
 * Users can then annotate with the existing pen / highlight tools.
 */
export default function PageAppendPdfButton({
  editor,
  notebookId,
  sectionId,
  pageId,
}: PageAppendPdfButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload } = useDirectUpload();
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    if (file.type !== 'application/pdf') return;
    setBusy(true);
    try {
      const pages = await renderPdfToPngs(file);
      const imageNodes: Array<Record<string, unknown>> = [];

      for (const page of pages) {
        const pngFile = new File([page.blob], `page-${page.pageNumber}.png`, {
          type: 'image/png',
        });
        const { storagePath } = await upload(pngFile, 'page-image', {
          notebookId,
          sectionId,
          pageId,
        });
        const res = await fetch(`/api/notebooks/${notebookId}/pages/${pageId}/images`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storagePath, fileName: pngFile.name }),
        });
        const json = await res.json();
        if (json?.success && json.data?.url) {
          imageNodes.push({
            type: 'resizableImage',
            attrs: {
              src: json.data.url,
              alt: `${file.name} – page ${page.pageNumber}`,
              width: null,
            },
          });
        }
      }

      if (imageNodes.length > 0) {
        editor.chain().focus('end').insertContent(imageNodes).run();
      }
    } catch {
      // Silent — toolbar has no toast infra yet
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

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
        disabled={busy}
        title="Append PDF to this page"
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          border: 'none',
          background: 'transparent',
          color: 'rgba(237,233,255,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: busy ? 'progress' : 'pointer',
          opacity: busy ? 0.35 : 1,
          transition: 'background 0.12s ease, color 0.12s ease',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          if (!busy) {
            e.currentTarget.style.background = 'rgba(237,233,255,0.08)';
            e.currentTarget.style.color = 'rgba(237,233,255,0.8)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'rgba(237,233,255,0.5)';
        }}
      >
        {busy ? (
          <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
        ) : (
          <FileUp size={16} />
        )}
      </button>
    </>
  );
}
