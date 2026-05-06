import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

/**
 * Slash command extension for the page editor.
 *
 * Watches the editor for a `/` followed by optional word characters at the
 * start of an empty paragraph. When a match is found, emits an "open" state
 * to the host React component via `options.onStateChange`. The host renders
 * a popup positioned above the slash and forwards keyboard / mouse selections
 * back into the editor as block-type commands.
 *
 * No external deps. The popup component lives in
 * `src/components/notebook/SlashMenu.tsx` and consumes the state via the
 * `onStateChange` callback we pass into `SlashCommand.configure(...)`.
 *
 * The plugin only ever READS the editor state — it never mutates it. All
 * mutations (delete the slash + insert the chosen block) happen from the
 * React component using normal `editor.chain().focus().X().run()` commands.
 */

export interface SlashCommandState {
  /** True when the user has typed a slash at the start of a paragraph and the menu should appear. */
  isOpen: boolean;
  /** Query text after the slash (e.g. "head" for `/head`). Empty when only `/` is typed. */
  query: string;
  /** Document range covering the slash + query, used for `deleteRange()` when a command is chosen. */
  range: { from: number; to: number } | null;
  /** Lazy getter for the slash position's client rect, used by the popup to position itself. */
  clientRect: (() => DOMRect | null) | null;
}

export interface SlashCommandOptions {
  /** Called whenever the slash menu state changes. The host should mirror this into React state. */
  onStateChange: (state: SlashCommandState) => void;
}

const CLOSED_STATE: SlashCommandState = {
  isOpen: false,
  query: '',
  range: null,
  clientRect: null,
};

export const slashCommandPluginKey = new PluginKey('slashCommand');

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return {
      onStateChange: () => {},
    };
  },

  addProseMirrorPlugins() {
    const onStateChange = this.options.onStateChange;
    let lastEmittedKey = '';

    const emit = (state: SlashCommandState) => {
      // Cheap signature so we don't notify React on every keystroke when
      // nothing meaningful changed (e.g. cursor moved within the same query).
      const key = state.isOpen
        ? `open:${state.query}:${state.range?.from}:${state.range?.to}`
        : 'closed';
      if (key === lastEmittedKey) return;
      lastEmittedKey = key;
      onStateChange(state);
    };

    return [
      new Plugin({
        key: slashCommandPluginKey,
        view() {
          return {
            update: (view: EditorView) => {
              const { state } = view;
              const { selection } = state;

              // Bail when there's a multi-character selection — slash menu is
              // a single-cursor affair.
              if (!selection.empty) {
                emit(CLOSED_STATE);
                return;
              }

              const $from = selection.$from;
              const parent = $from.parent;

              // Only trigger inside plain paragraphs. Headings, callouts,
              // code blocks, list items, etc. are excluded so the slash
              // doesn't fight with their own typing semantics.
              if (parent.type.name !== 'paragraph') {
                emit(CLOSED_STATE);
                return;
              }

              // Read the paragraph text from start to cursor.
              const textBefore = parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');

              // Match: starts with `/`, followed by zero or more word chars,
              // and that's the WHOLE text in the paragraph (so we don't fire
              // when the user types `/` mid-sentence).
              const match = /^\/([\w]*)$/.exec(textBefore);
              if (!match) {
                emit(CLOSED_STATE);
                return;
              }

              const matchLength = match[0].length;
              const query = match[1];

              // Range covering the `/<query>` text in the document.
              const range = {
                from: $from.pos - matchLength,
                to: $from.pos,
              };

              // Lazy rect getter — the popup calls this on render so the
              // coords are fresh after every keystroke.
              const clientRect = () => {
                try {
                  const coords = view.coordsAtPos(range.from);
                  return new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top);
                } catch {
                  return null;
                }
              };

              emit({ isOpen: true, query, range, clientRect });
            },

            destroy() {
              emit(CLOSED_STATE);
            },
          };
        },
      }),
    ];
  },
});
