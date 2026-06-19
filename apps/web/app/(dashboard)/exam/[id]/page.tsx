'use client';

/* Mage Revolution Phase 5 — exam overview surface.
 *
 * Shows an exam's countdown, aggregate readiness (rolled up from its scoped
 * paths / quizzes / readings by /api/user/exams/[id]/readiness), its weakest
 * topics, and a coverage editor (PUT /api/user/exams/[id]/scope). Registers the
 * exam as the Mage panel's context so the panel grounds on it and the volatile
 * readiness study-state block fires. Matches the dashboard surfaces: rework
 * primitives, `--token` inline styles, Material Symbols, no gradients. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { NMCard } from '@/components/rework/NMCard';
import { SectionHeading } from '@/components/rework/SectionHeading';
import { readinessColor } from '@/components/rework/tokens';
import { useRegisterMageContext } from '@/components/mage';
import ExamScopeEditor, {
  type ScopeCandidates,
  type ScopeItemRef,
} from '@/components/features/ExamScopeEditor';

// ─── Response shapes (mirror src/lib/exam-scope.ts) ──────────────────────────

interface ExamMeta {
  id: string;
  title: string;
  examDate: string;
  notebookId: string;
  notebookName: string | null;
}

interface ResolvedScopeItem extends ScopeItemRef {
  title: string;
  subtitle?: string;
}

interface ScopeView {
  exam: ExamMeta;
  items: ResolvedScopeItem[];
  candidates: ScopeCandidates;
}

interface ReadinessItem {
  type: ScopeItemRef['itemType'];
  id: string;
  title: string;
  score: number;
  weight: number;
  attempted: boolean;
  passive: boolean;
}

interface ReadinessWeakTopic {
  title: string;
  pct: number;
  source: { type: 'path' | 'quiz_set'; id: string };
}

interface Readiness {
  readiness: number;
  hasGradedMaterial: boolean;
  isEmpty: boolean;
  items: ReadinessItem[];
  weakTopics: ReadinessWeakTopic[];
  counts: { paths: number; quizSets: number; passive: number };
}

interface ReadinessResult {
  exam: ExamMeta;
  daysUntil: number;
  readiness: Readiness;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<ScopeItemRef['itemType'], string> = {
  path: 'route',
  quiz_set: 'quiz',
  flashcard_set: 'style',
  page: 'description',
  document: 'picture_as_pdf',
  section: 'folder',
};

/** Countdown urgency — fewer days reads hotter. Solid token colors, no gradients. */
function countdownColors(days: number): { bg: string; fg: string } {
  if (days <= 1) return { bg: 'var(--nm-boss-soft)', fg: 'var(--nm-boss-ink)' };
  if (days <= 3) return { bg: 'var(--nm-review-soft)', fg: 'var(--nm-review-ink)' };
  if (days <= 7) return { bg: 'var(--nm-streak-soft)', fg: 'var(--nm-streak-ink)' };
  return { bg: 'var(--surface-container-high)', fg: 'var(--on-surface)' };
}

function countdownLabel(days: number): string {
  if (days < 0) return 'Past';
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days}d`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/** Client-only read of the `?edit=` deep-link param (null during SSR). */
function readEditParam(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('edit');
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExamOverviewPage() {
  const params = useParams();
  const examId = Array.isArray(params?.id) ? params.id[0] : (params?.id ?? '');

  const [readiness, setReadiness] = useState<ReadinessResult | null>(null);
  const [scope, setScope] = useState<ScopeView | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');
  // A Mage high-risk prefill card (EDIT_EXAM_SCOPE / CHANGE_EXAM_DATE) deep-links
  // here with ?edit=scope|date to open the matching editor. Read from
  // window.location (not useSearchParams, which forces a prerender bailout) via a
  // lazy initializer: SSR sees no window → false, and the page renders the
  // loading state until the client fetch lands, so there is no hydration
  // mismatch even when the editor opens.
  const [editing, setEditing] = useState(() => readEditParam() === 'scope');
  const [editingDate, setEditingDate] = useState(() => readEditParam() === 'date');

  const exam = readiness?.exam ?? scope?.exam ?? null;

  // Ground the Mage panel on this exam (drives the readiness study-state block).
  useRegisterMageContext(
    exam
      ? { type: 'exam', ids: { examId, notebookId: exam.notebookId }, title: exam.title }
      : { type: 'exam', ids: { examId }, title: 'Exam' },
  );

  const load = useCallback(async () => {
    if (!examId) return;
    try {
      const [rRes, sRes] = await Promise.all([
        fetch(`/api/user/exams/${examId}/readiness`),
        fetch(`/api/user/exams/${examId}/scope`),
      ]);
      if (rRes.status === 404 || sRes.status === 404) {
        setStatus('notfound');
        return;
      }
      if (!rRes.ok || !sRes.ok) {
        setStatus('error');
        return;
      }
      setReadiness(await rRes.json());
      setScope(await sRes.json());
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [examId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Per-item readiness, keyed by id, so the coverage list can show each item's score.
  const scoreById = useMemo(() => {
    const m = new Map<string, ReadinessItem>();
    for (const it of readiness?.readiness.items ?? []) m.set(it.id, it);
    return m;
  }, [readiness]);

  if (status === 'loading') {
    return <CenteredMessage icon="hourglass_empty" title="Loading exam…" />;
  }
  if (status === 'notfound') {
    return (
      <CenteredMessage
        icon="event_busy"
        title="Exam not found"
        body="This exam may have been deleted."
        action={<Button href="/dashboard" variant="secondary" leadingIcon="arrow_back">Back to dashboard</Button>}
      />
    );
  }
  if (status === 'error' || !exam || !readiness || !scope) {
    return (
      <CenteredMessage
        icon="error"
        title="Couldn't load this exam"
        body="Something went wrong. Please try again."
        action={<Button variant="secondary" leadingIcon="refresh" onClick={() => { setStatus('loading'); void load(); }}>Retry</Button>}
      />
    );
  }

  const { daysUntil } = readiness;
  const r = readiness.readiness;
  const cc = countdownColors(daysUntil);

  return (
    <div
      style={{
        maxWidth: 920,
        margin: '0 auto',
        padding: 'clamp(16px, 3vw, 32px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-5)',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <Button href="/dashboard" variant="ghost" size="sm" leadingIcon="arrow_back" style={{ alignSelf: 'flex-start' }}>
          Dashboard
        </Button>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'baseline',
              gap: 4,
              padding: '8px 16px',
              borderRadius: 'var(--radius-full)',
              background: cc.bg,
              color: cc.fg,
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 'var(--fs-xl)',
              letterSpacing: '-0.02em',
              flexShrink: 0,
            }}
          >
            {countdownLabel(daysUntil)}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--fs-2xl)',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: 'var(--on-surface)',
                overflowWrap: 'anywhere',
              }}
            >
              {exam.title}
            </h1>
            {editingDate ? (
              <DateEditor
                examId={examId}
                currentIso={exam.examDate}
                onCancel={() => setEditingDate(false)}
                onSaved={() => {
                  setEditingDate(false);
                  void load();
                }}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 4, flexWrap: 'wrap' }}>
                <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--on-surface-variant)' }}>
                  {formatDate(exam.examDate)}
                  {exam.notebookName ? ` · ${exam.notebookName}` : ''}
                </p>
                <Button variant="ghost" size="sm" leadingIcon="edit_calendar" onClick={() => setEditingDate(true)}>
                  Edit date
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Readiness ──────────────────────────────────────────────────────── */}
      <NMCard
        accent="lesson"
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
      >
        <SectionHeading title="Readiness" icon="insights" />

        {r.isEmpty ? (
          <EmptyReadiness onEdit={() => setEditing(true)} />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(40px, 9vw, 64px)',
                  fontWeight: 800,
                  lineHeight: 1,
                  letterSpacing: '-0.03em',
                  color: r.hasGradedMaterial ? readinessColor(r.readiness) : 'var(--on-surface-variant)',
                }}
              >
                {r.hasGradedMaterial ? `${r.readiness}%` : '—'}
              </span>
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--on-surface-variant)', paddingBottom: 6 }}>
                {r.hasGradedMaterial ? 'estimated readiness' : 'no graded material yet'}
              </span>
            </div>

            {r.hasGradedMaterial && (
              <div
                aria-hidden
                style={{
                  width: '100%',
                  height: 10,
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--surface-container-high)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${r.readiness}%`,
                    height: '100%',
                    borderRadius: 'var(--radius-full)',
                    background: readinessColor(r.readiness),
                    transition: 'width var(--dur-slow, 0.5s) var(--ease-spring)',
                  }}
                />
              </div>
            )}

            {!r.hasGradedMaterial && (
              <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
                Only readings are in scope. Add a quiz or a learning path to start tracking
                a readiness score.
              </p>
            )}

            <CountRow counts={r.counts} />

            {r.weakTopics.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: 'var(--fs-xs)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--on-surface-variant)',
                  }}
                >
                  Focus here first
                </p>
                {r.weakTopics.slice(0, 5).map((w, i) => (
                  <div
                    key={`${w.source.type}:${w.source.id}:${i}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}
                  >
                    <span
                      style={{
                        fontSize: 'var(--fs-sm)',
                        color: 'var(--on-surface)',
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {w.title}
                    </span>
                    <ScorePill pct={w.pct} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </NMCard>

      {/* ── Coverage ───────────────────────────────────────────────────────── */}
      <NMCard accent="quiz" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <SectionHeading
          title="What this exam covers"
          icon="checklist"
          action={
            !editing ? (
              <Button variant="secondary" size="sm" leadingIcon="tune" onClick={() => setEditing(true)}>
                Edit coverage
              </Button>
            ) : undefined
          }
        />

        {editing ? (
          <ExamScopeEditor
            examId={examId}
            candidates={scope.candidates}
            current={scope.items.map((it) => ({ itemType: it.itemType, itemId: it.itemId }))}
            onCancel={() => setEditing(false)}
            onSaved={(view) => {
              setScope(view as ScopeView);
              setEditing(false);
              // Coverage changed → readiness changed; refresh it.
              void load();
            }}
          />
        ) : scope.items.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
              Nothing scoped yet. Pick the paths, quizzes, and notes this exam tests so Mage
              can track your readiness and point you at your weak spots.
            </p>
            <Button variant="primary" leadingIcon="add" onClick={() => setEditing(true)} style={{ alignSelf: 'flex-start' }}>
              Set coverage
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            {scope.items.map((it) => (
              <CoverageRow key={`${it.itemType}:${it.itemId}`} item={it} score={scoreById.get(it.itemId)} />
            ))}
          </div>
        )}
      </NMCard>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CountRow({ counts }: { counts: Readiness['counts'] }) {
  const parts: { icon: string; label: string }[] = [];
  if (counts.paths > 0) parts.push({ icon: 'route', label: `${counts.paths} path${counts.paths === 1 ? '' : 's'}` });
  if (counts.quizSets > 0) parts.push({ icon: 'quiz', label: `${counts.quizSets} quiz${counts.quizSets === 1 ? '' : 'zes'}` });
  if (counts.passive > 0) parts.push({ icon: 'menu_book', label: `${counts.passive} reading${counts.passive === 1 ? '' : 's'}` });
  if (parts.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
      {parts.map((p) => (
        <span
          key={p.label}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-sm)', color: 'var(--on-surface-variant)' }}
        >
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>
            {p.icon}
          </span>
          {p.label}
        </span>
      ))}
    </div>
  );
}

function ScorePill({ pct }: { pct: number }) {
  return (
    <span
      style={{
        flexShrink: 0,
        padding: '2px 10px',
        borderRadius: 'var(--radius-full)',
        background: 'var(--surface-container-high)',
        color: readinessColor(pct),
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: 'var(--fs-xs)',
      }}
    >
      {pct}%
    </span>
  );
}

function CoverageRow({ item, score }: { item: ResolvedScopeItem; score?: ReadinessItem }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: '10px 12px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface-container)',
      }}
    >
      <span
        aria-hidden
        className="material-symbols-outlined"
        style={{ fontSize: 20, color: 'var(--on-surface-variant)', flexShrink: 0 }}
      >
        {TYPE_ICON[item.itemType]}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span
          style={{
            display: 'block',
            fontSize: 'var(--fs-sm)',
            fontWeight: 600,
            color: 'var(--on-surface)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.title}
        </span>
        {item.subtitle && (
          <span style={{ display: 'block', fontSize: 'var(--fs-xs)', color: 'var(--on-surface-variant)' }}>
            {item.subtitle}
          </span>
        )}
      </span>
      {score && !score.passive ? (
        score.attempted ? (
          <ScorePill pct={score.score} />
        ) : (
          <span style={{ flexShrink: 0, fontSize: 'var(--fs-xs)', color: 'var(--on-surface-variant)' }}>
            Not started
          </span>
        )
      ) : (
        <span style={{ flexShrink: 0, fontSize: 'var(--fs-xs)', color: 'var(--on-surface-variant)' }}>
          Reading
        </span>
      )}
    </div>
  );
}

function EmptyReadiness({ onEdit }: { onEdit: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
        Set what this exam covers and Mage will estimate how ready you are and flag your
        weakest topics.
      </p>
      <Button variant="primary" leadingIcon="add" onClick={onEdit} style={{ alignSelf: 'flex-start' }}>
        Set coverage
      </Button>
    </div>
  );
}

/**
 * Inline exam-date editor — the prefill target for Mage's CHANGE_EXAM_DATE
 * high-risk action (?edit=date) and a self-contained "Edit date" affordance.
 * Mage never commits the change; the learner saves it here. PUTs the canonical
 * /api/user/exams/[id] endpoint, which re-checks ownership + future-date.
 */
function DateEditor({
  examId,
  currentIso,
  onSaved,
  onCancel,
}: {
  examId: string;
  currentIso: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().slice(0, 10);
  const [value, setValue] = useState(currentIso.slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!value || value < minDate) {
      setErr('Pick a date in the future.');
      return;
    }
    setErr(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/user/exams/${examId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examDate: value }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setErr(body?.error || 'Could not save. Try again.');
        setSaving(false);
        return;
      }
      onSaved();
    } catch {
      setErr('Network error. Try again.');
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <input
          type="date"
          value={value}
          min={minDate}
          disabled={saving}
          onChange={(e) => setValue(e.target.value)}
          style={{
            padding: '8px 12px',
            background: 'var(--surface-container-high)',
            border: '1px solid var(--outline-variant)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--on-surface)',
            fontSize: 'var(--fs-sm)',
            fontFamily: 'inherit',
          }}
        />
        <Button variant="primary" size="sm" leadingIcon="check" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
      {err && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--error)' }}>{err}</span>}
    </div>
  );
}

function CenteredMessage({
  icon,
  title,
  body,
  action,
}: {
  icon: string;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: '50vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-3)',
        padding: 'clamp(16px, 4vw, 48px)',
        textAlign: 'center',
      }}
    >
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 40, color: 'var(--on-surface-variant)' }}>
        {icon}
      </span>
      <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--fs-xl)', fontWeight: 700, color: 'var(--on-surface)' }}>
        {title}
      </h1>
      {body && <p style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--on-surface-variant)', maxWidth: 360 }}>{body}</p>}
      {action}
    </div>
  );
}
