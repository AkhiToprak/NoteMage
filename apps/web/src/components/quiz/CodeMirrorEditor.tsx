'use client';

import { useEffect, useRef, useState } from 'react';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { oneDark } from '@codemirror/theme-one-dark';
import type { ExecutableCodeLanguage } from '@notemage/shared';

interface CodeMirrorEditorProps {
  value: string;
  language: ExecutableCodeLanguage;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  minHeight?: string;
  maxHeight?: string;
}

async function loadLanguageExtension(
  language: ExecutableCodeLanguage,
): Promise<Extension | null> {
  switch (language) {
    case 'python':
      return (await import('@codemirror/lang-python')).python();
    case 'javascript':
      return (await import('@codemirror/lang-javascript')).javascript();
    case 'typescript':
      return (await import('@codemirror/lang-javascript')).javascript({ typescript: true });
    case 'java':
      return (await import('@codemirror/lang-java')).java();
    case 'cpp':
      return (await import('@codemirror/lang-cpp')).cpp();
    case 'sql':
      return (await import('@codemirror/lang-sql')).sql();
    case 'go':
      return (await import('@codemirror/lang-go')).go();
    case 'rust':
      return (await import('@codemirror/lang-rust')).rust();
    default:
      return null;
  }
}

export default function CodeMirrorEditor({
  value,
  language,
  readOnly = false,
  onChange,
  minHeight = '160px',
  maxHeight = '420px',
}: CodeMirrorEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [langExtension, setLangExtension] = useState<Extension | null>(null);

  // Load language extension on language change.
  useEffect(() => {
    let cancelled = false;
    void loadLanguageExtension(language).then((ext) => {
      if (!cancelled) setLangExtension(ext);
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  // (Re)build the editor when the language extension resolves or readOnly toggles.
  useEffect(() => {
    if (!hostRef.current) return;
    const host = hostRef.current;
    const baseExtensions: Extension[] = [
      lineNumbers(),
      highlightActiveLine(),
      history(),
      EditorView.lineWrapping,
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      oneDark,
      EditorView.editable.of(!readOnly),
      EditorState.readOnly.of(readOnly),
      EditorView.theme({
        '&': {
          fontSize: '13.5px',
          minHeight,
          maxHeight,
          borderRadius: '10px',
          overflow: 'hidden',
        },
        '.cm-scroller': {
          fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
          overflow: 'auto',
        },
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && onChangeRef.current) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
    ];
    if (langExtension) baseExtensions.push(langExtension);

    const state = EditorState.create({
      doc: value,
      extensions: baseExtensions,
    });
    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [langExtension, readOnly, minHeight, maxHeight]);

  // External value updates (e.g. submit-time freeze) flow into the editor.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  return (
    <div
      ref={hostRef}
      style={{
        borderRadius: '10px',
        border: '1px solid rgba(174,137,255,0.36)',
        background: '#1a1a2e',
        overflow: 'hidden',
      }}
    />
  );
}
