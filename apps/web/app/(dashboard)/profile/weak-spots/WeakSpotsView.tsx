'use client';

/* Weakness Training Phase 1B — user-facing "Weak spots" view (plan §6.1,
 * §6.3, §6.5, §7.2). Renders inside the existing cream AppShell (no new
 * sidebar slot). Three-state cold-start:
 *   - no_data_yet: encourage more studying, no fake progress bar
 *   - all_clear: calm reassurance + a secondary practice CTA, no fake bar
 *   - weak_spots_found: cards grouped weak-first-then-rusty, ranked by
 *     impactPoints (already sorted server-side), each with a "Train this" CTA
 *
 * "Train this" POSTs { conceptId } to /api/weakness/sessions and follows the
 * same busy/err per-button idiom as the Exam Weak Areas view
 * (`exam/[id]/weak-areas/WeakAreasView.tsx`'s `WeakSessionButton`): 403 → Pro
 * upsell line (no modal — that split is Phase 2), 429 → daily-cap message,
 * other → terse retry message. Diagnosis cards stay visible regardless
 * (viewing is free; only training is gated).
 *
 * Copy is STRICT per plan §6.5: "Weak spots" / "Weak spots from your recent
 * paths" / "Areas to review." — never "your mastery map" or anything implying
 * a unified cross-path learner model.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/app/AppShell';
import ui from '@/components/app/ui.module.css';
import styles from './WeakSpots.module.css';
import type {
  ConceptWeakArea,
  ConceptWeakAreaCoverage,
  ConceptWeakAreaColdStart,
} from '@/lib/concept-weak-areas';

// Weakness Training Phase 4.2b (plan phase4 §11.6) — additive: `mergedSlotCount`
// comes from the loader (`ConceptWeakAreaRowWithMergeInfo`, §10.2) and is
// joined onto each area server-side (page.tsx), since `deriveConceptWeakAreas`
// itself never carries it through (stays untouched/pure, plan §12.6). Optional
// so a card can render without it (e.g. a debug/test caller that only has
// plain `ConceptWeakArea`s).
export interface WeakSpotAreaWithMergeInfo extends ConceptWeakArea {
  mergedSlotCount?: number;
}

export interface WeakSpotsData {
  areas: WeakSpotAreaWithMergeInfo[];
  byBand: Record<'weak' | 'rusty', WeakSpotAreaWithMergeInfo[]>;
  coverage: ConceptWeakAreaCoverage;
  coldStart: ConceptWeakAreaColdStart;
  /** Weakness Training Phase 4.2b (plan §11.6) — per-user gate, no flag: true
   *  only when at least one area's `mergedSlotCount > 1`. Drives the subtitle
   *  promotion in `WeakSpotsBody` below. */
  hasMultiSlotMerge?: boolean;
}

const BAND_META: Record<'weak' | 'rusty', { label: string; chip: string; dot: string }> = {
  weak: { label: 'Weak', chip: styles.chipWeak, dot: 'var(--st-red-strong, #d4592f)' },
  rusty: { label: 'Might be rusty', chip: styles.chipRusty, dot: 'var(--amber)' },
};

export default function WeakSpotsView({ data, isPro }: { data: WeakSpotsData; isPro: boolean }) {
  return (
    <AppShell width="narrow">
      <WeakSpotsBody data={data} isPro={isPro} />
    </AppShell>
  );
}

function WeakSpotsBody({ data, isPro }: { data: WeakSpotsData; isPro: boolean }) {
  const { coldStart, coverage } = data;
  // Weakness Training Phase 4.2b (plan §11.6) — per-user gate, no flag:
  // promoted copy renders only when the user actually has a multi-slot merge
  // group; everyone else keeps today's copy verbatim.
  const subtitle = data.hasMultiSlotMerge ? 'Weak spots across your paths' : 'Weak spots from your recent paths';

  return (
    <div className={styles.page}>
      <header className={ui.header}>
        <div>
          <h1 className={ui.h1}>Weak spots</h1>
          <p className={ui.sub}>{subtitle}</p>
        </div>
      </header>

      {coldStart === 'no_data_yet' && <NoDataYet coverage={coverage} />}
      {coldStart === 'all_clear' && <AllClear coverage={coverage} />}
      {coldStart === 'weak_spots_found' && <WeakSpotsFound data={data} isPro={isPro} />}
    </div>
  );
}

// ─── Cold-start states ──────────────────────────────────────────────────────

function NoDataYet({ coverage }: { coverage: ConceptWeakAreaCoverage }) {
  return (
    <section className={styles.emptyState}>
      <span className={styles.emptyTile} aria-hidden>
        <span className="material-symbols-outlined" style={{ fontSize: 32 }}>
          hourglass_top
        </span>
      </span>
      <h2 className={styles.emptyTitle}>Not enough data yet</h2>
      <p className={styles.emptyText}>
        Keep studying — weak-spot detection needs a few more quizzes to kick in.
      </p>
      {coverage.totalConcepts > 0 && (
        <p className={styles.coverageNote}>
          {coverage.concentratedConcepts} of {coverage.totalConcepts} concepts measured
        </p>
      )}
    </section>
  );
}

function AllClear({ coverage }: { coverage: ConceptWeakAreaCoverage }) {
  return (
    <section className={styles.emptyState}>
      <span className={`${styles.emptyTile} ${styles.emptyTileGood}`} aria-hidden>
        <span className="material-symbols-outlined" style={{ fontSize: 32 }}>
          check_circle
        </span>
      </span>
      <h2 className={styles.emptyTitle}>Nothing flagged right now</h2>
      <p className={styles.emptyText}>Everything we've measured is holding up. Keep it that way.</p>
      <p className={styles.coverageNote}>
        Based on {coverage.concentratedConcepts} of {coverage.totalConcepts} concepts measured
      </p>
      <div className={styles.emptyActions}>
        <Link href="/learn" className={`${ui.btn} ${ui.secondary}`}>
          Practice anyway
        </Link>
      </div>
    </section>
  );
}

// ─── Weak spots found ───────────────────────────────────────────────────────

function WeakSpotsFound({ data, isPro }: { data: WeakSpotsData; isPro: boolean }) {
  const { byBand, coverage } = data;
  const [activeConceptId, setActiveConceptId] = useState<string | null>(null);
  const router = useRouter();

  const groups: { band: 'weak' | 'rusty'; areas: WeakSpotAreaWithMergeInfo[] }[] = (
    [
      { band: 'weak', areas: byBand.weak },
      { band: 'rusty', areas: byBand.rusty },
    ] as const
  ).filter((g) => g.areas.length > 0);

  return (
    <section className={styles.section}>
      <div>
        <div className={ui.sectionLabel}>
          Areas to review
          <span className={ui.count}>{data.areas.length}</span>
        </div>
        <p className={styles.coverageNote}>
          {coverage.concentratedConcepts} of {coverage.totalConcepts} concepts measured
        </p>
      </div>

      <div className={styles.groups}>
        {groups.map(({ band, areas }) => (
          <div key={band} className={styles.group}>
            <div className={styles.groupHead}>
              <span className={ui.dot} style={{ background: BAND_META[band].dot }} />
              <h2 className={styles.groupTitle}>{BAND_META[band].label}</h2>
              <span className={styles.groupCount}>{areas.length}</span>
            </div>
            <div className={styles.cardGrid}>
              {areas.map((area) => (
                <WeakSpotCard
                  key={area.conceptId}
                  area={area}
                  isPro={isPro}
                  disabled={activeConceptId !== null && activeConceptId !== area.conceptId}
                  onStart={() => setActiveConceptId(area.conceptId)}
                  onSettle={() => setActiveConceptId(null)}
                  router={router}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// Weakness Training Phase 4.2b — informational-only lines shared by both the
// free and Pro card variants (§12.6 "no new CTA"; §11.6 "additive to
// buildWhyFlagged's existing line"). Rendered directly under `whyFlagged`.
function CardMetaLines({ area }: { area: WeakSpotAreaWithMergeInfo }) {
  return (
    <>
      {area.upstreamGap && (
        <p className={styles.upstreamHint}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 15 }}>
            link
          </span>
          Often traces back to <strong>{area.upstreamGap.label}</strong>
        </p>
      )}
      {typeof area.mergedSlotCount === 'number' && area.mergedSlotCount > 1 && (
        <p className={styles.mergedNote}>Seen in {area.mergedSlotCount} places</p>
      )}
    </>
  );
}

function WeakSpotCard({
  area,
  isPro,
  disabled,
  onStart,
  onSettle,
  router,
}: {
  area: WeakSpotAreaWithMergeInfo;
  isPro: boolean;
  disabled: boolean;
  onStart: () => void;
  onSettle: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const meta = BAND_META[area.band];

  if (!isPro) {
    return (
      <article className={styles.card}>
        <div className={styles.cardTop}>
          <h3 className={styles.cardTitle}>{area.label}</h3>
          <span className={`${styles.bandBadge} ${meta.chip}`}>{meta.label}</span>
        </div>

        <p className={styles.why}>{area.whyFlagged}</p>
        <CardMetaLines area={area} />

        <div className={`${styles.ctaRow} ${styles.ctaRowSplit}`}>
          <Link href="/pricing" className={`${ui.btn} ${ui.primary}`}>
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>
              bolt
            </span>
            Upgrade to train this
          </Link>
          <Link href={`/learn/paths/${area.planId}?slot=${area.slotId}`} className={`${ui.btn} ${ui.secondary}`}>
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>
              menu_book
            </span>
            Review theory
          </Link>
        </div>
      </article>
    );
  }

  return <ProWeakSpotCard area={area} disabled={disabled} onStart={onStart} onSettle={onSettle} router={router} />;
}

function ProWeakSpotCard({
  area,
  disabled,
  onStart,
  onSettle,
  router,
}: {
  area: WeakSpotAreaWithMergeInfo;
  disabled: boolean;
  onStart: () => void;
  onSettle: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const meta = BAND_META[area.band];

  const trainThis = async () => {
    if (busy || disabled) return;
    setBusy(true);
    setErr(null);
    onStart();
    try {
      const res = await fetch('/api/weakness/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conceptId: area.conceptId }),
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
          ? 'Training is a Pro feature.'
          : res.status === 429
            ? "You've hit today's training limit. Come back later."
            : "Couldn't start training. Try again.",
      );
      setBusy(false);
      onSettle();
    } catch {
      setErr("Couldn't start training. Try again.");
      setBusy(false);
      onSettle();
    }
  };

  return (
    <article className={styles.card}>
      <div className={styles.cardTop}>
        <h3 className={styles.cardTitle}>{area.label}</h3>
        <span className={`${styles.bandBadge} ${meta.chip}`}>{meta.label}</span>
      </div>

      <p className={styles.why}>{area.whyFlagged}</p>
      <CardMetaLines area={area} />

      <div className={styles.ctaRow}>
        <button
          type="button"
          className={`${ui.btn} ${ui.primary} ${styles.trainBtn}`}
          onClick={trainThis}
          disabled={busy || disabled}
        >
          {!busy && (
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>
              bolt
            </span>
          )}
          {busy ? 'Starting…' : 'Train this'}
        </button>
      </div>
      {err ? (
        <p role="alert" className={styles.cardErr}>
          {err}
        </p>
      ) : null}
    </article>
  );
}
