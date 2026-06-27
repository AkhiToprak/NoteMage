'use client';

import { useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import OnboardingShell from '@/components/onboarding/OnboardingShell';
import { getOnboardingDraft, patchOnboardingDraft } from '@/lib/onboarding-handoff';
import styles from '@/components/onboarding/OnboardingContent.module.css';

/* Figma "W04 Goal" (node 14:587) — step 2 of the setup wizard. Source-users land
   here (the bridge completed step 1, Add material); no-source users arrive from
   W03. The goal seeds from the draft (the bridge's pick) and persists onward. */

const noopSubscribe = () => () => {};

const GOALS = [
  { id: 'exam', label: 'Exam', desc: 'Prioritize high-yield questions', icon: 'track_changes', banner: 'Mage will prioritize likely exam questions and weak-point reviews.' },
  { id: 'understand', label: 'Understand', desc: 'Deeper explanations and examples', icon: 'lightbulb', banner: 'Mage will favour clear explanations and worked examples.' },
  { id: 'memorize', label: 'Memorize', desc: 'Flashcards and recall practice', icon: 'style', banner: 'Mage will lean on flashcards and spaced recall.' },
  { id: 'weak', label: 'Weak points', desc: 'Train what you struggle with', icon: 'exercise', banner: 'Mage will focus on the topics you keep getting wrong.' },
  { id: 'homework', label: 'Homework', desc: 'Clear talking points and structure', icon: 'assignment', banner: 'Mage will lay out clear talking points and structure.' },
] as const;

const SparkPurple = (
  <svg viewBox="0 0 18 18" fill="none" aria-hidden focusable="false">
    <path d="M9 0L11.291 6.70897L18 9L11.291 11.291L9 18L6.70897 11.291L0 9L6.70897 6.70897L9 0Z" fill="#7C5CFF" />
  </svg>
);

export default function GoalPage() {
  const router = useRouter();
  // Seed from the draft (the bridge's goal) without a setState-in-effect or a
  // hydration mismatch; the user's own pick overrides once they tap a card.
  const seeded = useSyncExternalStore(noopSubscribe, () => getOnboardingDraft().goal ?? '', () => '');
  const [picked, setPicked] = useState<string | null>(null);
  const goal = picked ?? (seeded || 'exam');
  const active = GOALS.find((g) => g.id === goal) ?? GOALS[0];

  const onContinue = () => {
    patchOnboardingDraft({ goal });
    router.push('/start/rhythm');
  };

  return (
    <OnboardingShell
      step={2}
      bubble="I'll use your goal to shape the path."
      onBack={() => router.back()}
      onContinue={onContinue}
    >
      <h1 className={styles.heading}>What are you preparing for?</h1>
      <p className={styles.subtitle}>Mage will use this to decide what to explain, quiz, and review.</p>

      <div className={styles.cardGrid}>
        {GOALS.map((g) => {
          const isActive = g.id === goal;
          return (
            <button
              key={g.id}
              type="button"
              className={`${styles.card} ${isActive ? styles.cardActive : ''}`}
              aria-pressed={isActive}
              onClick={() => setPicked(g.id)}
            >
              <span className={styles.cardTile}>
                <span className="material-symbols-outlined" aria-hidden>{g.icon}</span>
              </span>
              <p className={styles.cardTitle}>{g.label}</p>
              <p className={styles.cardDesc}>{g.desc}</p>
              {isActive && <span className={styles.cardCheck} aria-hidden>✓</span>}
            </button>
          );
        })}
      </div>

      <div className={styles.banner}>
        <span className={styles.bannerSpark}>{SparkPurple}</span>
        <span className={styles.bannerText}>{active.banner}</span>
      </div>
    </OnboardingShell>
  );
}
