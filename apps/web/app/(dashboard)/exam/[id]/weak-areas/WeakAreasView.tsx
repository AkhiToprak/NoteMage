'use client';

/* Exam Mode Phase 2 — Weak Areas dashboard (Figma "X2 Weaknesses" 89:18921 web /
 * 89:16868 mobile / 89:23389 empty). The full set of weak topics for an exam —
 * NOT the hub's capped preview — grouped into Urgent / Needs practice / Almost
 * fixed and ranked by the readiness each one is costing.
 *
 * Honest by construction: grouping + per-topic readiness-impact come from the
 * pure `deriveWeakAreas` rollup (same weighting as the ring), so no number is
 * fabricated. The cards reuse the SHIPPED exam screens' cream language (`.shell`
 * + `ui.module.css` tokens, local soft-red family) so hub → weak-areas reads as
 * one surface. CTAs reuse real engines: Practice/Drill → the path-scoped
 * weak-point PracticeSession (Pro-gated), Review theory → the topic's Exam
 * Mission, Ask Mage / Ask Mage to plan → the global Mage panel in exam context. */

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/app/AppShell';
import ui from '@/components/app/ui.module.css';
import styles from './WeakAreas.module.css';
import { useRegisterMageContext, useOptionalMage } from '@/components/mage';
import type { PathPlan, PathSlot } from '@/components/learn/PathView';

// ─── Response shapes (mirror src/lib/exam-readiness.ts + exam-scope.ts) ───────

type WeakAreaBand = 'urgent' | 'needs_practice' | 'almost_fixed';
type WeakAreaImpact = 'high' | 'medium' | 'low';

interface WeakArea {
  key: string;
  title: string;
  mastery: number;
  band: WeakAreaBand;
  sourceType: 'path' | 'quiz_set';
  sourceId: string;
  impactPoints: number;
  impact: WeakAreaImpact;
}

interface WeakAreasData {
  readiness: number;
  hasGradedMaterial: boolean;
  attempted: boolean;
  recoverablePoints: number;
  areas: WeakArea[];
  counts: { urgent: number; needs_practice: number; almost_fixed: number; total: number };
}

interface ExamMeta {
  id: string;
  title: string;
  examDate: string;
  notebookId: string;
  notebookName: string | null;
}

export interface WeakAreasResponse {
  exam: ExamMeta;
  daysUntil: number;
  primaryPathId: string | null;
  weakAreas: WeakAreasData;
}

const PASS_GATE = 70;
const BAND_ORDER: WeakAreaBand[] = ['urgent', 'needs_practice', 'almost_fixed'];

const BAND_META: Record<
  WeakAreaBand,
  { label: string; dot: string; bar: string; badge: string; chip: string }
> = {
  urgent: { label: 'Urgent', dot: 'var(--st-red-strong)', bar: '#d4592f', badge: styles.bUrgent, chip: styles.chipUrgent },
  needs_practice: { label: 'Needs practice', dot: 'var(--amber)', bar: 'var(--amber)', badge: styles.bNeeds, chip: styles.chipNeeds },
  almost_fixed: { label: 'Almost fixed', dot: 'var(--green)', bar: 'var(--green)', badge: styles.bAlmost, chip: styles.chipAlmost },
};

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface WeakAreasViewProps {
  examId: string;
  data: WeakAreasResponse;
  /** Linked path (slim PathPlan) for per-topic mission deep-links; null if the
   *  exam has no primary path or the path load failed (non-fatal). */
  path: PathPlan | null;
  /**
   * Weakness Training Phase 2 (plan §6.1 "Entry points" / §7.1 item 3) —
   * ADDITIVE concept-level link-out count, computed server-side via the SAME
   * canonical `deriveConceptWeakAreas` the `/profile/weak-spots` page uses,
   * scoped to this exam's primary path — so the two surfaces can never
   * disagree on severity. This does NOT replace or refactor the slot-level
   * `deriveWeakAreas` rollup below (`w.areas`/`w.counts`), which still covers
   * every exam scope type including non-path items. Undefined/0 renders
   * nothing — no regression when the flag is off or there's no signal yet.
   */
  conceptWeakSpots?: number;
}

export default function WeakAreasView({ examId, data, path, conceptWeakSpots }: WeakAreasViewProps) {
  useRegisterMageContext(
    data?.exam
      ? { type: 'exam', ids: { examId, notebookId: data.exam.notebookId }, title: data.exam.title }
      : { type: 'exam', ids: { examId }, title: 'Exam' },
  );

  return (
    <AppShell>
      <WeakAreasBody examId={examId} data={data} path={path} conceptWeakSpots={conceptWeakSpots} />
    </AppShell>
  );
}

// ─── Body ─────────────────────────────────────────────────────────────────────

function WeakAreasBody({
  examId,
  data,
  path,
  conceptWeakSpots,
}: {
  examId: string;
  data: WeakAreasResponse;
  path: PathPlan | null;
  conceptWeakSpots?: number;
}) {
  const mage = useOptionalMage();
  const router = useRouter();
  const { exam, primaryPathId, weakAreas: w } = data;
  const [sort, setSort] = useState<'impact' | 'mastery'>('impact');

  const slots = useMemo<PathSlot[]>(() => (path ? path.phases.flatMap((ph) => ph.slots) : []), [path]);
  const slotByTitle = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of slots) m.set(slug(s.title), s.id);
    return m;
  }, [slots]);

  const reviewHref = useCallback(
    (area: WeakArea): string => {
      if (area.sourceType === 'path') {
        const slotId = slotByTitle.get(slug(area.title));
        if (slotId) return `/exam/${examId}/mission/${slotId}`;
      }
      return `/exam/${examId}`;
    },
    [examId, slotByTitle],
  );

  // "Start a mission" / empty-state CTA: the first studiable node, else the hub.
  const nextSlot = slots.find((s) => s.unlocked && !s.completed) ?? slots.find((s) => !s.completed) ?? null;
  const missionHref = nextSlot ? `/exam/${examId}/mission/${nextSlot.id}` : `/exam/${examId}`;

  const sorted = useMemo(() => {
    const arr = [...w.areas];
    arr.sort((a, b) =>
      sort === 'impact'
        ? b.impactPoints - a.impactPoints || a.mastery - b.mastery
        : a.mastery - b.mastery || b.impactPoints - a.impactPoints,
    );
    return arr;
  }, [w.areas, sort]);

  const grouped = useMemo(
    () => BAND_ORDER.map((band) => ({ band, areas: sorted.filter((a) => a.band === band) })).filter((g) => g.areas.length > 0),
    [sorted],
  );

  const recoverable = Math.round(w.recoverablePoints);
  const pathLabel = path?.title ?? 'Linked path';

  return (
    <div className={styles.page}>
      <Link href={`/exam/${examId}`} className={styles.back}>
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>chevron_left</span>
        {exam.title}
      </Link>

      <div className={styles.headRow}>
        <div className={styles.titleWrap}>
          <h1 className={styles.title}>Weak areas</h1>
          <p className={styles.subtitle}>These topics are holding back your readiness.</p>
        </div>
        {w.counts.total > 0 ? (
          <div className={styles.toolbar}>
            <div className={styles.sortControl} role="group" aria-label="Sort weak areas">
              <button
                type="button"
                className={`${styles.sortBtn} ${sort === 'impact' ? styles.sortBtnActive : ''}`}
                aria-pressed={sort === 'impact'}
                onClick={() => setSort('impact')}
              >
                Sort by impact
              </button>
              <button
                type="button"
                className={`${styles.sortBtn} ${sort === 'mastery' ? styles.sortBtnActive : ''}`}
                aria-pressed={sort === 'mastery'}
                onClick={() => setSort('mastery')}
              >
                By mastery
              </button>
            </div>
            <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={() => mage?.open()}>
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>auto_awesome</span>
              Ask Mage to plan
            </button>
          </div>
        ) : null}
      </div>

      <ConceptLinkOutBanner count={conceptWeakSpots} />

      {w.counts.total === 0 ? (
        <EmptyState
          hasGraded={w.hasGradedMaterial}
          attempted={w.attempted}
          examId={examId}
          missionHref={missionHref}
        />
      ) : (
        <>
          {/* summary strip */}
          <section className={styles.summary}>
            <div className={styles.summaryStats}>
              <Stat value={w.counts.total} label={w.counts.total === 1 ? 'weak topic' : 'weak topics'} />
              <Stat value={w.counts.urgent} label="urgent" tone="urgent" />
              <Stat value={w.counts.needs_practice} label="need practice" tone="needs" />
              <Stat value={w.counts.almost_fixed} label="almost fixed" tone="almost" />
              {recoverable >= 1 ? <Stat value={`+${recoverable}%`} label="readiness to recover" tone="accent" /> : null}
            </div>
            <div className={styles.summaryActions}>
              <WeakSessionButton pathId={primaryPathId} router={router} label="Fix all today" icon="bolt" variant="block" />
            </div>
          </section>

          {/* groups */}
          {grouped.map(({ band, areas }) => (
            <section key={band} className={styles.group}>
              <div className={styles.groupHead}>
                <span className={ui.dot} style={{ background: BAND_META[band].dot }} />
                <h2 className={styles.groupTitle}>{BAND_META[band].label}</h2>
                <span className={styles.groupCount}>{areas.length}</span>
              </div>
              <div className={styles.cardGrid}>
                {areas.map((area) => (
                  <WeakAreaCard
                    key={area.key}
                    area={area}
                    pathId={primaryPathId}
                    reviewHref={reviewHref(area)}
                    sourceLabel={area.sourceType === 'path' ? pathLabel : 'Quiz'}
                    sourceIcon={area.sourceType === 'path' ? 'route' : 'quiz'}
                    onAskMage={() => mage?.open()}
                    router={router}
                  />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function WeakAreaCard({
  area,
  pathId,
  reviewHref,
  sourceLabel,
  sourceIcon,
  onAskMage,
  router,
}: {
  area: WeakArea;
  pathId: string | null;
  reviewHref: string;
  sourceLabel: string;
  sourceIcon: string;
  onAskMage: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const meta = BAND_META[area.band];
  const mastery = Math.round(area.mastery);
  const gap = Math.max(0, PASS_GATE - mastery);
  const impact = Math.round(area.impactPoints);

  const note =
    area.band === 'urgent'
      ? `Scoring ${mastery}% — well below the ${PASS_GATE}% pass mark. Clear this first.`
      : area.band === 'needs_practice'
        ? `At ${mastery}% — a focused drill should push it over the line.`
        : `Just ${gap} point${gap === 1 ? '' : 's'} from passing. One more pass locks it in.`;

  const impactText =
    area.band === 'almost_fixed'
      ? `${gap} pts to pass`
      : impact >= 1
        ? `−${impact}% readiness`
        : `${gap} pts to pass`;

  return (
    <article className={styles.card}>
      <div className={styles.cardTop}>
        <h3 className={styles.cardTitle}>{area.title}</h3>
        <span className={`${styles.bandBadge} ${meta.badge}`}>{meta.label}</span>
      </div>

      <div className={styles.masteryRow}>
        <span className={styles.bar} aria-hidden>
          <span className={styles.barFill} style={{ width: `${mastery}%`, background: meta.bar }} />
        </span>
        <span className={styles.masteryLabel}>{mastery}% mastery</span>
      </div>

      <p className={styles.note}>{note}</p>

      <div className={styles.metaRow}>
        <span className={styles.sourceChip}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 14 }}>{sourceIcon}</span>
          <span className={styles.sourceText}>{sourceLabel}</span>
        </span>
        <span className={`${styles.impactChip} ${meta.chip}`}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 14 }}>insights</span>
          {impactText}
        </span>
      </div>

      <div className={styles.ctaRow}>
        <WeakSessionButton pathId={pathId} router={router} label="Practice" icon="play_arrow" variant="primary" />
        <Link href={reviewHref} className={styles.ctaOutline}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 17 }}>menu_book</span>
          Review theory
        </Link>
      </div>
      <div className={styles.ctaRow}>
        <WeakSessionButton pathId={pathId} router={router} label="Drill" icon="bolt" variant="compact" />
        <button type="button" className={styles.ctaOutline} onClick={onAskMage}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 17 }}>auto_awesome</span>
          Ask Mage
        </button>
      </div>
    </article>
  );
}

// ─── Weak-point practice launcher (reuses the hub's proven action) ────────────

/**
 * POSTs START_WEAK_TOPIC_SESSION against the linked PATH context (path-scoped +
 * Pro-gated; see deriveAllowedActions), then navigates to the cream run surface
 * the API returns. Pro / quota / empty failures surface inline (primary/block)
 * or via title (compact) rather than hiding the control. Mirrors the Exam Path
 * hub so both surfaces behave identically.
 */
function WeakSessionButton({
  pathId,
  router,
  label,
  icon,
  variant,
}: {
  pathId: string | null;
  router: ReturnType<typeof useRouter>;
  label: string;
  icon: string;
  variant: 'primary' | 'compact' | 'block';
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const start = async () => {
    if (busy || !pathId) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/mage/practice-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'START_WEAK_TOPIC_SESSION', context: { type: 'path', ids: { pathId } } }),
      });
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; data?: { quizUrl?: string }; error?: string }
        | null;
      const quizUrl = json?.data?.quizUrl;
      if (res.ok && json?.success && quizUrl) {
        router.push(quizUrl);
        return;
      }
      setErr(
        res.status === 403
          ? 'Weak-point practice is a Pro feature.'
          : res.status === 429
            ? json?.error ?? 'You’ve used up your practice-generation allowance for now.'
            : res.status === 400
              ? 'Study a bit more first — not enough graded material yet.'
              : json?.error ?? 'Mage couldn’t build a practice set. Try again in a moment.',
      );
      setBusy(false);
    } catch {
      setErr('Network error — please try again.');
      setBusy(false);
    }
  };

  const cls =
    variant === 'primary' ? styles.ctaPrimary : variant === 'compact' ? styles.ctaCompact : styles.fixAllBtn;

  return (
    <>
      <button type="button" className={cls} onClick={start} disabled={busy || !pathId} title={!pathId ? 'Link a learning path to this exam first' : err ?? undefined}>
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: variant === 'compact' ? 16 : 18 }}>{icon}</span>
        {busy ? (variant === 'compact' ? '…' : 'Building…') : label}
      </button>
      {err && variant !== 'compact' ? <p role="alert" className={styles.cardErr}>{err}</p> : null}
    </>
  );
}

// ─── Concept-level link-out (plan §6.1 — additive, not a replacement) ────────

/**
 * Compact banner pointing at `/profile/weak-spots`, the concept-level
 * counterpart to this slot-level screen. Its `count` is derived server-side
 * from the SAME `deriveConceptWeakAreas` function the Weak Spots page calls
 * (scoped to this exam's primary path), so the two surfaces can never
 * disagree on severity — see `page.tsx`. Renders nothing when there's no
 * concept-level signal (flag off, no primary path, or zero weak concepts) so
 * there is no regression to the existing slot-level screen.
 */
function ConceptLinkOutBanner({ count }: { count?: number }) {
  if (!count || count <= 0) return null;
  return (
    <Link href="/profile/weak-spots" className={styles.conceptBanner}>
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>psychology</span>
      <span className={styles.conceptBannerText}>
        {count} concept-level weak {count === 1 ? 'spot' : 'spots'} detected
      </span>
      <span className={styles.conceptBannerLink}>
        See details
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16 }}>arrow_forward</span>
      </span>
    </Link>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function Stat({ value, label, tone }: { value: number | string; label: string; tone?: 'urgent' | 'needs' | 'almost' | 'accent' }) {
  const toneClass =
    tone === 'urgent' ? styles.statUrgent : tone === 'needs' ? styles.statNeeds : tone === 'almost' ? styles.statAlmost : tone === 'accent' ? styles.statAccent : '';
  return (
    <span className={styles.statChip}>
      <span className={`${styles.statValue} ${toneClass}`}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </span>
  );
}

function EmptyState({
  hasGraded,
  attempted,
  examId,
  missionHref,
}: {
  hasGraded: boolean;
  attempted: boolean;
  examId: string;
  missionHref: string;
}) {
  // Three honest cases: nothing scoped → add coverage; scoped-but-untouched →
  // study to generate signal; all graded material above the gate → all clear.
  if (!hasGraded) {
    return (
      <Empty
        title="Nothing to analyze yet"
        body="Add a quiz or learning path to this exam’s coverage so Mage can track your readiness and flag weak spots."
        action={<Link href={`/exam/${examId}?edit=scope`} className={`${ui.btn} ${ui.primary}`}>Set coverage</Link>}
      />
    );
  }
  if (!attempted) {
    return (
      <Empty
        title="No weak areas yet"
        body="Complete a few missions or a mock so Mage can spot what needs practice."
        action={
          <Link href={missionHref} className={`${ui.btn} ${ui.primary}`}>
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 19 }}>play_arrow</span>
            Start a mission
          </Link>
        }
      />
    );
  }
  return (
    <Empty
      tone="good"
      title="No weak areas — nice work"
      body="Every scored topic is above your pass mark. Keep it warm and rehearse with a mock closer to the day."
      action={<Link href={`/exam/${examId}`} className={`${ui.btn} ${ui.secondary}`}>Back to exam</Link>}
    />
  );
}

function Empty({ title, body, action, tone }: { title: string; body: string; action: React.ReactNode; tone?: 'good' }) {
  return (
    <section className={styles.empty}>
      <span className={`${styles.emptyTile} ${tone === 'good' ? styles.emptyTileGood : ''}`}>
        {tone === 'good' ? (
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 34 }}>check_circle</span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/mascot/holding-wand-v2.png" alt="" className={styles.emptyMascot} />
        )}
      </span>
      <h2 className={styles.emptyTitle}>{title}</h2>
      <p className={styles.emptyText}>{body}</p>
      <div className={styles.emptyActions}>{action}</div>
    </section>
  );
}

