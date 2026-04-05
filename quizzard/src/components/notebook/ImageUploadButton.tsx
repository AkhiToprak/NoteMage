'use client';

import { useRef } from 'react';
import type { Editor } from '@tiptap/react';
import { ImagePlus, Loader } from 'lucide-react';
import { useDirectUpload } from '@/hooks/useDirectUpload';
import { validateFile } from '@/lib/file-validation';

interface ImageUploadButtonProps {
  editor: Editor;
  notebookId: string;
  sectionId: string;
  pageId: string;
}

export default function ImageUploadButton({ editor, notebookId, sectionId, pageId }: ImageUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload, isUploading } = useDirectUpload();

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateFile(file, 'page-image');
    if (validationError) {
      // Could show a toast here; for now silently reject
      return;
    }

    try {
      const { storagePath } = await upload(file, 'page-image', {
        notebookId,
        sectionId,
        pageId,
      });

      const res = await fetch(`/api/notebooks/${notebookId}/pages/${pageId}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath, fileName: file.name }),
      });

      const json = await res.json();
      if (json.success && json.data?.url) {
        editor.chain().focus().insertContent({
          type: 'resizableImage',
          attrs: { src: json.data.url, alt: file.name, width: null },
        }).run();
      }
    } catch {
      // Upload failed silently
    } finally {
      // Reset input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <button
        onClick={handleClick}
        disabled={isUploading}
        title="Insert Image"
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
          cursor: isUploading ? 'not-allowed' : 'pointer',
          opacity: isUploading ? 0.35 : 1,
          transition: 'background 0.12s ease, color 0.12s ease',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          if (!isUploading) {
            e.currentTarget.style.background = 'rgba(237,233,255,0.08)';
            e.currentTarget.style.color = 'rgba(237,233,255,0.8)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'rgba(237,233,255,0.5)';
        }}
      >
        {isUploading ? (
          <Loader size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
        ) : (
          <ImagePlus size={16} />
        )}
      </button>
    </>
  );
}
