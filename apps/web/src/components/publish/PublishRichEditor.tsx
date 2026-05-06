'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import TiptapImage from '@tiptap/extension-image';
import { common, createLowlight } from 'lowlight';
import { useEffect, useRef, useCallback } from 'react';

const lowlight = createLowlight(common);

const COLORS = {
  elevated: '#2d2d52',
  primary: '#8c52ff',
  primaryLight: '#ae89ff',
  textPrimary: '#ede9ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  border: '#555578',
  borderSubtle: '#2a2a44',
} as const;

interface PublishRichEditorProps {
  content: string;
  onChange: (html: string) => void;
}

interface ToolbarButtonProps {
  icon: string;
  label: string;
  active?: boolean;
  onClick: () => void;
}

function ToolbarButton({ icon, label, active, onClick }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      style={{
        padding: '6px 8px',
        borderRadius: 6,
        border: 'none',
        background: active ? 'rgba(140,82,255,0.2)' : 'transparent',
        color: active ? COLORS.primaryLight : COLORS.textMuted,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.1s, color 0.1s',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
        {icon}
      </span>
    </button>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PublishRichEditor({ content, onChange }: PublishRichEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Underline,
      Placeholder.configure({
        placeholder: 'Write your content here... Add text, code blocks, and images.',
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
      TiptapImage.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: {
          style: 'max-width: 100%; height: auto; border-radius: 8px; margin: 12px 0;',
        },
      }),
    ],
    content: content || '',
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
    },
    editorProps: {
      attributes: {
        style: [
          `color: ${COLORS.textPrimary}`,
          `font-size: 14px`,
          `line-height: 1.7`,
          `min-height: 250px`,
          `padding: 16px`,
          `outline: none`,
        ].join('; '),
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved || !event.dataTransfer?.files?.length) return false;
        const files = Array.from(event.dataTransfer.files).filter((f) =>
          f.type.startsWith('image/')
        );
        if (files.length === 0) return false;

        event.preventDefault();
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });

        files.forEach(async (file) => {
          const base64 = await fileToBase64(file);
          if (coords) {
            const node = view.state.schema.nodes.image.create({ src: base64 });
            const tr = view.state.tr.insert(coords.pos, node);
            view.dispatch(tr);
          }
        });

        return true;
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;

        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (!file) continue;

            fileToBase64(file).then((base64) => {
              editor?.chain().focus().setImage({ src: base64 }).run();
            });
            return true;
          }
        }
        return false;
      },
    },
  });

  const handleImageUpload = useCallback(async () => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || !editor) return;

      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        if (file.size > 5 * 1024 * 1024) continue; // 5MB limit
        const base64 = await fileToBase64(file);
        editor.chain().focus().setImage({ src: base64 }).run();
      }

      e.target.value = '';
    },
    [editor]
  );

  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  if (!editor) return null;

  return (
    <div
      style={{
        borderRadius: 12,
        border: `1px solid ${COLORS.borderSubtle}`,
        background: COLORS.elevated,
        overflow: 'hidden',
      }}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          padding: '6px 8px',
          borderBottom: `1px solid ${COLORS.borderSubtle}`,
          flexWrap: 'wrap',
        }}
      >
        <ToolbarButton
          icon="format_bold"
          label="Bold"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          icon="format_italic"
          label="Italic"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          icon="format_underlined"
          label="Underline"
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
        <div style={{ width: 1, background: COLORS.borderSubtle, margin: '4px 4px' }} />
        <ToolbarButton
          icon="title"
          label="Heading 2"
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <ToolbarButton
          icon="format_h3"
          label="Heading 3"
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        />
        <div style={{ width: 1, background: COLORS.borderSubtle, margin: '4px 4px' }} />
        <ToolbarButton
          icon="format_list_bulleted"
          label="Bullet List"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          icon="format_list_numbered"
          label="Ordered List"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          icon="format_quote"
          label="Blockquote"
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />
        <ToolbarButton
          icon="code"
          label="Code Block"
          active={editor.isActive('codeBlock')}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        />
        <div style={{ width: 1, background: COLORS.borderSubtle, margin: '4px 4px' }} />
        <ToolbarButton
          icon="add_photo_alternate"
          label="Insert Image"
          onClick={handleImageUpload}
        />
      </div>

      {/* Editor */}
      <div className="publish-rich-editor">
        <EditorContent editor={editor} />
        <style>{`
          .publish-rich-editor .tiptap {
            min-height: 250px;
            outline: none;
          }
          .publish-rich-editor .tiptap p.is-editor-empty:first-child::before {
            content: attr(data-placeholder);
            float: left;
            color: ${COLORS.textMuted};
            pointer-events: none;
            height: 0;
          }
          .publish-rich-editor .tiptap h2 {
            font-size: 20px;
            font-weight: 700;
            margin: 16px 0 8px;
            color: ${COLORS.textPrimary};
          }
          .publish-rich-editor .tiptap h3 {
            font-size: 16px;
            font-weight: 700;
            margin: 12px 0 6px;
            color: ${COLORS.textPrimary};
          }
          .publish-rich-editor .tiptap ul,
          .publish-rich-editor .tiptap ol {
            padding-left: 24px;
            margin: 8px 0;
          }
          .publish-rich-editor .tiptap blockquote {
            border-left: 3px solid ${COLORS.primaryLight};
            padding-left: 16px;
            margin: 12px 0;
            color: ${COLORS.textSecondary};
          }
          .publish-rich-editor .tiptap pre {
            background: #1a1a36;
            border-radius: 8px;
            padding: 16px;
            margin: 12px 0;
            overflow-x: auto;
            font-family: 'JetBrains Mono', monospace;
            font-size: 13px;
          }
          .publish-rich-editor .tiptap code {
            background: rgba(140,82,255,0.15);
            color: ${COLORS.primaryLight};
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 13px;
          }
          .publish-rich-editor .tiptap pre code {
            background: none;
            color: ${COLORS.textPrimary};
            padding: 0;
          }
          .publish-rich-editor .tiptap img {
            max-width: 100%;
            height: auto;
            border-radius: 8px;
            margin: 12px 0;
            display: block;
          }
          .publish-rich-editor .tiptap img.ProseMirror-selectednode {
            outline: 2px solid ${COLORS.primaryLight};
            outline-offset: 2px;
          }
        `}</style>

        {/* Drop zone hint */}
        <div
          style={{
            padding: '8px 16px',
            borderTop: `1px solid ${COLORS.borderSubtle}`,
            fontSize: 11,
            color: COLORS.textMuted,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
            info
          </span>
          Drag & drop or paste images directly into the editor
        </div>
      </div>
    </div>
  );
}
