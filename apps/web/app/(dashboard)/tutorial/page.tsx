'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NMCard } from '@/components/rework/NMCard';
import { ProgressBar } from '@/components/rework/ProgressBar';
import { Button } from '@/components/ui/Button';
import { TutorialNarrator } from '@/components/tutorial2/TutorialNarrator';
import type { MascotPose } from '@/components/mascot/poses';
import { SAMPLE_CATALOG, SAMPLE_IDS, isSampleId, type SampleId } from '@/lib/sample-paths/catalog';
import { trackEvent } from '@/lib/telemetry';

// Guided tutorial — pick a sample subject → watch the (simulated) study-pack +
// path build → hand off into the REAL path player on the first section. The
// data is materialized for real (POST /api/tutorial/sample) behind the
// animation; the build steps are theater so a new user feels the full flow
// without uploading anything. See plans + src/lib/sample-paths/*.

type Phase = 'pick' | 'build-pack' | 'build-path' | 'error';

interface SampleResult {
  planId: string;
  firstSlotId: string | null;
  firstActivityId: string | null;
}

const PACK_STEPS = ['Reading the material', 'Finding the key topics', 'Bundling your study pack'];
const PATH_STEPS = ['Sequencing the lessons', 'Writing flashcards & a quiz', 'Building your path'];
const STAGE_MS = 2600;

export default function TutorialPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('pick');
  const [sampleId, setSampleId] = useState<SampleId | null>(null);
  const [result, setResult] = useState<SampleResult | null>(null);
  const [packReady, setPackReady] = useState(false);
  const startedRef = useRef(false);

  // Read ?sample= once (client-only — avoids the useSearchParams prerender
  // bailout). A valid value skips the picker straight into the build.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('sample');
    if (raw && isSampleId(raw)) {
      // Mount-time read of the query param (a lazy initializer would mismatch
      // hydration since window is unavailable during SSR).
      /* eslint-disable react-hooks/set-state-in-effect */
      setSampleId(raw);
      setPhase('build-pack');
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, []);

  // Kick off the real materialization the moment we enter build-pack.
  const materialize = useCallback((id: SampleId) => {
    startedRef.current = true;
    trackEvent('tutorial.sample.start', { sampleId: id });
    fetch('/api/tutorial/sample', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sampleId: id }),
    })
      .then((r) => r.json())
      .then((body: { success?: boolean; data?: SampleResult }) => {
        if (body.success && body.data?.planId) {
          setResult({
            planId: body.data.planId,
            firstSlotId: body.data.firstSlotId,
            firstActivityId: body.data.firstActivityId,
          });
          setPackReady(true);
        } else {
          setPhase('error');
        }
      })
      .catch(() => setPhase('error'));
  }, []);

  useEffect(() => {
    if (phase === 'build-pack' && sampleId && !startedRef.current) {
      materialize(sampleId);
    }
  }, [phase, sampleId, materialize]);

  const pick = (id: SampleId) => {
    setSampleId(id);
    setPhase('build-pack');
  };

  const retry = () => {
    if (!sampleId) {
      setPhase('pick');
      return;
    }
    startedRef.current = false;
    setResult(null);
    setPackReady(false);
    setPhase('build-pack');
  };

  const enterPath = useCallback(() => {
    if (!result) return;
    trackEvent('tutorial.sample.enter', { planId: result.planId });
    const params = new URLSearchParams();
    if (result.firstSlotId) params.set('slot', result.firstSlotId);
    if (result.firstActivityId) params.set('activity', result.firstActivityId);
    params.set('tutorial', '1');
    router.push(`/learn/paths/${encodeURIComponent(result.planId)}?${params.toString()}`);
  }, [result, router]);

  const meta = sampleId ? SAMPLE_CATALOG[sampleId] : null;

  return (
    <div
      className="nm-rework"
      style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
    >
      <div
        style={{
          margin: 'auto',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'clamp(20px, 5vw, 48px)',
          gap: 'var(--space-8)',
        }}
      >
        {phase === 'pick' && <SubjectPicker onPick={pick} />}

      {phase === 'build-pack' && meta && (
        <BuildStage
          key="pack"
          title="Building your study pack"
          accentColor={meta.color}
          pose="holding-pen"
          steps={PACK_STEPS}
          waiting={!packReady}
          onDone={() => setPhase('build-path')}
        />
      )}

      {phase === 'build-path' && meta && (
        <BuildStage
          key="path"
          title="Generating your learning path"
          accentColor={meta.color}
          pose="holding-wand"
          steps={PATH_STEPS}
          waiting={false}
          onDone={enterPath}
        />
      )}

      {phase === 'error' && (
        <div style={{ textAlign: 'center', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', alignItems: 'center' }}>
          <TutorialNarrator
            pose="default"
            caption="Hmm, that didn't go through. Mind trying that again?"
          />
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <Button variant="primary" shape="pill" leadingIcon="refresh" onClick={retry}>
              Try again
            </Button>
            <Button variant="ghost" shape="pill" href="/dashboard">
              Back to home
            </Button>
          </div>
        </div>
      )}
      </div>

      <style>{`
        @keyframes nmTutorialIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
        }
        a:focus-visible, button:focus-visible {
          outline: 3px solid var(--primary);
          outline-offset: 3px;
          border-radius: var(--radius-sm);
        }
      `}</style>
    </div>
  );
}

// ── Subject picker ────────────────────────────────────────────────────────────

function SubjectPicker({ onPick }: { onPick: (id: SampleId) => void }) {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: 'var(--nm-page-max)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-8)',
        animation: 'nmTutorialIn var(--dur-normal) var(--ease-spring)',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 540, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', alignItems: 'center' }}>
        <TutorialNarrator pose="holding-scroll" />
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(var(--fs-xl), 4vw, var(--fs-2xl))',
            fontWeight: 800,
            color: 'var(--on-surface)',
            margin: 0,
            letterSpacing: '-0.03em',
          }}
        >
          Try a sample subject
        </h1>
      </div>

      <div
        style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
          gap: 'var(--space-6)',
        }}
      >
        {SAMPLE_IDS.map((id) => {
          const m = SAMPLE_CATALOG[id];
          return (
            <NMCard
              key={id}
              interactive
              onClick={() => onPick(id)}
              style={{
                padding: 'clamp(18px, 2.5vw, 24px)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
                minHeight: 184,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                <span
                  className="material-symbols-outlined"
                  aria-hidden
                  style={{
                    fontSize: 32,
                    color: m.color,
                    width: 52,
                    height: 52,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 'var(--radius-md)',
                    background: `color-mix(in srgb, ${m.color} 16%, transparent)`,
                  }}
                >
                  {m.icon}
                </span>
                <span
                  style={{
                    fontSize: 'var(--fs-xs)',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: m.color,
                    background: `color-mix(in srgb, ${m.color} 14%, transparent)`,
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-full)',
                  }}
                >
                  Example
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <h2
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--fs-lg)',
                    fontWeight: 800,
                    color: 'var(--on-surface)',
                    margin: 0,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {m.label}
                </h2>
                <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--on-surface-variant)', margin: 0 }}>
                  {m.topic}
                </p>
              </div>
              <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--on-surface-variant)', margin: 0, lineHeight: 1.6 }}>
                {m.blurb}
              </p>
              <span
                style={{
                  marginTop: 'auto',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 'var(--fs-sm)',
                  fontWeight: 700,
                  color: m.color,
                }}
              >
                Start
                <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>
                  arrow_forward
                </span>
              </span>
            </NMCard>
          );
        })}
      </div>
    </div>
  );
}

// ── Simulated build stage ─────────────────────────────────────────────────────

function BuildStage({
  title,
  accentColor,
  pose,
  steps,
  waiting,
  onDone,
}: {
  title: string;
  accentColor: string;
  pose: MascotPose;
  steps: string[];
  waiting: boolean;
  onDone: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const firedRef = useRef(false);

  useEffect(() => {
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const pct = Math.min(100, ((t - start) / STAGE_MS) * 100);
      setProgress(pct);
      if (pct < 100) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const animDone = progress >= 100;
  useEffect(() => {
    if (animDone && !waiting && !firedRef.current) {
      firedRef.current = true;
      onDone();
    }
  }, [animDone, waiting, onDone]);

  // While animating, walk the steps; if the data is still landing after the bar
  // fills, hold on the last step rather than stalling at a blank state.
  const activeStep = animDone
    ? steps.length - 1
    : Math.min(steps.length - 1, Math.floor((progress / 100) * steps.length));

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 520,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-8)',
        animation: 'nmTutorialIn var(--dur-normal) var(--ease-spring)',
      }}
    >
      <TutorialNarrator pose={pose} caption={title} />

      <NMCard style={{ width: '100%', padding: 'clamp(18px, 2.5vw, 28px)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <ProgressBar value={Math.round(progress)} color={accentColor} height={10} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {steps.map((label, i) => {
            const done = i < activeStep || (animDone && !waiting);
            const active = i === activeStep && !done;
            return (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 28 }}>
                <span
                  className="material-symbols-outlined"
                  aria-hidden
                  style={{
                    fontSize: 22,
                    color: done ? accentColor : active ? 'var(--on-surface)' : 'var(--on-surface-variant)',
                    opacity: done || active ? 1 : 0.45,
                  }}
                >
                  {done ? 'check_circle' : active ? 'progress_activity' : 'radio_button_unchecked'}
                </span>
                <span
                  style={{
                    fontSize: 'var(--fs-sm)',
                    fontFamily: 'var(--font-sans)',
                    fontWeight: active || done ? 600 : 500,
                    color: done || active ? 'var(--on-surface)' : 'var(--on-surface-variant)',
                    opacity: done || active ? 1 : 0.6,
                  }}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
        {animDone && waiting && (
          <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--on-surface-variant)', margin: 0, textAlign: 'center', opacity: 0.7 }}>
            Almost there…
          </p>
        )}
      </NMCard>
    </div>
  );
}
