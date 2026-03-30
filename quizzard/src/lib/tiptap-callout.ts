import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

/**
 * Callout — a block-level TipTap node for styled callouts/alerts.
 *
 * Types: info, warning, success, tip
 *
 * Usage:
 *   editor.chain().focus().setCallout({ calloutType: 'info' }).run()
 *   editor.chain().focus().toggleCallout({ calloutType: 'warning' }).run()
 */

export type CalloutType = 'info' | 'warning' | 'success' | 'tip';

export interface CalloutOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (attrs: { calloutType: CalloutType }) => ReturnType;
      toggleCallout: (attrs: { calloutType: CalloutType }) => ReturnType;
      unsetCallout: () => ReturnType;
      updateCalloutType: (calloutType: CalloutType) => ReturnType;
    };
  }
}

export const CALLOUT_STYLES: Record<
  CalloutType,
  { icon: string; borderColor: string; bgColor: string; label: string }
> = {
  info: {
    icon: 'Info',
    borderColor: 'rgba(81,112,255,0.6)',
    bgColor: 'rgba(81,112,255,0.08)',
    label: 'Info',
  },
  warning: {
    icon: 'AlertTriangle',
    borderColor: 'rgba(249,115,22,0.6)',
    bgColor: 'rgba(249,115,22,0.08)',
    label: 'Warning',
  },
  success: {
    icon: 'CheckCircle',
    borderColor: 'rgba(34,197,94,0.6)',
    bgColor: 'rgba(34,197,94,0.08)',
    label: 'Success',
  },
  tip: {
    icon: 'Lightbulb',
    borderColor: 'rgba(140,82,255,0.6)',
    bgColor: 'rgba(140,82,255,0.08)',
    label: 'Tip',
  },
};

export const Callout = Node.create<CalloutOptions>({
  name: 'callout',

  group: 'block',

  content: 'block+',

  defining: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      calloutType: {
        default: 'info' as CalloutType,
        parseHTML: (element) =>
          (element.getAttribute('data-callout-type') as CalloutType) || 'info',
        renderHTML: (attributes) => ({
          'data-callout-type': attributes.calloutType,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout-type]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0,
    ];
  },

  addCommands() {
    return {
      setCallout:
        (attrs) =>
        ({ commands }) =>
          commands.wrapIn(this.name, attrs),

      toggleCallout:
        (attrs) =>
        ({ commands, editor }) => {
          if (editor.isActive(this.name)) {
            return commands.lift(this.name);
          }
          return commands.wrapIn(this.name, attrs);
        },

      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),

      updateCalloutType:
        (calloutType) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { calloutType }),
    };
  },

  // The NodeView will be attached in PageEditor via ReactNodeViewRenderer
});
