import { redirect } from 'next/navigation';
import { getServerUserId } from '@/lib/server-auth';
import { weaknessConceptsEnabled } from '@/lib/feature-flags';
import { deriveConceptWeakAreas } from '@/lib/concept-weak-areas';
import { loadConceptWeakAreaRows } from '@/lib/concept-weak-areas-loader';
import type { MasteryBand } from '@/lib/concept-mastery';
import ui from '@/components/app/ui.module.css';

/**
 * Weakness Training Phase 1A — internal/debug read-only view (plan §8
 * "Minimal read-only surface"). NOT polished UI: no "Train this" button, no
 * generation, no `/profile/weak-spots` styling — exists only to validate that
 * `deriveConceptWeakAreas()` produces trustworthy signal against real
 * `ConceptMastery` rows before the user-facing surface (Phase 1B) is built.
 * Data load goes through `loadConceptWeakAreaRows` (Phase 4.1a §11.5) same
 * as every other weak-area surface.
 *
 * Gated by `weaknessConceptsEnabled()` (`WEAKNESS_TRAINING_CONCEPTS=1`) — with
 * the flag off, no data fetch happens at all and a terse disabled message
 * renders instead.
 */

export const dynamic = 'force-dynamic';

const BAND_LABEL: Record<MasteryBand, string> = {
  untested: 'Untested',
  weak: 'Weak',
  building: 'Building',
  solid: 'Solid',
  strengthening: 'Strengthening',
  rusty: 'Rusty',
};

export default async function WeakSpotsDebugPage() {
  if (!weaknessConceptsEnabled()) {
    return (
      <div style={{ padding: 24 }}>
        <p className={ui.sub}>Weakness diagnosis is disabled.</p>
      </div>
    );
  }

  const userId = await getServerUserId();
  if (!userId) redirect('/auth/login');

  const now = new Date();
  const concepts = await loadConceptWeakAreaRows(userId);

  const result = deriveConceptWeakAreas({ concepts, now, scope: { scope: 'all-paths' } });

  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
      <h1 className={ui.h1} style={{ fontSize: 22 }}>
        Weak spots — debug
      </h1>
      <p className={ui.sub}>
        Internal validation view. {concepts.length} concept{concepts.length === 1 ? '' : 's'} loaded.
      </p>

      <div style={{ marginTop: 16, fontSize: 13, color: 'var(--body)' }}>
        <div>Cold-start state: <strong style={{ color: 'var(--ink)' }}>{result.coldStart}</strong></div>
        <div>
          Coverage: {result.coverage.concentratedConcepts}/{result.coverage.totalConcepts} concepts with enough data (
          {(result.coverage.fraction * 100).toFixed(1)}%)
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        {result.areas.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>No weak or rusty concepts to show.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {result.areas.map((area) => (
              <li
                key={area.conceptId}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--rm)',
                  padding: 12,
                  background: 'var(--surface)',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                  {area.label} — {BAND_LABEL[area.band]}
                </div>
                <div style={{ fontSize: 12, color: 'var(--body)', marginTop: 4 }}>
                  masteryScore: {area.masteryScore.toFixed(1)} · lcb: {area.lcb.toFixed(3)} · weightedTotal:{' '}
                  {area.weightedTotal.toFixed(2)} · impact: {area.impact} ({area.impactPoints.toFixed(3)})
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{area.whyFlagged}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <details style={{ marginTop: 24 }}>
        <summary style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
          All concepts (incl. untested/building/solid)
        </summary>
        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {concepts.map((m) => (
            <li key={m.conceptId} style={{ fontSize: 12, color: 'var(--body)' }}>
              {m.label} — cached status: {m.status} · weightedCorrect: {m.weightedCorrect.toFixed(2)} ·
              weightedTotal: {m.weightedTotal.toFixed(2)} · peakLcb: {m.peakLcb.toFixed(3)} · lastAttemptAt:{' '}
              {m.lastAttemptAt ? m.lastAttemptAt.toISOString() : 'never'}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
