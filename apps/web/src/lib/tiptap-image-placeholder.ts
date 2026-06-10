import { Node, mergeAttributes } from '@tiptap/core';

/**
 * ImagePlaceholder — a block node the PDF importer emits where a figure was
 * detected but its crop could not be produced (degenerate bbox, crop or
 * upload failure). It renders as an actionable tile: the user clicks to pick
 * a file, drops an image onto it, or pastes from the clipboard, and the
 * placeholder replaces itself with a real `resizableImage`.
 *
 * The NodeView is attached in PageEditor via ReactNodeViewRenderer (same
 * pattern as Callout); this module stays React-free.
 */

export interface ImagePlaceholderUploadContext {
  notebookId: string;
  sectionId: string;
  pageId: string;
}

export interface ImagePlaceholderOptions {
  HTMLAttributes: Record<string, unknown>;
  /**
   * Supplies the ids the NodeView needs to upload a replacement image.
   * Wired by PageEditor to a ref so it stays current across page switches.
   */
  getUploadContext: (() => ImagePlaceholderUploadContext | null) | null;
}

export const ImagePlaceholder = Node.create<ImagePlaceholderOptions>({
  name: 'imagePlaceholder',

  group: 'block',

  atom: true,

  selectable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      getUploadContext: null,
    };
  },

  addAttributes() {
    return {
      label: {
        default: 'This figure could not be extracted from the PDF.',
        parseHTML: (element) =>
          element.getAttribute('data-label') ??
          'This figure could not be extracted from the PDF.',
        renderHTML: (attributes) => ({ 'data-label': attributes.label }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-image-placeholder]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(
        { 'data-image-placeholder': '' },
        this.options.HTMLAttributes,
        HTMLAttributes,
      ),
    ];
  },
});
