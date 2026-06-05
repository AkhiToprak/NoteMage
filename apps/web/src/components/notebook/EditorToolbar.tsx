'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Editor } from '@tiptap/react';
import { insertCodeBlock } from '@/lib/tiptap-code-block';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useNotebookWorkspace } from './NotebookWorkspaceContext';

import type { EditorMode, ActiveTool, LineStyle, RulerState, TextData } from './DrawingOverlay';

const CALLOUT_ICONS: Record<string, string> = {
  Info: 'info',
  AlertTriangle: 'warning',
  CheckCircle: 'check_circle',
  Lightbulb: 'lightbulb',
};
import { CALLOUT_STYLES, type CalloutType } from '@/lib/tiptap-callout';

import ImageUploadButton from './ImageUploadButton';
import PageAppendPdfButton from './PageAppendPdfButton';
import GenerateDropdown from './GenerateDropdown';

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
  '#ede9ff',
  '#ffffff',
  '#000000',
  '#fca5a5',
  '#f87171',
  '#fdba74',
  '#fde047',
  '#86efac',
  '#4ade80',
  '#7dd3fc',
  '#38bdf8',
  '#c4b5fd',
  '#a78bfa',
  '#f9a8d4',
  '#fb7185',
  '#64748b',
];

const HIGHLIGHT_COLORS = [
  'rgba(140,82,255,0.30)',
  'rgba(81,112,255,0.30)',
  'rgba(239,68,68,0.25)',
  'rgba(249,115,22,0.25)',
  'rgba(234,179,8,0.30)',
  'rgba(34,197,94,0.25)',
  'rgba(14,165,233,0.25)',
  'rgba(236,72,153,0.25)',
  'rgba(168,85,247,0.25)',
  'rgba(20,184,166,0.25)',
  'rgba(245,158,11,0.30)',
  'rgba(99,102,241,0.30)',
  'rgba(239,68,68,0.15)',
  'rgba(34,197,94,0.15)',
  'rgba(14,165,233,0.15)',
  'rgba(255,255,255,0.10)',
];

/* ── inline heading scale levels ── */
const INLINE_SCALE_LEVELS = [
  { level: 1, label: 'H1 Scale', size: '30px' },
  { level: 2, label: 'H2 Scale', size: '22px' },
  { level: 3, label: 'H3 Scale', size: '18px' },
];

/* ── pen drawing constants ── */
const PEN_COLORS = ['#ede9ff', '#000000', '#8c52ff', '#5170ff', '#ef4444', '#22c55e', '#eab308'];

const PEN_WIDTHS = [
  { label: 'Thin', value: 2 },
  { label: 'Medium', value: 4 },
  { label: 'Thick', value: 8 },
];

const LINE_STYLES: { label: string; value: LineStyle; dasharray?: string }[] = [
  { label: 'Solid', value: 'solid' },
  { label: 'Dashed', value: 'dashed', dasharray: '12 6' },
  { label: 'Dotted', value: 'dotted', dasharray: '2 6' },
];

interface EditorToolbarProps {
  editor: Editor | null;
  notebookId: string;
  sectionId: string;
  pageId: string;
  editorMode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  penColor: string;
  onPenColorChange: (c: string) => void;
  penWidth: number;
  onPenWidthChange: (w: number) => void;
  lineStyle: LineStyle;
  onLineStyleChange: (s: LineStyle) => void;
  activeTool: ActiveTool;
  onActiveToolChange: (t: ActiveTool) => void;
  ruler: RulerState;
  onRulerToggle: () => void;
  onClearDrawing: () => void;
  /** Currently-selected overlay text annotation (if any). When present,
   *  the toolbar's font/size/color/bold controls target it instead of
   *  the editor selection. */
  selectedTextAnnotation?: TextData | null;
  /** Apply a partial update to the selected overlay annotation. Returns
   *  true if the update was applied (i.e. there was something to target),
   *  false if the caller should fall through to editor behaviour. */
  onAnnotationUpdate?: (updates: Partial<TextData>) => boolean;
  /** Default style for newly-created text annotations. Toolbar controls
   *  write to this while in text mode with no annotation selected so the
   *  next-created text picks up the chosen color/font/size/etc. */
  textDefaults?: {
    color: string;
    fontSize: number;
    fontFamily?: string;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strike: boolean;
  };
  onTextDefaultsUpdate?: (
    updates: Partial<{
      color: string;
      fontSize: number;
      fontFamily?: string;
      bold: boolean;
      italic: boolean;
      underline: boolean;
      strike: boolean;
    }>
  ) => void;
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
    [editor]
  );

  return withSelection;
}

/* ── single toolbar button ── */
function ToolbarButton({
  icon,
  label,
  isActive,
  onClick,
  disabled,
}: {
  icon: string;
  label: string;
  isActive?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      disabled={disabled}
      title={label}
      style={{
        width: '30px',
        height: '28px',
        borderRadius: '6px',
        border: 'none',
        background: isActive ? 'rgba(140,82,255,0.22)' : 'transparent',
        color: isActive ? 'var(--md-h4)' : 'var(--ink-50)',
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
          e.currentTarget.style.background = 'var(--ink-08)';
          e.currentTarget.style.color = 'var(--ink-80)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--ink-50)';
        }
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>
        {icon}
      </span>
    </button>
  );
}

/* ── separator ── */
function Sep() {
  return (
    <div
      style={{
        width: '1px',
        height: '18px',
        background: 'var(--ink-08)',
        // Wider gutter than the intra-group button spacing so the clusters
        // (format / block / insert / mode) read as distinct groups (item 7a).
        margin: '0 6px',
        flexShrink: 0,
      }}
    />
  );
}

/* ── mode segmented control (cursor / pen / text) ──
   Rendered as a recessed segmented track — distinct from the accent-filled
   format toggles — so a persistent mode selection reads as a *mode*, not a hot
   format. The active segment is a quiet raised neutral chip, so the always-on
   default (cursor) no longer looks "pressed" like an active format (item 7b). */
const MODE_OPTIONS: { mode: EditorMode; icon: string; label: string }[] = [
  { mode: 'cursor', icon: 'arrow_selector_tool', label: 'Cursor mode' },
  { mode: 'pen', icon: 'draw', label: 'Pen mode' },
  { mode: 'text', icon: 'text_fields', label: 'Text mode' },
];

function ModeSwitch({
  mode,
  onModeChange,
}: {
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Editor mode"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        padding: 2,
        borderRadius: 8,
        background: 'var(--ink-04)',
        flexShrink: 0,
      }}
    >
      {MODE_OPTIONS.map(({ mode: m, icon, label }) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onMouseDown={(e) => {
              e.preventDefault();
              onModeChange(m);
            }}
            style={{
              width: 28,
              height: 24,
              borderRadius: 6,
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              background: active ? 'var(--surface-container-highest)' : 'transparent',
              color: active ? 'var(--on-surface)' : 'var(--ink-50)',
              boxShadow: active
                ? '0 1px 2px rgba(0,0,0,0.25), inset 0 1px 0 var(--ink-08)'
                : 'none',
              transition: 'background 0.15s, color 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.color = 'var(--ink-80)';
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.color = 'var(--ink-50)';
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>
              {icon}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── color picker grid dropdown ── */
function ColorPicker({
  colors,
  activeColor,
  onPick,
  icon,
  label,
}: {
  colors: string[];
  activeColor: string | undefined;
  onPick: (c: string) => void;
  icon: string;
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
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((p) => !p);
        }}
        title={label}
        style={{
          width: '30px',
          height: '28px',
          borderRadius: '6px',
          border: 'none',
          background: !!activeColor ? 'rgba(140,82,255,0.22)' : 'transparent',
          color: !!activeColor ? 'var(--md-h4)' : 'var(--ink-50)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'background 0.1s, color 0.1s',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          if (!activeColor) {
            e.currentTarget.style.background = 'var(--ink-08)';
            e.currentTarget.style.color = 'var(--ink-80)';
          }
        }}
        onMouseLeave={(e) => {
          if (!activeColor) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--ink-50)';
          }
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>
          {icon}
        </span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--surface-container-low)',
            border: '1px solid rgba(174,137,255,0.40)',
            borderRadius: '10px',
            padding: '10px',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '5px',
            zIndex: 100,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            width: '128px',
          }}
        >
          {colors.map((c) => (
            <button
              key={c}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(c);
                setOpen(false);
              }}
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                background: c,
                border: activeColor === c ? '2px solid var(--md-h4)' : '1px solid var(--ink-12)',
                cursor: 'pointer',
                transition: 'transform 0.1s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.18)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
              title={c}
            />
          ))}
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              onPick('');
              setOpen(false);
            }}
            style={{
              gridColumn: '1 / -1',
              height: '22px',
              borderRadius: '6px',
              background: 'var(--ink-04)',
              border: '1px solid var(--ink-12)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '10px',
              color: 'var(--ink-40)',
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
function FontFamilySelect({
  editor,
  withSelection,
  selectedTextAnnotation,
  onAnnotationUpdate,
  textDefaultsActive,
  textDefaults,
  onTextDefaultsUpdate,
}: {
  editor: Editor;
  withSelection: ReturnType<typeof useSelectionGuard>;
  selectedTextAnnotation?: TextData | null;
  onAnnotationUpdate?: (updates: Partial<TextData>) => boolean;
  textDefaultsActive?: boolean;
  textDefaults?: { fontFamily?: string };
  onTextDefaultsUpdate?: (updates: { fontFamily?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = (() => {
    const fam = selectedTextAnnotation
      ? selectedTextAnnotation.fontFamily
      : textDefaultsActive
        ? textDefaults?.fontFamily
        : (editor.getAttributes('textStyle').fontFamily as string | undefined);
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
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((p) => !p);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          height: '28px',
          padding: '0 8px',
          borderRadius: '6px',
          border: '1px solid var(--ink-12)',
          background: open ? 'rgba(140,82,255,0.12)' : 'var(--ink-04)',
          color: 'var(--ink-70)',
          fontFamily: 'inherit',
          fontSize: '12px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          minWidth: '84px',
          transition: 'background 0.1s',
        }}
      >
        <span style={{ flex: 1, textAlign: 'left' }}>{current}</span>
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 11, flexShrink: 0, opacity: 0.5 }}
          aria-hidden
        >
          expand_more
        </span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            background: 'var(--surface-container-low)',
            border: '1px solid rgba(174,137,255,0.40)',
            borderRadius: '8px',
            padding: '4px',
            zIndex: 100,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            minWidth: '140px',
          }}
        >
          {FONT_FAMILIES.map((f) => (
            <button
              key={f.value}
              onMouseDown={(e) => {
                e.preventDefault();
                if (selectedTextAnnotation && onAnnotationUpdate) {
                  onAnnotationUpdate({ fontFamily: f.value || undefined });
                } else if (textDefaultsActive && onTextDefaultsUpdate) {
                  onTextDefaultsUpdate({ fontFamily: f.value || undefined });
                } else {
                  withSelection((chain) => {
                    if (f.value) chain.setFontFamily(f.value).run();
                    else chain.unsetFontFamily().run();
                  });
                }
                setOpen(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '6px 10px',
                borderRadius: '6px',
                border: 'none',
                background: current === f.label ? 'rgba(140,82,255,0.18)' : 'transparent',
                color: current === f.label ? 'var(--md-h4)' : 'var(--ink-70)',
                fontFamily: f.value || 'inherit',
                fontSize: '13px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--ink-08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  current === f.label ? 'rgba(140,82,255,0.18)' : 'transparent';
              }}
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
function FontSizeControl({
  editor,
  withSelection,
  selectedTextAnnotation,
  onAnnotationUpdate,
  textDefaultsActive,
  textDefaults,
  onTextDefaultsUpdate,
}: {
  editor: Editor;
  withSelection: ReturnType<typeof useSelectionGuard>;
  selectedTextAnnotation?: TextData | null;
  onAnnotationUpdate?: (updates: Partial<TextData>) => boolean;
  textDefaultsActive?: boolean;
  textDefaults?: { fontSize: number };
  onTextDefaultsUpdate?: (updates: { fontSize: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentSize = (() => {
    if (selectedTextAnnotation) return String(selectedTextAnnotation.fontSize);
    if (textDefaultsActive && textDefaults) return String(textDefaults.fontSize);
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
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((p) => !p);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '3px',
          height: '28px',
          padding: '0 7px',
          borderRadius: '6px',
          border: '1px solid var(--ink-12)',
          background: open ? 'rgba(140,82,255,0.12)' : 'var(--ink-04)',
          color: 'var(--ink-70)',
          fontFamily: 'inherit',
          fontSize: '12px',
          cursor: 'pointer',
          minWidth: '52px',
          transition: 'background 0.1s',
        }}
      >
        <span style={{ flex: 1, textAlign: 'left' }}>{currentSize}px</span>
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 10, flexShrink: 0, opacity: 0.5 }}
          aria-hidden
        >
          expand_more
        </span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            background: 'var(--surface-container-low)',
            border: '1px solid rgba(174,137,255,0.40)',
            borderRadius: '8px',
            padding: '4px',
            zIndex: 100,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            minWidth: '80px',
          }}
        >
          {FONT_SIZES.map((s) => (
            <button
              key={s}
              onMouseDown={(e) => {
                e.preventDefault();
                const n = parseInt(s, 10);
                if (selectedTextAnnotation && onAnnotationUpdate) {
                  if (!isNaN(n)) onAnnotationUpdate({ fontSize: n });
                } else if (textDefaultsActive && onTextDefaultsUpdate) {
                  if (!isNaN(n)) onTextDefaultsUpdate({ fontSize: n });
                } else {
                  withSelection((chain) => {
                    if (!s) chain.unsetFontSize().run();
                    else chain.setFontSize(`${s}px`).run();
                  });
                }
                setOpen(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '5px 10px',
                borderRadius: '5px',
                border: 'none',
                background: currentSize === s ? 'rgba(140,82,255,0.18)' : 'transparent',
                color: currentSize === s ? 'var(--md-h4)' : 'var(--ink-70)',
                fontFamily: 'inherit',
                fontSize: '12px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--ink-08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  currentSize === s ? 'rgba(140,82,255,0.18)' : 'transparent';
              }}
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
function InlineScaleDropdown({
  editor,
  withSelection,
}: {
  editor: Editor;
  withSelection: ReturnType<typeof useSelectionGuard>;
}) {
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
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((p) => !p);
        }}
        title="Inline text scale — make selected text H1/H2/H3 sized without block heading"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '3px',
          height: '28px',
          padding: '0 7px',
          borderRadius: '6px',
          border: '1px solid var(--ink-12)',
          background:
            activeLevel !== null
              ? 'rgba(140,82,255,0.22)'
              : open
                ? 'rgba(140,82,255,0.12)'
                : 'var(--ink-04)',
          color: activeLevel !== null ? 'var(--md-h4)' : 'var(--ink-70)',
          fontFamily: 'inherit',
          fontSize: '12px',
          cursor: 'pointer',
          minWidth: '52px',
          transition: 'background 0.1s, color 0.1s',
        }}
        onMouseEnter={(e) => {
          if (activeLevel === null && !open) {
            e.currentTarget.style.background = 'var(--ink-08)';
          }
        }}
        onMouseLeave={(e) => {
          if (activeLevel === null && !open) {
            e.currentTarget.style.background = 'var(--ink-04)';
          }
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 14, flexShrink: 0 }}
          aria-hidden
        >
          format_size
        </span>
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 10, flexShrink: 0, opacity: 0.5 }}
          aria-hidden
        >
          expand_more
        </span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            background: 'var(--surface-container-low)',
            border: '1px solid rgba(174,137,255,0.40)',
            borderRadius: '8px',
            padding: '4px',
            zIndex: 100,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            minWidth: '120px',
          }}
        >
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
                color: activeLevel === level ? 'var(--md-h4)' : 'var(--ink-70)',
                fontFamily: 'inherit',
                fontSize: '13px',
                fontWeight: level <= 2 ? 700 : 600,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--ink-08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  activeLevel === level ? 'rgba(140,82,255,0.18)' : 'transparent';
              }}
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
              color: 'var(--ink-40)',
              fontFamily: 'inherit',
              fontSize: '11px',
              cursor: 'pointer',
              textAlign: 'left',
              marginTop: '2px',
              borderTop: '1px solid var(--ink-08)',
              paddingTop: '6px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--ink-08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            Reset to normal
          </button>
        </div>
      )}
    </div>
  );
}

/* ── callout dropdown ── */
const CALLOUT_TYPES: CalloutType[] = ['info', 'warning', 'success', 'tip'];

function CalloutDropdown({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isActive = editor.isActive('callout');

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
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((p) => !p);
        }}
        title="Insert callout"
        style={{
          width: '30px',
          height: '28px',
          borderRadius: '6px',
          border: 'none',
          background: isActive ? 'rgba(140,82,255,0.22)' : 'transparent',
          color: isActive ? 'var(--md-h4)' : 'var(--ink-50)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'background 0.1s, color 0.1s',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'var(--ink-08)';
            e.currentTarget.style.color = 'var(--ink-80)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--ink-50)';
          }
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>
          feedback
        </span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            background: 'var(--surface-container-low)',
            border: '1px solid rgba(174,137,255,0.40)',
            borderRadius: '8px',
            padding: '4px',
            zIndex: 100,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            minWidth: '130px',
          }}
        >
          {CALLOUT_TYPES.map((t) => {
            const s = CALLOUT_STYLES[t];
            return (
              <button
                key={t}
                onMouseDown={(e) => {
                  e.preventDefault();
                  editor.chain().focus().toggleCallout({ calloutType: t }).run();
                  setOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--ink-70)',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--ink-08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', color: s.borderColor }}>
                  {(() => {
                    const name = CALLOUT_ICONS[s.icon];
                    return name ? (
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: 14 }}
                        aria-hidden
                      >
                        {name}
                      </span>
                    ) : null;
                  })()}
                </span>
                <span>{s.label}</span>
                <span
                  style={{
                    marginLeft: 'auto',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: s.borderColor,
                  }}
                />
              </button>
            );
          })}
          {isActive && (
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                editor.chain().focus().unsetCallout().run();
                setOpen(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                padding: '5px 10px',
                borderRadius: '5px',
                border: 'none',
                background: 'transparent',
                color: 'var(--ink-40)',
                fontFamily: 'inherit',
                fontSize: '11px',
                cursor: 'pointer',
                textAlign: 'left',
                marginTop: '2px',
                borderTop: '1px solid var(--ink-08)',
                paddingTop: '6px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--ink-08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              Remove callout
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── table grid picker ── */
function TableGridPicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [hoverCell, setHoverCell] = useState<{ row: number; col: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const isActive = editor.isActive('table');

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const GRID = 6;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((p) => !p);
        }}
        title="Insert table"
        style={{
          width: '30px',
          height: '28px',
          borderRadius: '6px',
          border: 'none',
          background: isActive ? 'rgba(140,82,255,0.22)' : 'transparent',
          color: isActive ? 'var(--md-h4)' : 'var(--ink-50)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'background 0.1s, color 0.1s',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'var(--ink-08)';
            e.currentTarget.style.color = 'var(--ink-80)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--ink-50)';
          }
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>
          table
        </span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            background: 'var(--surface-container-low)',
            border: '1px solid rgba(174,137,255,0.40)',
            borderRadius: '8px',
            padding: '8px',
            zIndex: 100,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
          onMouseLeave={() => setHoverCell(null)}
        >
          <div
            style={{ display: 'grid', gridTemplateColumns: `repeat(${GRID}, 20px)`, gap: '2px' }}
          >
            {Array.from({ length: GRID * GRID }, (_, i) => {
              const row = Math.floor(i / GRID) + 1;
              const col = (i % GRID) + 1;
              const highlighted = hoverCell ? row <= hoverCell.row && col <= hoverCell.col : false;
              return (
                <div
                  key={i}
                  onMouseEnter={() => setHoverCell({ row, col })}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    editor
                      .chain()
                      .focus()
                      .insertTable({ rows: row, cols: col, withHeaderRow: true })
                      .run();
                    setOpen(false);
                    setHoverCell(null);
                  }}
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '3px',
                    border: `1px solid ${highlighted ? 'rgba(140,82,255,0.5)' : 'rgba(140,82,255,0.15)'}`,
                    background: highlighted ? 'rgba(140,82,255,0.25)' : 'rgba(140,82,255,0.04)',
                    cursor: 'pointer',
                    transition: 'background 0.05s, border-color 0.05s',
                  }}
                />
              );
            })}
          </div>
          <div
            style={{
              textAlign: 'center',
              marginTop: '4px',
              fontSize: '11px',
              color: 'var(--ink-50)',
              fontFamily: 'inherit',
            }}
          >
            {hoverCell ? `${hoverCell.col} × ${hoverCell.row}` : 'Select size'}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── table context buttons ── */
function TableContextButtons({ editor }: { editor: Editor }) {
  if (!editor.isActive('table')) return null;

  return (
    <>
      <Sep />
      <ToolbarButton
        icon="view_day"
        label="Toggle header row"
        isActive={false}
        onClick={() => editor.chain().focus().toggleHeaderRow().run()}
      />
      <ToolbarButton
        icon="table_rows"
        label="Add row after"
        isActive={false}
        onClick={() => editor.chain().focus().addRowAfter().run()}
      />
      <ToolbarButton
        icon="view_column"
        label="Add column after"
        isActive={false}
        onClick={() => editor.chain().focus().addColumnAfter().run()}
      />
      <ToolbarButton
        icon="cell_merge"
        label="Merge/split cells"
        isActive={false}
        onClick={() => editor.chain().focus().mergeOrSplit().run()}
      />
      <ToolbarButton
        icon="delete"
        label="Delete table"
        isActive={false}
        onClick={() => editor.chain().focus().deleteTable().run()}
      />
    </>
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

/* ── line style dropdown ── */
function LineStylePicker({
  value,
  onChange,
}: {
  value: LineStyle;
  onChange: (s: LineStyle) => void;
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

  const current = LINE_STYLES.find((l) => l.value === value) ?? LINE_STYLES[0];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((p) => !p);
        }}
        title="Line Style"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          height: '28px',
          padding: '0 8px',
          borderRadius: '6px',
          border: '1px solid var(--ink-12)',
          background: open ? 'rgba(140,82,255,0.12)' : 'var(--ink-04)',
          color: 'var(--ink-70)',
          fontFamily: 'inherit',
          fontSize: '11px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: 'background 0.1s',
        }}
      >
        <svg width="28" height="12" viewBox="0 0 28 12">
          <line
            x1="2"
            y1="6"
            x2="26"
            y2="6"
            stroke="var(--ink-70)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={current.dasharray ?? 'none'}
          />
        </svg>
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 10, flexShrink: 0, opacity: 0.5 }}
          aria-hidden
        >
          expand_more
        </span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            background: 'var(--surface-container-low)',
            border: '1px solid rgba(174,137,255,0.40)',
            borderRadius: '8px',
            padding: '4px',
            zIndex: 100,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            minWidth: '110px',
          }}
        >
          {LINE_STYLES.map((ls) => (
            <button
              key={ls.value}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(ls.value);
                setOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '6px 10px',
                borderRadius: '6px',
                border: 'none',
                background: value === ls.value ? 'rgba(140,82,255,0.18)' : 'transparent',
                color: value === ls.value ? 'var(--md-h4)' : 'var(--ink-70)',
                fontFamily: 'inherit',
                fontSize: '12px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--ink-08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  value === ls.value ? 'rgba(140,82,255,0.18)' : 'transparent';
              }}
            >
              <svg width="32" height="10" viewBox="0 0 32 10">
                <line
                  x1="2"
                  y1="5"
                  x2="30"
                  y2="5"
                  stroke={value === ls.value ? 'var(--md-h4)' : 'var(--ink-60)'}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray={ls.dasharray ?? 'none'}
                />
              </svg>
              <span>{ls.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── page actions menu (delete etc.) ── */
function PageActionsMenu({ notebookId, pageId }: { notebookId: string; pageId: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { refreshSections, setExportDialogOpen } = useNotebookWorkspace();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleDelete = async () => {
    if (!window.confirm('Delete this page? This cannot be undone.')) return;
    try {
      await fetch(`/api/notebooks/${notebookId}/pages/${pageId}`, { method: 'DELETE' });
      refreshSections();
      router.push(`/notebooks/${notebookId}`);
    } catch {
      /* silent */
    }
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: 'relative', marginLeft: 'auto' }}>
      <button
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((p) => !p);
        }}
        title="Page actions"
        style={{
          width: 30,
          height: 28,
          borderRadius: 6,
          border: 'none',
          background: open ? 'rgba(140,82,255,0.22)' : 'transparent',
          color: open ? 'var(--md-h4)' : 'var(--ink-50)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'background 0.1s, color 0.1s',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>
          more_horiz
        </span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            background: 'var(--surface-container-low)',
            border: '1px solid rgba(174,137,255,0.40)',
            borderRadius: 10,
            padding: '4px',
            zIndex: 100,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            minWidth: 160,
          }}
        >
          {/* Export — surfaces the same ExportDialog as the sidebar footer,
              so PDF/PPTX export is discoverable from the page itself (item 16). */}
          <button
            onClick={() => {
              setExportDialogOpen(true);
              setOpen(false);
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: 'var(--on-surface)',
              fontSize: 13,
              fontFamily: 'inherit',
              cursor: 'pointer',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--ink-08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>
              ios_share
            </span>
            Export
          </button>
          <button
            onClick={handleDelete}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: 'var(--error)',
              fontSize: 13,
              fontFamily: 'inherit',
              cursor: 'pointer',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(252,165,165,0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>
              delete
            </span>
            Delete page
          </button>
        </div>
      )}
    </div>
  );
}

/* ── main toolbar ── */
export default function EditorToolbar({
  editor,
  notebookId,
  sectionId,
  pageId,
  editorMode,
  onModeChange,
  penColor,
  onPenColorChange,
  penWidth,
  onPenWidthChange,
  lineStyle,
  onLineStyleChange,
  activeTool,
  onActiveToolChange,
  ruler,
  onRulerToggle,
  onClearDrawing,
  selectedTextAnnotation,
  onAnnotationUpdate,
  textDefaults,
  onTextDefaultsUpdate,
}: EditorToolbarProps) {
  // Active when the user is in text mode without an annotation selected —
  // toolbar controls should target textDefaults so the user's chosen
  // style is applied to the NEXT-created text.
  const textDefaultsActive = editorMode === 'text' && !selectedTextAnnotation;
  const [, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);
  const withSelection = useSelectionGuard(editor);
  const { isPhone, isPhoneOrTablet } = useBreakpoint();

  // Phones AND tablets get horizontally-scrollable toolbar rows — the full
  // button set is far wider than either viewport, so without this the trailing
  // tools clipped off the right edge. Tighter padding only on phones.
  const responsiveRowStyle: React.CSSProperties = {
    ...ROW_STYLE,
    ...(isPhoneOrTablet
      ? {
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: isPhone ? '4px 8px' : '4px 12px',
          gap: '2px',
          scrollbarWidth: 'none',
        }
      : {}),
  };

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
    <div
      style={{
        background: 'var(--surface)',
        borderBottom: '1px solid rgba(174,137,255,0.20)',
        position: 'sticky',
        top: 0,
        zIndex: 200,
        minWidth: 0,
      }}
    >
      {isPhoneOrTablet && (
        <style>{`.editor-toolbar-row::-webkit-scrollbar { display: none; }`}</style>
      )}

      {/* Row 1: Font controls + inline formatting */}
      <div
        className={isPhoneOrTablet ? 'editor-toolbar-row' : undefined}
        style={{
          ...responsiveRowStyle,
          borderBottom: '1px solid var(--ink-08)',
          gap: '4px',
        }}
      >
        <FontFamilySelect
          editor={editor}
          withSelection={withSelection}
          selectedTextAnnotation={selectedTextAnnotation}
          onAnnotationUpdate={onAnnotationUpdate}
          textDefaultsActive={textDefaultsActive}
          textDefaults={textDefaults}
          onTextDefaultsUpdate={onTextDefaultsUpdate}
        />
        <FontSizeControl
          editor={editor}
          withSelection={withSelection}
          selectedTextAnnotation={selectedTextAnnotation}
          onAnnotationUpdate={onAnnotationUpdate}
          textDefaultsActive={textDefaultsActive}
          textDefaults={textDefaults}
          onTextDefaultsUpdate={onTextDefaultsUpdate}
        />
        <Sep />
        <ToolbarButton
          icon="format_bold"
          label="Bold (Cmd+B)"
          isActive={
            selectedTextAnnotation
              ? !!selectedTextAnnotation.bold
              : textDefaultsActive
                ? !!textDefaults?.bold
                : editor.isActive('bold')
          }
          onClick={() => {
            if (selectedTextAnnotation && onAnnotationUpdate) {
              onAnnotationUpdate({ bold: !selectedTextAnnotation.bold });
              return;
            }
            if (textDefaultsActive && onTextDefaultsUpdate) {
              onTextDefaultsUpdate({ bold: !textDefaults?.bold });
              return;
            }
            withSelection((c) => c.toggleBold().run());
          }}
        />
        <ToolbarButton
          icon="format_italic"
          label="Italic (Cmd+I)"
          isActive={
            selectedTextAnnotation
              ? !!selectedTextAnnotation.italic
              : textDefaultsActive
                ? !!textDefaults?.italic
                : editor.isActive('italic')
          }
          onClick={() => {
            if (selectedTextAnnotation && onAnnotationUpdate) {
              onAnnotationUpdate({ italic: !selectedTextAnnotation.italic });
              return;
            }
            if (textDefaultsActive && onTextDefaultsUpdate) {
              onTextDefaultsUpdate({ italic: !textDefaults?.italic });
              return;
            }
            withSelection((c) => c.toggleItalic().run());
          }}
        />
        <ToolbarButton
          icon="format_underlined"
          label="Underline (Cmd+U)"
          isActive={
            selectedTextAnnotation
              ? !!selectedTextAnnotation.underline
              : textDefaultsActive
                ? !!textDefaults?.underline
                : editor.isActive('underline')
          }
          onClick={() => {
            if (selectedTextAnnotation && onAnnotationUpdate) {
              onAnnotationUpdate({ underline: !selectedTextAnnotation.underline });
              return;
            }
            if (textDefaultsActive && onTextDefaultsUpdate) {
              onTextDefaultsUpdate({ underline: !textDefaults?.underline });
              return;
            }
            withSelection((c) => c.toggleUnderline().run());
          }}
        />
        <ToolbarButton
          icon="format_strikethrough"
          label="Strikethrough"
          isActive={
            selectedTextAnnotation
              ? !!selectedTextAnnotation.strike
              : textDefaultsActive
                ? !!textDefaults?.strike
                : editor.isActive('strike')
          }
          onClick={() => {
            if (selectedTextAnnotation && onAnnotationUpdate) {
              onAnnotationUpdate({ strike: !selectedTextAnnotation.strike });
              return;
            }
            if (textDefaultsActive && onTextDefaultsUpdate) {
              onTextDefaultsUpdate({ strike: !textDefaults?.strike });
              return;
            }
            withSelection((c) => c.toggleStrike().run());
          }}
        />
        <Sep />
        <ColorPicker
          icon="palette"
          label="Text Color"
          colors={TEXT_COLORS}
          activeColor={
            selectedTextAnnotation
              ? selectedTextAnnotation.color
              : textDefaultsActive
                ? textDefaults?.color
                : (editor.getAttributes('textStyle').color as string | undefined)
          }
          onPick={(c) => {
            if (selectedTextAnnotation && onAnnotationUpdate) {
              if (c) onAnnotationUpdate({ color: c });
              return;
            }
            if (textDefaultsActive && onTextDefaultsUpdate) {
              if (c) onTextDefaultsUpdate({ color: c });
              return;
            }
            withSelection((chain) => {
              if (c) chain.setColor(c).run();
              else chain.unsetColor().run();
            });
          }}
        />
        <ColorPicker
          icon="ink_highlighter"
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
      <div
        className={isPhoneOrTablet ? 'editor-toolbar-row' : undefined}
        style={responsiveRowStyle}
      >
        <ToolbarButton
          icon="format_h1"
          label="Heading 1"
          isActive={editor.isActive('toggleHeading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleToggleHeading({ level: 1 }).run()}
        />
        <ToolbarButton
          icon="format_h2"
          label="Heading 2"
          isActive={editor.isActive('toggleHeading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleToggleHeading({ level: 2 }).run()}
        />
        <ToolbarButton
          icon="format_h3"
          label="Heading 3"
          isActive={editor.isActive('toggleHeading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleToggleHeading({ level: 3 }).run()}
        />
        <Sep />
        <ToolbarButton
          icon="format_list_bulleted"
          label="Bullet List"
          isActive={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          icon="format_list_numbered"
          label="Ordered List"
          isActive={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          icon="format_quote"
          label="Blockquote"
          isActive={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />
        <ToolbarButton
          icon="code"
          label="Code Block"
          isActive={editor.isActive('codeBlock')}
          onClick={() => insertCodeBlock(editor)}
        />
        <CalloutDropdown editor={editor} />
        <TableGridPicker editor={editor} />
        <TableContextButtons editor={editor} />

        <Sep />
        <ImageUploadButton
          editor={editor}
          notebookId={notebookId}
          sectionId={sectionId}
          pageId={pageId}
        />
        <PageAppendPdfButton
          editor={editor}
          notebookId={notebookId}
          sectionId={sectionId}
          pageId={pageId}
        />
        <GenerateDropdown notebookId={notebookId} pageId={pageId} />
        <Sep />
        {/* Cursor / Pen / Text mode — a segmented control, not format toggles */}
        <ModeSwitch mode={editorMode} onModeChange={onModeChange} />
        <Sep />
        <ToolbarButton
          icon="undo"
          label="Undo (Cmd+Z)"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        />
        <ToolbarButton
          icon="redo"
          label="Redo (Cmd+Shift+Z)"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        />
        <PageActionsMenu notebookId={notebookId} pageId={pageId} />
      </div>

      {/* Row 3: Pen settings (visible only in pen mode) */}
      {editorMode === 'pen' && (
        <div
          className={isPhoneOrTablet ? 'editor-toolbar-row' : undefined}
          style={{
            ...responsiveRowStyle,
            borderTop: '1px solid var(--ink-08)',
            gap: '6px',
          }}
        >
          {/* Pen / Eraser sub-tool */}
          <ToolbarButton
            icon="draw"
            label="Pen"
            isActive={activeTool === 'pen'}
            onClick={() => onActiveToolChange('pen')}
          />
          <ToolbarButton
            icon="ink_eraser"
            label="Eraser"
            isActive={activeTool === 'eraser'}
            onClick={() => onActiveToolChange('eraser')}
          />

          <Sep />

          {/* Color swatches */}
          {PEN_COLORS.map((color) => (
            <button
              key={color}
              onMouseDown={(e) => {
                e.preventDefault();
                onPenColorChange(color);
                onActiveToolChange('pen');
              }}
              title={color}
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                border:
                  penColor === color && activeTool === 'pen'
                    ? '2px solid var(--on-surface)'
                    : '2px solid transparent',
                background: color,
                cursor: 'pointer',
                padding: 0,
                outline: 'none',
                boxShadow:
                  penColor === color && activeTool === 'pen'
                    ? '0 0 0 2px rgba(140,82,255,0.4)'
                    : 'none',
                transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
                flexShrink: 0,
              }}
            />
          ))}

          <Sep />

          {/* Width presets */}
          {PEN_WIDTHS.map((w) => (
            <button
              key={w.value}
              onMouseDown={(e) => {
                e.preventDefault();
                onPenWidthChange(w.value);
              }}
              title={`${w.label} (${w.value}px)`}
              style={{
                height: 28,
                borderRadius: 6,
                border: 'none',
                background: penWidth === w.value ? 'rgba(140,82,255,0.2)' : 'transparent',
                color: 'var(--on-surface)',
                cursor: 'pointer',
                padding: '0 8px',
                fontSize: 11,
                fontFamily: 'inherit',
                fontWeight: 500,
                transition: 'background 0.15s ease',
                flexShrink: 0,
              }}
            >
              {w.label}
            </button>
          ))}

          <Sep />

          {/* Line style */}
          <LineStylePicker value={lineStyle} onChange={onLineStyleChange} />

          <Sep />

          {/* Ruler toggle */}
          <ToolbarButton
            icon="straighten"
            label="Ruler"
            isActive={ruler.active}
            onClick={onRulerToggle}
          />

          {/* Clear all drawings */}
          <ToolbarButton icon="delete" label="Clear All Drawings" onClick={onClearDrawing} />
        </div>
      )}
    </div>
  );
}
