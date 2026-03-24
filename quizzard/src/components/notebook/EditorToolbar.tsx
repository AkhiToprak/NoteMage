'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold, Italic, Underline, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Code,
  Palette, Highlighter, Undo, Redo, PenTool,
  ChevronDown, ALargeSmall,
} from 'lucide-react';
import ImageUploadButton from './ImageUploadButton';

/* ── font options ── */
const FONT_FAMILIES = [
  { label: 'Default', value: '' },
  { label: 'DM Sans', value: '"DM Sans", sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Courier', value: '"Courier New", monospace' },
  { label: 'Trebuchet', value: '"Trebuchet MS", sans-serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
];

const FONT_SIZES = ['12', '14', '16', '18', '20', '24', '28', '32', '40', '48'];

/* ── colour swatches ── */
const TEXT_COLORS = [
  '#ede9ff', '#ffffff', '#fca5a5', '#f87171',
  '#fdba74', '#fde047', '#86efac', '#4ade80',
  '#7dd3fc', '#38bdf8', '#c4b5fd', '#a78bfa',
  '#f9a8d4', '#fb7185', '#94a3b8', '#64748b',
];

const HIGHLIGHT_COLORS = [
  'rgba(140,82,255,0.30)', 'rgba(81,112,255,0.30)',
  'rgba(239,68,68,0.25)', 'rgba(249,115,22,0.25)',
  'rgba(234,179,8,0.30)', 'rgba(34,197,94,0.25)',
  'rgba(14,165,233,0.25)', 'rgba(236,72,153,0.25)',
  'rgba(168,85,247,0.25)', 'rgba(20,184,166,0.25)',
  'rgba(245,158,11,0.30)', 'rgba(99,102,241,0.30)',
  'rgba(239,68,68,0.15)', 'rgba(34,197,94,0.15)',
  'rgba(14,165,233,0.15)', 'rgba(255,255,255,0.10)',
];

/* ── inline heading scale levels ── */
const INLINE_SCALE_LEVELS = [
  { level: 1, label: 'H1 Scale', size: '30px' },
  { level: 2, label: 'H2 Scale', size: '22px' },
  { level: 3, label: 'H3 Scale', size: '18px' },
];

interface EditorToolbarProps {
  editor: Editor | null;
  notebookId: string;
  pageId: string;
  onToggleDrawing?: () => void;
  isDrawing?: boolean;
}

/*
 * ─── Selection preservation ───
 * When clicking toolbar buttons / dropdown items the browser can sometimes
 * clear the editor's text selection even with preventDefault().  We keep a
 * ref that always holds the last *non-collapsed* selection range so every
 * mark command can restore it before executing.
 */
function useSelectionGuard(editor: Editor | null) {
  const selRef = useRef<{ from: number; to: number } | null>(null);

  useEffect(() => {
    if (!editor) return;
    const save = () => {
      const { from, to } = editor.state.selection;
      if (from !== to) selRef.current = { from, to };
    };
    editor.on('selectionUpdate', save);
    // also save on transaction so cursor moves are captured
    editor.on('transaction', save);
    return () => {
      editor.off('selectionUpdate', save);
      editor.off('transaction', save);
    };
  }, [editor]);

  /**
   * Ensures the editor has focus AND restores the last non-collapsed
   * selection if the current one is collapsed (cursor only).
   * Returns a chain that is ready to have mark commands appended.
   */
  const withSelection = useCallback(
    (fn: (chain: ReturnType<Editor['chain']>) => void) => {
      if (!editor) return;
      const { from, to } = editor.state.selection;
      let chain = editor.chain();
      if (from === to && selRef.current) {
        // Selection was lost — restore it
        chain = chain.setTextSelection(selRef.current);
      }
      chain = chain.focus();
      fn(chain);
    },
    [editor],
  );

  return withSelection;
}

/* ── single toolbar button ── */
function ToolbarButton({
  icon: Icon,
  label,
  isActive,
  onClick,
  disabled,
}: {
  icon: typeof Bold;
  label: string;
  isActive?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      title={label}
      style={{
        width: '30px',
        height: '28px',
        borderRadius: '6px',
        border: 'none',
        background: isActive ? 'rgba(140,82,255,0.22)' : 'transparent',
        color: isActive ? '#a47bff' : 'rgba(237,233,255,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        transition: 'background 0.1s, color 0.1s',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!disabled && !isActive) {
          e.currentTarget.style.background = 'rgba(237,233,255,0.08)';
          e.currentTarget.style.color = 'rgba(237,233,255,0.85)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'rgba(237,233,255,0.5)';
        }
      }}
    >
      <Icon size={15} />
    </button>
  );
}

/* ── separator ── */
function Sep() {
  return (
    <div style={{ width: '1px', height: '18px', background: 'rgba(237,233,255,0.08)', margin: '0 2px', flexShrink: 0 }} />
  );
}

/* ── color picker grid dropdown ── */
function ColorPicker({
  colors, activeColor, onPick, icon: Icon, label,
}: {
  colors: string[];
  activeColor: string | undefined;
  onPick: (c: string) => void;
  icon: typeof Palette;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onMouseDown={(e) => { e.preventDefault(); setOpen((p) => !p); }}
        title={label}
        style={{
          width: '30px',
          height: '28px',
          borderRadius: '6px',
          border: 'none',
          background: !!activeColor ? 'rgba(140,82,255,0.22)' : 'transparent',
          color: !!activeColor ? '#a47bff' : 'rgba(237,233,255,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'background 0.1s, color 0.1s',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          if (!activeColor) {
            e.currentTarget.style.background = 'rgba(237,233,255,0.08)';
            e.currentTarget.style.color = 'rgba(237,233,255,0.85)';
          }
        }}
        onMouseLeave={(e) => {
          if (!activeColor) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'rgba(237,233,255,0.5)';
          }
        }}
      >
        <Icon size={15} />
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#131228',
          border: '1px solid rgba(140,82,255,0.2)',
          borderRadius: '10px',
          padding: '10px',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '5px',
          zIndex: 100,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          width: '128px',
        }}>
          {colors.map((c) => (
            <button
              key={c}
              onMouseDown={(e) => { e.preventDefault(); onPick(c); setOpen(false); }}
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                background: c,
                border: activeColor === c ? '2px solid #a47bff' : '1px solid rgba(237,233,255,0.12)',
                cursor: 'pointer',
                transition: 'transform 0.1s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.18)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              title={c}
            />
          ))}
          <button
            onMouseDown={(e) => { e.preventDefault(); onPick(''); setOpen(false); }}
            style={{
              gridColumn: '1 / -1',
              height: '22px',
              borderRadius: '6px',
              background: 'rgba(237,233,255,0.05)',
              border: '1px solid rgba(237,233,255,0.1)',
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '10px',
              color: 'rgba(237,233,255,0.4)',
              marginTop: '2px',
            }}
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
}

/* ── font family dropdown ── */
function FontFamilySelect({ editor, withSelection }: { editor: Editor; withSelection: ReturnType<typeof useSelectionGuard> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = (() => {
    const fam = editor.getAttributes('textStyle').fontFamily as string | undefined;
    if (!fam) return 'Default';
    const match = FONT_FAMILIES.find((f) => f.value === fam);
    return match?.label ?? 'Default';
  })();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onMouseDown={(e) => { e.preventDefault(); setOpen((p) => !p); }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          height: '28px',
          padding: '0 8px',
          borderRadius: '6px',
          border: '1px solid rgba(237,233,255,0.1)',
          background: open ? 'rgba(140,82,255,0.12)' : 'rgba(237,233,255,0.04)',
          color: 'rgba(237,233,255,0.7)',
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '12px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          minWidth: '84px',
          transition: 'background 0.1s',
        }}
      >
        <span style={{ flex: 1, textAlign: 'left' }}>{current}</span>
        <ChevronDown size={11} style={{ flexShrink: 0, opacity: 0.5 }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          background: '#131228',
          border: '1px solid rgba(140,82,255,0.2)',
          borderRadius: '8px',
          padding: '4px',
          zIndex: 100,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          minWidth: '140px',
        }}>
          {FONT_FAMILIES.map((f) => (
            <button
              key={f.value}
              onMouseDown={(e) => {
                e.preventDefault();
                withSelection((chain) => {
                  if (f.value) chain.setFontFamily(f.value).run();
                  else chain.unsetFontFamily().run();
                });
                setOpen(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '6px 10px',
                borderRadius: '6px',
                border: 'none',
                background: current === f.label ? 'rgba(140,82,255,0.18)' : 'transparent',
                color: current === f.label ? '#a47bff' : 'rgba(237,233,255,0.7)',
                fontFamily: f.value || 'inherit',
                fontSize: '13px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(237,233,255,0.06)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = current === f.label ? 'rgba(140,82,255,0.18)' : 'transparent'; }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── font size control ── */
function FontSizeControl({ editor, withSelection }: { editor: Editor; withSelection: ReturnType<typeof useSelectionGuard> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentSize = (() => {
    const fs = editor.getAttributes('textStyle').fontSize as string | undefined;
    if (!fs) return '15';
    return fs.replace('px', '');
  })();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onMouseDown={(e) => { e.preventDefault(); setOpen((p) => !p); }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '3px',
          height: '28px',
          padding: '0 7px',
          borderRadius: '6px',
          border: '1px solid rgba(237,233,255,0.1)',
          background: open ? 'rgba(140,82,255,0.12)' : 'rgba(237,233,255,0.04)',
          color: 'rgba(237,233,255,0.7)',
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '12px',
          cursor: 'pointer',
          minWidth: '52px',
          transition: 'background 0.1s',
        }}
      >
        <span style={{ flex: 1, textAlign: 'left' }}>{currentSize}px</span>
        <ChevronDown size={10} style={{ flexShrink: 0, opacity: 0.5 }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          background: '#131228',
          border: '1px solid rgba(140,82,255,0.2)',
          borderRadius: '8px',
          padding: '4px',
          zIndex: 100,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          minWidth: '80px',
        }}>
          {FONT_SIZES.map((s) => (
            <button
              key={s}
              onMouseDown={(e) => {
                e.preventDefault();
                withSelection((chain) => {
                  if (!s) chain.unsetFontSize().run();
                  else chain.setFontSize(`${s}px`).run();
                });
                setOpen(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '5px 10px',
                borderRadius: '5px',
                border: 'none',
                background: currentSize === s ? 'rgba(140,82,255,0.18)' : 'transparent',
                color: currentSize === s ? '#a47bff' : 'rgba(237,233,255,0.7)',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '12px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(237,233,255,0.06)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = currentSize === s ? 'rgba(140,82,255,0.18)' : 'transparent'; }}
            >
              {s}px
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── inline heading scale dropdown ── */
function InlineScaleDropdown({ editor, withSelection }: { editor: Editor; withSelection: ReturnType<typeof useSelectionGuard> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const activeLevel = (() => {
    for (const { level } of INLINE_SCALE_LEVELS) {
      if (editor.isActive('inlineHeading', { level })) return level;
    }
    return null;
  })();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onMouseDown={(e) => { e.preventDefault(); setOpen((p) => !p); }}
        title="Inline text scale — make selected text H1/H2/H3 sized without block heading"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '3px',
          height: '28px',
          padding: '0 7px',
          borderRadius: '6px',
          border: '1px solid rgba(237,233,255,0.1)',
          background: activeLevel !== null ? 'rgba(140,82,255,0.22)' : open ? 'rgba(140,82,255,0.12)' : 'rgba(237,233,255,0.04)',
          color: activeLevel !== null ? '#a47bff' : 'rgba(237,233,255,0.7)',
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '12px',
          cursor: 'pointer',
          minWidth: '52px',
          transition: 'background 0.1s, color 0.1s',
        }}
        onMouseEnter={(e) => {
          if (activeLevel === null && !open) {
            e.currentTarget.style.background = 'rgba(237,233,255,0.08)';
          }
        }}
        onMouseLeave={(e) => {
          if (activeLevel === null && !open) {
            e.currentTarget.style.background = 'rgba(237,233,255,0.04)';
          }
        }}
      >
        <ALargeSmall size={14} style={{ flexShrink: 0 }} />
        <ChevronDown size={10} style={{ flexShrink: 0, opacity: 0.5 }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          background: '#131228',
          border: '1px solid rgba(140,82,255,0.2)',
          borderRadius: '8px',
          padding: '4px',
          zIndex: 100,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          minWidth: '120px',
        }}>
          {INLINE_SCALE_LEVELS.map(({ level, label, size }) => (
            <button
              key={level}
              onMouseDown={(e) => {
                e.preventDefault();
                withSelection((chain) => {
                  chain.toggleInlineHeading({ level }).run();
                });
                setOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '6px 10px',
                borderRadius: '5px',
                border: 'none',
                background: activeLevel === level ? 'rgba(140,82,255,0.18)' : 'transparent',
                color: activeLevel === level ? '#a47bff' : 'rgba(237,233,255,0.7)',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '13px',
                fontWeight: level <= 2 ? 700 : 600,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(237,233,255,0.06)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = activeLevel === level ? 'rgba(140,82,255,0.18)' : 'transparent'; }}
            >
              <span>{label}</span>
              <span style={{ fontSize: '10px', opacity: 0.45, fontWeight: 400 }}>{size}</span>
            </button>
          ))}
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              withSelection((chain) => {
                chain.unsetInlineHeading().run();
              });
              setOpen(false);
            }}
            style={{
              display: 'block',
              width: '100%',
              padding: '5px 10px',
              borderRadius: '5px',
              border: 'none',
              background: 'transparent',
              color: 'rgba(237,233,255,0.4)',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '11px',
              cursor: 'pointer',
              textAlign: 'left',
              marginTop: '2px',
              borderTop: '1px solid rgba(237,233,255,0.06)',
              paddingTop: '6px',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(237,233,255,0.06)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            Reset to normal
          </button>
        </div>
      )}
    </div>
  );
}

/* ── toolbar row ── */
const ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  padding: '4px 12px',
  flexWrap: 'nowrap',
  minWidth: 0,
};

/* ── main toolbar ── */
export default function EditorToolbar({ editor, notebookId, pageId, onToggleDrawing, isDrawing }: EditorToolbarProps) {
  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);
  const withSelection = useSelectionGuard(editor);

  useEffect(() => {
    if (!editor) return;
    editor.on('selectionUpdate', bump);
    editor.on('transaction', bump);
    return () => {
      editor.off('selectionUpdate', bump);
      editor.off('transaction', bump);
    };
  }, [editor, bump]);

  if (!editor) return null;

  return (
    <div style={{
      background: '#09081a',
      borderBottom: '1px solid rgba(140,82,255,0.1)',
      position: 'sticky',
      top: 0,
      zIndex: 10,
    }}>
      {/* Row 1: Font controls + inline formatting */}
      <div style={{ ...ROW_STYLE, borderBottom: '1px solid rgba(237,233,255,0.04)', gap: '4px' }}>
        <FontFamilySelect editor={editor} withSelection={withSelection} />
        <FontSizeControl editor={editor} withSelection={withSelection} />
        <Sep />
        <ToolbarButton icon={Bold} label="Bold (Cmd+B)" isActive={editor.isActive('bold')} onClick={() => withSelection((c) => c.toggleBold().run())} />
        <ToolbarButton icon={Italic} label="Italic (Cmd+I)" isActive={editor.isActive('italic')} onClick={() => withSelection((c) => c.toggleItalic().run())} />
        <ToolbarButton icon={Underline} label="Underline (Cmd+U)" isActive={editor.isActive('underline')} onClick={() => withSelection((c) => c.toggleUnderline().run())} />
        <ToolbarButton icon={Strikethrough} label="Strikethrough" isActive={editor.isActive('strike')} onClick={() => withSelection((c) => c.toggleStrike().run())} />
        <Sep />
        <ColorPicker
          icon={Palette}
          label="Text Color"
          colors={TEXT_COLORS}
          activeColor={editor.getAttributes('textStyle').color as string | undefined}
          onPick={(c) => {
            withSelection((chain) => {
              if (c) chain.setColor(c).run();
              else chain.unsetColor().run();
            });
          }}
        />
        <ColorPicker
          icon={Highlighter}
          label="Highlight"
          colors={HIGHLIGHT_COLORS}
          activeColor={editor.getAttributes('highlight').color as string | undefined}
          onPick={(c) => {
            withSelection((chain) => {
              if (c) chain.toggleHighlight({ color: c }).run();
              else chain.unsetHighlight().run();
            });
          }}
        />
        <Sep />
        <InlineScaleDropdown editor={editor} withSelection={withSelection} />
      </div>

      {/* Row 2: Block formatting + utilities */}
      <div style={ROW_STYLE}>
        <ToolbarButton icon={Heading1} label="Heading 1" isActive={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
        <ToolbarButton icon={Heading2} label="Heading 2" isActive={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
        <ToolbarButton icon={Heading3} label="Heading 3" isActive={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
        <Sep />
        <ToolbarButton icon={List} label="Bullet List" isActive={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <ToolbarButton icon={ListOrdered} label="Ordered List" isActive={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <ToolbarButton icon={Quote} label="Blockquote" isActive={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
        <ToolbarButton icon={Code} label="Code Block" isActive={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
        <Sep />
        <ImageUploadButton editor={editor} notebookId={notebookId} pageId={pageId} />
        {onToggleDrawing && (
          <ToolbarButton icon={PenTool} label="Draw" isActive={isDrawing} onClick={onToggleDrawing} />
        )}
        <Sep />
        <ToolbarButton icon={Undo} label="Undo (Cmd+Z)" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} />
        <ToolbarButton icon={Redo} label="Redo (Cmd+Shift+Z)" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} />
      </div>
    </div>
  );
}
