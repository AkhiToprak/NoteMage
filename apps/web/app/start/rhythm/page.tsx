'use client';

import { useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import OnboardingShell from '@/components/onboarding/OnboardingShell';
import { getOnboardingDraft, patchOnboardingDraft } from '@/lib/onboarding-handoff';
import styles from '@/components/onboarding/OnboardingContent.module.css';

/* Figma "W05 Intensity" (node 14:671) — step 3, "Choose your study rhythm".
   Session length seeds from the draft (bridge / W04); the last setup step, so
   Continue is "Build my path" → W06 Generating. */

const noopSubscribe = () => () => {};

const RHYTHMS: { min: number; label: string; recommended?: boolean }[] = [
  { min: 5, label: 'Quick review' },
  { min: 10, label: 'Small daily' },
  { min: 15, label: 'Just right', recommended: true },
  { min: 30, label: 'Deep focus' },
];

const DEADLINES = [
  { id: 'today', label: 'Today', phrase: 'for today' },
  { id: 'week', label: 'This week', phrase: 'for this week' },
  { id: 'month', label: '2–4 weeks', phrase: 'over the next few weeks' },
  { id: 'none', label: 'No deadline', phrase: 'at your own pace' },
] as const;

const SparkPurple = (
  <svg viewBox="0 0 18 18" fill="none" aria-hidden focusable="false">
    <path d="M9 0L11.291 6.70897L18 9L11.291 11.291L9 18L6.70897 11.291L0 9L6.70897 6.70897L9 0Z" fill="#7C5CFF" />
  </svg>
);

export default function RhythmPage() {
  const router = useRouter();
  const seeded = useSyncExternalStore(noopSubscribe, () => String(getOnboardingDraft().intensity ?? ''), () => '');
  const [pickedMin, setPickedMin] = useState<number | null>(null);
  const min = pickedMin ?? (seeded ? Number(seeded) : 15);
  const [deadline, setDeadline] = useState('week');
  const deadlinePhrase = DEADLINES.find((d) => d.id === deadline)?.phrase ?? 'for this week';

  const onContinue = () => {
    patchOnboardingDraft({ intensity: min });
    router.push('/start/building');
  };

  return (
    <OnboardingShell
      step={3}
      bubble="How should I split your path into sessions?"
      continueLabel="Build my path"
      onBack={() => router.back()}
      onContinue={onContinue}
    >
      <h1 className={styles.heading}>Choose your study rhythm</h1>
      <p className={styles.subtitle}>Short sessions make it easier to stay consistent.</p>

      <div className={styles.rhythmGrid}>
        {RHYTHMS.map((r) => {
          const isActive = r.min === min;
          return (
            <button
              key={r.min}
              type="button"
              className={`${styles.rhythmCard} ${isActive ? styles.rhythmCardActive : ''}`}
              aria-pressed={isActive}
              onClick={() => setPickedMin(r.min)}
            >
              {r.recommended && <span className={styles.recPill}>Recommended</span>}
              <span className={styles.rhythmIcon}>
                <span className="material-symbols-outlined" aria-hidden>schedule</span>
              </span>
              <span className={styles.rhythmNum}>{r.min} min</span>
              <span className={styles.rhythmLabel}>{r.label}</span>
            </button>
          );
        })}
      </div>

      <p className={styles.subhead}>When do you need this?</p>
      <div className={styles.chips}>
        {DEADLINES.map((d) => (
          <button
            key={d.id}
            type="button"
            className={`${styles.chip} ${deadline === d.id ? styles.chipActive : ''}`}
            aria-pressed={deadline === d.id}
            onClick={() => setDeadline(d.id)}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className={styles.banner}>
        <span className={styles.bannerSpark}>{SparkPurple}</span>
        <span className={styles.bannerText}>
          Your path will be split into {min}-minute sessions {deadlinePhrase}.
        </span>
      </div>
    </OnboardingShell>
  );
}
