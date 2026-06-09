'use client';

import { useRef, useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useDirectUpload } from '@/hooks/useDirectUpload';
import { validateFile } from '@/lib/file-validation';
import type { ImagePlaceholderOptions } from '@/lib/tiptap-image-placeholder';

/**
 * NodeView for the `imagePlaceholder` node: a tile marking a figure the PDF
 * importer detected but could not crop. Clicking opens the file picker;
 * dropping an image file or pasting (⌘V while selected, or the Paste button)
 * also works. A successful upload replaces the node with a `resizableImage`
 * through the same storage path the toolbar's image button uses.
 */
export default function ImagePlaceholderView({
  node,
  editor,
  getPos,
  extension,
}: NodeViewProps) {
  const label =
    (node.attrs.label as string) || 'This figure could not be extracted from the PDF.';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload } = useDirectUpload();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [focused, setFocused] = useState(false);

  const editable = editor.isEditable;

  const replaceWithImage = (src: string, alt: string) => {
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (pos === undefined) return;
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from: pos, to: pos + node.nodeSize },
        { type: 'resizableImage', attrs: { src, alt, width: null } },
      )
      .run();
  };

  const handleFile = async (file: File | null | undefined) => {
    if (!file || busy) return;
    if (!file.type.startsWith('image/')) {
      setError('That file is not an image.');
      return;
    }
    const validationError = validateFile(file, 'page-image');
    if (validationError) {
      setError(validationError);
      return;
    }
    const ctx = (extension.options as ImagePlaceholderOptions).getUploadContext?.();
    if (!ctx || !ctx.notebookId || !ctx.pageId || !ctx.sectionId) {
      setError('Upload is not available right now.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { storagePath } = await upload(file, 'page-image', ctx);
      const res = await fetch(`/api/notebooks/${ctx.notebookId}/pages/${ctx.pageId}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath, fileName: file.name }),
      });
      const json = await res.json();
      if (json.success && json.data?.url) {
        replaceWithImage(json.data.url, file.name);
      } else {
        setError('Upload failed — please try again.');
      }
    } catch {
      setError('Upload failed — please try again.');
    } finally {
      setBusy(false);
    }
  };

  const pasteFromClipboard = async () => {
    if (busy) return;
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) {
          const blob = await item.getType(type);
          await handleFile(
            new File([blob], `pasted.${type.split('/')[1] ?? 'png'}`, { type }),
          );
          return;
        }
      }
      setError('No image found in the clipboard.');
    } catch {
      setError('Clipboard access was blocked — use ⌘V instead.');
    }
  };

  const borderColor = dragOver
    ? 'var(--primary)'
    : focused
      ? 'rgba(174,137,255,0.7)'
      : 'var(--ink-20)';

  return (
    <NodeViewWrapper
      data-image-placeholder
      role={editable ? 'button' : undefined}
      aria-label={editable ? 'Add the missing figure image' : label}
      tabIndex={editable ? 0 : undefined}
      contentEditable={false}
      onClick={() => {
        if (editable && !busy) fileInputRef.current?.click();
      }}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (!editable || busy) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fileInputRef.current?.click();
        }
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPaste={(e: React.ClipboardEvent) => {
        if (!editable) return;
        const file = e.clipboardData?.files?.[0];
        if (file) {
          e.preventDefault();
          e.stopPropagation();
          void handleFile(file);
        }
      }}
      onDragOver={(e: React.DragEvent) => {
        if (!editable) return;
        e.preventDefault();
        e.stopPropagation();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e: React.DragEvent) => {
        if (!editable) return;
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        void handleFile(e.dataTransfer?.files?.[0]);
      }}
      style={{
        margin: '12px 0',
        padding: '20px 16px',
        borderRadius: '12px',
        border: `2px dashed ${borderColor}`,
        background: dragOver ? 'rgba(174,137,255,0.10)' : 'var(--ink-04)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '6px',
        textAlign: 'center',
        cursor: editable && !busy ? 'pointer' : 'default',
        outline: 'none',
        opacity: busy ? 0.7 : 1,
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <span
        className="material-symbols-outlined"
        aria-hidden
        style={{
          fontSize: 28,
          color: 'var(--ink-40)',
          animation: busy ? 'spin 0.8s linear infinite' : undefined,
        }}
      >
        {busy ? 'progress_activity' : 'image_not_supported'}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-70)' }}>{label}</span>
      {editable && (
        <span style={{ fontSize: 12, color: 'var(--ink-50)' }}>
          Click to add it from your files, drag &amp; drop, or{' '}
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              void pasteFromClipboard();
            }}
            style={{
              border: 'none',
              background: 'none',
              padding: 0,
              font: 'inherit',
              color: 'var(--primary)',
              textDecoration: 'underline',
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            paste from clipboard
          </button>
        </span>
      )}
      {error && (
        <span role="alert" style={{ fontSize: 12, color: 'var(--error)' }}>
          {error}
        </span>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </NodeViewWrapper>
  );
}
