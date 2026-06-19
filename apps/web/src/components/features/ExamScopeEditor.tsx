'use client';

/* Mage Revolution Phase 5 — exam scope editor.
 *
 * Lets the learner choose what an exam covers: any of their learning paths plus
 * the backing study pack's quizzes, flashcards, notes, documents, and sections.
 * Selection is a flat set of `${itemType}:${itemId}` keys; Save PUTs the whole
 * set to /api/user/exams/[id]/scope (the server re-authorizes every id). Matches
 * the app's surfaces: `--token` inline styles, Material Symbols, no gradients,
 * full hover / focus-visible / active states on every toggle. */

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import styles from './ExamScopeEditor.module.css';

export interface ScopeCandidate {
  id: string;
  title: string;
  subtitle?: string;
}

export interface ScopeCandidates {
  paths: ScopeCandidate[];
  quizSets: ScopeCandidate[];
  flashcardSets: ScopeCandidate[];
  pages: ScopeCandidate[];
  documents: ScopeCandidate[];
  sections: ScopeCandidate[];
}

export interface ScopeItemRef {
  itemType: 'path' | 'quiz_set' | 'flashcard_set' | 'page' | 'document' | 'section';
  itemId: string;
}

type CandidateGroupKey = keyof ScopeCandidates;

const GROUPS: {
  key: CandidateGroupKey;
  itemType: ScopeItemRef['itemType'];
  label: string;
  icon: string;
}[] = [
  { key: 'paths', itemType: 'path', label: 'Learning paths', icon: 'route' },
  { key: 'quizSets', itemType: 'quiz_set', label: 'Quizzes', icon: 'quiz' },
  { key: 'flashcardSets', itemType: 'flashcard_set', label: 'Flashcards', icon: 'style' },
  { key: 'sections', itemType: 'section', label: 'Sections', icon: 'folder' },
  { key: 'pages', itemType: 'page', label: 'Notes', icon: 'description' },
  { key: 'documents', itemType: 'document', label: 'Documents', icon: 'picture_as_pdf' },
];

function keyOf(ref: ScopeItemRef): string {
  return `${ref.itemType}:${ref.itemId}`;
}

interface ExamScopeEditorProps {
  examId: string;
  candidates: ScopeCandidates;
  current: ScopeItemRef[];
  onCancel: () => void;
  /** Receives the refreshed scope view JSON returned by the PUT. */
  onSaved: (view: unknown) => void;
}

export default function ExamScopeEditor({
  examId,
  candidates,
  current,
  onCancel,
  onSaved,
}: ExamScopeEditorProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(current.map((r) => keyOf(r))),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalCandidates = useMemo(
    () => GROUPS.reduce((n, g) => n + candidates[g.key].length, 0),
    [candidates],
  );

  function toggle(ref: ScopeItemRef) {
    setSelected((prev) => {
      const next = new Set(prev);
      const k = keyOf(ref);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    const items: ScopeItemRef[] = [...selected].map((k) => {
      const [itemType, ...rest] = k.split(':');
      return { itemType: itemType as ScopeItemRef['itemType'], itemId: rest.join(':') };
    });
    try {
      const res = await fetch(`/api/user/exams/${examId}/scope`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) {
        setError('Could not save. Please try again.');
        setSaving(false);
        return;
      }
      const view = await res.json();
      onSaved(view);
    } catch {
      setError('Could not save. Please try again.');
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {totalCandidates === 0 ? (
        <p
          style={{
            margin: 0,
            fontSize: 'var(--fs-sm)',
            color: 'var(--on-surface-variant)',
            lineHeight: 1.6,
          }}
        >
          Nothing to add yet. Create a learning path, or add quizzes, notes, or
          documents to this exam&apos;s study pack, then come back to set the coverage.
        </p>
      ) : (
        GROUPS.map((group) => {
          const list = candidates[group.key];
          if (list.length === 0) return null;
          return (
            <fieldset
              key={group.key}
              style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }}
            >
              <legend
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: 0,
                  marginBottom: 'var(--space-2)',
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--fs-sm)',
                  fontWeight: 700,
                  color: 'var(--on-surface)',
                }}
              >
                <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>
                  {group.icon}
                </span>
                {group.label}
              </legend>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                {list.map((c) => {
                  const ref: ScopeItemRef = { itemType: group.itemType, itemId: c.id };
                  const checked = selected.has(keyOf(ref));
                  return (
                    <ToggleRow
                      key={c.id}
                      title={c.title}
                      subtitle={c.subtitle}
                      checked={checked}
                      onToggle={() => toggle(ref)}
                    />
                  );
                })}
              </div>
            </fieldset>
          );
        })
      )}

      {error && (
        <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--error)' }} role="alert">
          {error}
        </p>
      )}

      <div
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <Button variant="primary" leadingIcon="check" onClick={save} loading={saving}>
          Save coverage
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--on-surface-variant)' }}>
          {selected.size} selected
        </span>
      </div>
    </div>
  );
}

function ToggleRow({
  title,
  subtitle,
  checked,
  onToggle,
}: {
  title: string;
  subtitle?: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      data-checked={checked}
      onClick={onToggle}
      className={styles.toggle}
    >
      <span aria-hidden className={styles.box}>
        <span className="material-symbols-outlined" style={{ fontSize: 16, fontWeight: 700 }}>
          check
        </span>
      </span>
      <span className={styles.body}>
        <span className={styles.title}>{title}</span>
        {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
      </span>
    </button>
  );
}
