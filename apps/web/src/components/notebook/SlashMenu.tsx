'use client';

import {
  CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Editor } from '@tiptap/react';
import type { SlashCommandState } from '@/lib/tiptap-slash-command';

/**
 * Slash menu popup component.
 *
 * Receives the live state from `tiptap-slash-command` via the `state` prop,
 * filters the menu items by the current query, and renders an absolute-
 * positioned popup near the slash. Keyboard nav (Up/Down/Enter/Esc) is
 * captured at the document level so it works while the editor still has
 * focus.
 *
 * Item commands always start with `editor.chain().focus().deleteRange(range)`
 * to remove the typed `/<query>` before applying the chosen block. The host
 * (PageEditor) is responsible for passing a stable `editor` ref so commands
 * stay correct across re-renders.
 */

interface MenuItem {
  id: string;
  label: string;
  description: string;
  icon: string; // Material Symbols name
  group: string;
  keywords: string[];
  /** Run the chosen command. The range is the slash + query that should be deleted first. */
  run: (editor: Editor, range: { from: number; to: number }) => void;
}

const ITEMS: MenuItem[] = [
  // ── Basic blocks ──────────────────────────────────────────
  {
    id: 'paragraph',
    label: 'Text',
    description: 'Plain paragraph',
    icon: 'notes',
    group: 'Basic',
    keywords: ['text', 'paragraph', 'p', 'plain'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    id: 'h1',
    label: 'Heading 1',
    description: 'Big section title',
    icon: 'format_h1',
    group: 'Basic',
    keywords: ['heading', 'h1', 'title', 'big', 'large'],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setToggleHeading({ level: 1 }).run(),
  },
  {
    id: 'h2',
    label: 'Heading 2',
    description: 'Subsection title',
    icon: 'format_h2',
    group: 'Basic',
    keywords: ['heading', 'h2', 'subtitle', 'medium'],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setToggleHeading({ level: 2 }).run(),
  },
  {
    id: 'h3',
    label: 'Heading 3',
    description: 'Smaller heading',
    icon: 'format_h3',
    group: 'Basic',
    keywords: ['heading', 'h3', 'small'],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setToggleHeading({ level: 3 }).run(),
  },
  {
    id: 'bullet-list',
    label: 'Bullet list',
    description: 'Bulleted points',
    icon: 'format_list_bulleted',
    group: 'Lists',
    keywords: ['bullet', 'list', 'unordered', 'ul'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    id: 'ordered-list',
    label: 'Numbered list',
    description: '1, 2, 3 list',
    icon: 'format_list_numbered',
    group: 'Lists',
    keywords: ['number', 'numbered', 'ordered', 'list', 'ol'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  // ── Blocks ────────────────────────────────────────────────
  {
    id: 'blockquote',
    label: 'Quote',
    description: 'Highlight a quotation',
    icon: 'format_quote',
    group: 'Blocks',
    keywords: ['quote', 'blockquote', 'citation'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    id: 'codeblock',
    label: 'Code block',
    description: 'Syntax-highlighted code',
    icon: 'code',
    group: 'Blocks',
    keywords: ['code', 'codeblock', 'snippet', 'pre'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    id: 'hr',
    label: 'Divider',
    description: 'Horizontal line',
    icon: 'horizontal_rule',
    group: 'Blocks',
    keywords: ['divider', 'hr', 'line', 'separator', 'rule'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    id: 'table',
    label: 'Table',
    description: '3×3 table with header',
    icon: 'table_chart',
    group: 'Blocks',
    keywords: ['table', 'grid', 'rows', 'columns'],
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  // ── Callouts ──────────────────────────────────────────────
  {
    id: 'callout-info',
    label: 'Info callout',
    description: 'Blue info banner',
    icon: 'info',
    group: 'Callouts',
    keywords: ['callout', 'info', 'note', 'blue'],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setCallout({ calloutType: 'info' }).run(),
  },
  {
    id: 'callout-warning',
    label: 'Warning callout',
    description: 'Orange warning banner',
    icon: 'warning',
    group: 'Callouts',
    keywords: ['callout', 'warning', 'caution', 'orange'],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setCallout({ calloutType: 'warning' }).run(),
  },
  {
    id: 'callout-success',
    label: 'Success callout',
    description: 'Green success banner',
    icon: 'check_circle',
    group: 'Callouts',
    keywords: ['callout', 'success', 'done', 'green'],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setCallout({ calloutType: 'success' }).run(),
  },
  {
    id: 'callout-tip',
    label: 'Tip callout',
    description: 'Purple tip banner',
    icon: 'lightbulb',
    group: 'Callouts',
    keywords: ['callout', 'tip', 'hint', 'purple'],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setCallout({ calloutType: 'tip' }).run(),
  },
];

interface SlashMenuProps {
  state: SlashCommandState;
  editor: Editor | null;
}

export default function SlashMenu({ state, editor }: SlashMenuProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissedQuery, setDismissedQuery] = useState<string | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const itemsRef = useRef<Array<HTMLButtonElement | null>>([]);

  const filtered = useMemo(() => {
    const q = state.query.toLowerCase();
    if (!q) return ITEMS;
    return ITEMS.filter((item) => {
      const label = item.label.toLowerCase();
      if (label.includes(q)) return true;
      return item.keywords.some((k) => k.toLowerCase().includes(q));
    });
  }, [state.query]);

  // Adjusting state during render (React-canonical pattern, replaces two
  // setState-in-effect resets). When the slash query changes (or the menu
  // toggles open), reset the active selection to 0 and clear any stale
  // dismissed-query flag. seenQueryKey is a frozen snapshot of the props
  // we last reacted to, so we only run the resets on actual change.
  const queryKey = `${state.isOpen ? '1' : '0'}::${state.query}`;
  const [seenQueryKey, setSeenQueryKey] = useState(queryKey);
  if (queryKey !== seenQueryKey) {
    setSeenQueryKey(queryKey);
    setActiveIndex(0);
    if (dismissedQuery !== null && dismissedQuery !== state.query) {
      setDismissedQuery(null);
    }
  }

  // Reset cached position synchronously during render when the menu closes
  // — same adjusting-state pattern. The layout effect below only runs the
  // "compute new position from DOM rect" path, never the null reset.
  const [seenIsOpen, setSeenIsOpen] = useState(state.isOpen);
  if (state.isOpen !== seenIsOpen) {
    setSeenIsOpen(state.isOpen);
    if (!state.isOpen && position !== null) setPosition(null);
  }

  // Recompute popup position whenever the slash position changes. Only the
  // success path calls setPosition; failure paths just bail out (the stale
  // value gets cleared by the adjusting-state hook above when isOpen flips).
  useLayoutEffect(() => {
    if (!state.isOpen || !state.clientRect) return;
    const rect = state.clientRect();
    if (!rect) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPosition({ top: rect.bottom + 8, left: rect.left });
  }, [state.isOpen, state.clientRect, state.range?.from, state.range?.to]);

  const isDismissed = dismissedQuery !== null && dismissedQuery === state.query;
  const visible = state.isOpen && !isDismissed && filtered.length > 0 && editor !== null;

  const runItem = useCallback(
    (item: MenuItem) => {
      if (!editor || !state.range) return;
      item.run(editor, state.range);
      setDismissedQuery(null);
    },
    [editor, state.range]
  );

  // Document-level keyboard handler so we can intercept arrow/enter while
  // the editor still has focus. Capture phase so it runs before TipTap.
  useEffect(() => {
    if (!visible) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const item = filtered[activeIndex];
        if (item) runItem(item);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        // Soft dismiss: keep the typed text, just hide the menu until the
        // user types another character (which will reset dismissedQuery).
        setDismissedQuery(state.query);
      } else if (e.key === 'Tab') {
        // Tab also picks the active item, like Notion / Linear.
        e.preventDefault();
        e.stopPropagation();
        const item = filtered[activeIndex];
        if (item) runItem(item);
      }
    };

    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [visible, filtered, activeIndex, runItem, state.query]);

  // Scroll the active item into view as user navigates
  useEffect(() => {
    if (!visible) return;
    const el = itemsRef.current[activeIndex];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, visible]);

  if (!visible || !position) return null;

  // Group items for header rendering
  const groups: Array<{ name: string; items: Array<{ item: MenuItem; index: number }> }> = [];
  filtered.forEach((item, index) => {
    let group = groups.find((g) => g.name === item.group);
    if (!group) {
      group = { name: item.group, items: [] };
      groups.push(group);
    }
    group.items.push({ item, index });
  });

  // Clamp position to the viewport
  const MENU_WIDTH = 280;
  const MENU_MAX_HEIGHT = 360;
  const left = Math.min(position.left, Math.max(8, window.innerWidth - MENU_WIDTH - 8));
  const top = Math.min(position.top, Math.max(8, window.innerHeight - MENU_MAX_HEIGHT - 8));

  const wrapperStyle: CSSProperties = {
    position: 'fixed',
    top,
    left,
    zIndex: 200,
    width: MENU_WIDTH,
    maxHeight: MENU_MAX_HEIGHT,
    overflowY: 'auto',
    background: 'rgba(20, 18, 44, 0.96)',
    border: '1px solid rgba(140, 82, 255, 0.28)',
    borderRadius: 12,
    boxShadow:
      '0 24px 64px rgba(0, 0, 0, 0.55), 0 8px 24px rgba(140, 82, 255, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    padding: '6px 0',
    fontFamily: 'var(--font-sans)',
  };

  const groupHeaderStyle: CSSProperties = {
    padding: '8px 14px 4px',
    fontFamily: 'var(--font-brand)',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'rgba(237, 233, 255, 0.42)',
  };

  return (
    <div role="menu" aria-label="Insert block" style={wrapperStyle}>
      {groups.map((group) => (
        <div key={group.name}>
          <div style={groupHeaderStyle}>{group.name}</div>
          {group.items.map(({ item, index }) => {
            const isActive = index === activeIndex;
            return (
              <button
                key={item.id}
                role="menuitem"
                ref={(el) => {
                  itemsRef.current[index] = el;
                }}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(e) => {
                  // Prevent the editor from losing focus before we run the
                  // command. Without this, deleteRange would target a stale
                  // selection.
                  e.preventDefault();
                  runItem(item);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  padding: '8px 14px',
                  border: 'none',
                  background: isActive ? 'rgba(140, 82, 255, 0.18)' : 'transparent',
                  color: 'var(--on-surface)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  transition: 'background 0.12s ease',
                }}
              >
                <span
                  style={{
                    width: 32,
                    height: 32,
                    flexShrink: 0,
                    borderRadius: 8,
                    background: isActive ? 'rgba(174, 137, 255, 0.22)' : 'rgba(174, 137, 255, 0.1)',
                    border: '1px solid rgba(174, 137, 255, 0.22)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 18, color: 'var(--primary)' }}
                  >
                    {item.icon}
                  </span>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>
                    {item.label}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'rgba(237, 233, 255, 0.5)',
                      lineHeight: 1.4,
                      marginTop: 2,
                    }}
                  >
                    {item.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
