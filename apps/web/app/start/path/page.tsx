/* eslint-disable @next/next/no-img-element */
'use client';

import { useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { getOnboardingDraft } from '@/lib/onboarding-handoff';
import {
  subscribePreview,
  getPreviewSnapshot,
  getPreviewServerSnapshot,
  type StoredPreview,
} from '@/lib/onboarding-preview-store';
import styles from './PathReveal.module.css';

/* Figma "W07 Path reveal" (node 14:789) — the path preview. Real-generation P3:
   when /start/building produced a real preview, the reveal reads its structure
   (nodes + honest counts), title, and source from the preview store. Without a
   preview (the demo path, or a failed/insufficient generation) it shows the
   illustrative static sample — same layout, hardcoded SQL content. The CTA leads
   into the first real lesson either way (sample run for the no-material branch). */

const noopSubscribe = () => () => {};

const SparkGold = (
  <svg viewBox="0 0 29 29" fill="none" aria-hidden focusable="false">
    <path d="M10.6066 0L17.1889 9.81239L28.9778 10.6066L19.1654 17.1889L18.3712 28.9778L11.7889 19.1655L0 18.3712L9.81237 11.7889L10.6066 0Z" fill="#FFC83D" />
  </svg>
);
const SparkPurple = (
  <svg viewBox="0 0 18 18" fill="none" aria-hidden focusable="false">
    <path d="M9 0L11.291 6.70897L18 9L11.291 11.291L9 18L6.70897 11.291L0 9L6.70897 6.70897L9 0Z" fill="#7C5CFF" />
  </svg>
);

const GOAL_LABELS: Record<string, string> = {
  exam: 'Exam', understand: 'Understand', memorize: 'Memorize', weak: 'Weak points', homework: 'Homework',
};

type MarkerKind = 'active' | 'num' | 'review' | 'exam';
type Node = { id: number; title: string; meta: string; metaKind?: 'gold' | 'red'; tag?: string; tagKind?: 'lav' | 'gold'; marker: MarkerKind; glyph: string };
const MARKER_CLASS: Record<MarkerKind, string> = {
  active: styles.markerActive,
  num: styles.markerNum,
  review: styles.markerReview,
  exam: styles.markerExam,
};

/* Static sample — the no-material fallback (kept verbatim from the Figma mock). */
const STATS = [
  { n: '6', l: 'Topics' },
  { n: '34', l: 'Key ideas' },
  { n: '18', l: 'Questions' },
  { n: '4', l: 'Reviews' },
];
const NODES: Node[] = [
  { id: 1, title: 'Database basics', meta: '10 min', tag: 'From pages 2–4', tagKind: 'lav', marker: 'active', glyph: '▶' },
  { id: 2, title: 'Tables and keys', meta: '12 min', tag: 'Appears often', tagKind: 'lav', marker: 'num', glyph: '2' },
  { id: 3, title: 'Relationships', meta: '15 min', tag: 'From slide 8', tagKind: 'lav', marker: 'num', glyph: '3' },
  { id: 4, title: 'Queries', meta: '15 min', tag: 'Likely exam topic', tagKind: 'gold', marker: 'num', glyph: '4' },
  { id: 5, title: 'Weak-point review', meta: 'Adaptive', metaKind: 'gold', marker: 'review', glyph: '↺' },
  { id: 6, title: 'Exam mode', meta: 'Final practice', metaKind: 'red', marker: 'exam', glyph: '★' },
];

/* ── Real preview → reveal data ─────────────────────────────────────────────── */

type SlotCounts = { learning: number; reviews: number; assessments: number };

function slotCounts(structure: StoredPreview['structure']): SlotCounts {
  const slots = structure.phases.flatMap((p) => p.slots);
  return {
    learning: slots.filter((s) => s.kind === 'learning').length,
    reviews: slots.filter((s) => s.kind === 'review').length,
    assessments: slots.filter((s) => s.kind === 'assessment').length,
  };
}

/** Map the generated skeleton to reveal nodes. First learning slot is the active
 *  one; reviews/assessments get the ↺/★ markers. No fabricated source tags — we
 *  only have the slot title, not real page/slide provenance pre-generation. */
function previewNodes(structure: StoredPreview['structure']): Node[] {
  const slots = structure.phases.flatMap((p) => p.slots);
  let learn = 0;
  return slots.map((slot, i): Node => {
    if (slot.kind === 'review') {
      return { id: i + 1, title: slot.title, meta: 'Review', metaKind: 'gold', marker: 'review', glyph: '↺' };
    }
    if (slot.kind === 'assessment') {
      return { id: i + 1, title: slot.title, meta: 'Checkpoint', metaKind: 'red', marker: 'exam', glyph: '★' };
    }
    learn += 1;
    const first = learn === 1;
    return { id: i + 1, title: slot.title, meta: 'Lesson', marker: first ? 'active' : 'num', glyph: first ? '▶' : String(learn) };
  });
}

function sourceSub(kind: StoredPreview['sourceKind']): string {
  if (kind === 'link') return 'Generated from your video';
  if (kind === 'notes') return 'Generated from your notes';
  return 'Generated from your upload';
}

export default function PathRevealPage() {
  const router = useRouter();
  const source = useSyncExternalStore(noopSubscribe, () => getOnboardingDraft().source ?? '', () => '');
  const goal = useSyncExternalStore(noopSubscribe, () => getOnboardingDraft().goal ?? 'exam', () => 'exam');
  const preview = useSyncExternalStore(subscribePreview, getPreviewSnapshot, getPreviewServerSnapshot);

  const isSource = source === 'upload' || source === 'link';
  const goalLabel = GOAL_LABELS[goal] ?? 'Exam';
  const hasPreview = !!preview;

  const counts = preview ? slotCounts(preview.structure) : null;
  const nodes = preview ? previewNodes(preview.structure) : NODES;
  const stats = preview && counts
    ? [
        { n: String(counts.learning), l: counts.learning === 1 ? 'Topic' : 'Topics' },
        { n: String(counts.reviews + counts.assessments), l: counts.reviews + counts.assessments === 1 ? 'Review' : 'Reviews' },
        { n: '1', l: 'Lesson' },
        { n: String(preview.questions.length), l: 'Questions' },
      ]
    : STATS;

  const title = hasPreview
    ? 'Your path is ready.'
    : isSource
      ? "Here's what I'd build."
      : 'Your path is ready.';
  const bubble = hasPreview && counts
    ? `I turned your material into ${counts.learning} ${counts.learning === 1 ? 'topic' : 'topics'} and a first lesson — try it now.`
    : isSource
      ? "I'd turn your material into 6 topics and a first session. Want to try a sample first?"
      : 'I found 6 topics, pulled the key ideas from your material, and prepared your first session.';
  const sumPill = hasPreview || isSource ? 'Built from your material' : 'Ready-made sample';
  const cardTitle = preview ? preview.title : 'SQL Databases';
  const sumSub = preview
    ? sourceSub(preview.sourceKind)
    : source === 'link'
      ? 'Generated from your video'
      : source === 'upload'
        ? 'Generated from your upload'
        : 'Generated from sample material';
  const timeBar = hasPreview ? `⏱  About ${nodes.length} short sessions` : '⏱  Estimated time · 2h 20m';
  const primaryLabel = hasPreview ? 'Start first section' : isSource ? 'Try a sample path' : 'Start first section';
  const secondaryLabel = hasPreview ? 'Sign up to save' : isSource ? 'No thanks — sign up' : 'Edit path';

  const onPrimary = () => router.push('/start/session');
  const onSecondary = () => (hasPreview || isSource ? router.push('/start/signup') : router.back());

  return (
    <div className={styles.root}>
      <span className={styles.logo} aria-hidden>
        <img src="/landing/notemage-wordmark.png" alt="NoteMage" width={80} height={30} />
      </span>

      <div className={styles.head}>
        <span className={`${styles.headSpk} ${styles.headSpkA}`} aria-hidden>{SparkGold}</span>
        <span className={`${styles.headSpk} ${styles.headSpkB}`} aria-hidden>{SparkPurple}</span>
        <h1 className={styles.title}>{title}</h1>
      </div>

      <div className={styles.bubbleRow}>
        <span className={styles.avatar}><img src="/landing/mage-plain.png" alt="" aria-hidden /></span>
        <span className={styles.bubble}>{bubble}</span>
      </div>

      <div className={styles.grid}>
        {/* summary */}
        <div className={styles.summary}>
          <div className={styles.sumHead}>
            <span className={styles.sumTile}><span className="material-symbols-outlined" aria-hidden>database</span></span>
            <div>
              <span className={styles.sumPill}>{sumPill}</span>
              <p className={styles.sumTitle}>{cardTitle}</p>
              <p className={styles.sumSub}>{sumSub}</p>
              <p className={styles.sumGoal}>Based on your goal: {goalLabel}</p>
            </div>
          </div>
          <div className={styles.sumDivider} />
          <div className={styles.stats}>
            {stats.map((s) => (
              <div key={s.l} className={styles.stat}>
                <div className={styles.statNum}>{s.n}</div>
                <div className={styles.statLabel}>{s.l}</div>
              </div>
            ))}
          </div>
          <div className={styles.timeBar}>{timeBar}</div>
        </div>

        {/* path */}
        <div className={styles.pathCol}>
          <p className={styles.pathHead}>Your learning path</p>
          <p className={styles.pathSub}>{nodes.length} steps · tap any node to preview</p>
          <div className={styles.path}>
            {nodes.map((n, i) => (
              <div key={n.id} className={styles.pnode}>
                {i < nodes.length - 1 && <span className={styles.pnodeLine} aria-hidden />}
                <span className={`${styles.marker} ${MARKER_CLASS[n.marker]}`} aria-hidden>
                  {n.glyph}
                </span>
                <div className={`${styles.node} ${n.marker === 'active' ? styles.nodeActive : ''}`}>
                  <div className={styles.nodeTitle}>{n.title}</div>
                  <div className={`${styles.nodeMeta} ${n.metaKind === 'gold' ? styles.nodeMetaGold : n.metaKind === 'red' ? styles.nodeMetaRed : ''}`}>{n.meta}</div>
                  {n.tag && <span className={`${styles.nodeTag} ${n.tagKind === 'gold' ? styles.nodeTagGold : styles.nodeTagLav}`}>{n.tag}</span>}
                </div>
              </div>
            ))}
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.btnPrimary} onClick={onPrimary}>
              {primaryLabel}
            </button>
            <button type="button" className={styles.btnGhost} onClick={onSecondary}>
              {secondaryLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
