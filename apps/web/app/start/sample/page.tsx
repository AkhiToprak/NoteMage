'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import OnboardingShell from '@/components/onboarding/OnboardingShell';
import { patchOnboardingDraft } from '@/lib/onboarding-handoff';
import styles from '@/components/onboarding/OnboardingContent.module.css';

/* Figma "W03 Sample" (node 14:518) — step 1 variant, "Choose a sample path".
   Reached when the user has no material of their own; picking a sample seeds the
   draft and proceeds to the goal step. */

const PACKS = [
  { id: 'bio', subject: 'Biology', topic: 'Cell Structure', icon: 'science', tileBg: '#e2f5eb', iconColor: '#0f6b3d', pill: 'Great for diagrams', pillBg: '#e2f5eb', pillColor: '#0f6b3d', desc: 'Definitions, diagrams, and short practice questions.' },
  { id: 'hist', subject: 'History', topic: 'Industrialisation', icon: 'account_balance', tileBg: '#fff3d6', iconColor: '#7a5200', pill: 'Great for essays', pillBg: '#fff3d6', pillColor: '#7a5200', desc: 'Timelines, causes, effects, and quiz practice.' },
  { id: 'cs', subject: 'Computer Science', topic: 'SQL Databases', icon: 'database', tileBg: '#ede9ff', iconColor: '#4326b8', pill: 'Great for technical', pillBg: '#ede9ff', pillColor: '#4326b8', desc: 'Core concepts, worked examples, and exam-style questions.' },
];

export default function SamplePage() {
  const router = useRouter();
  const [sel, setSel] = useState('cs');

  const onContinue = () => {
    patchOnboardingDraft({ source: 'sample' });
    router.push('/start/goal');
  };

  return (
    <OnboardingShell
      step={1}
      eyebrow={null}
      bubble="Pick a sample. I'll build a path, quiz you, and show how weak points work."
      continueLabel="Use this sample"
      onBack={() => router.back()}
      onContinue={onContinue}
    >
      <span className={styles.greenPill}>No upload needed</span>
      <h1 className={styles.heading}>Choose a sample path</h1>
      <p className={styles.subtitle}>Each sample is a real, ready-made path so you can feel the full experience.</p>

      <div className={styles.packGrid}>
        {PACKS.map((p) => {
          const active = p.id === sel;
          return (
            <button
              key={p.id}
              type="button"
              className={`${styles.pack} ${active ? styles.packActive : ''}`}
              aria-pressed={active}
              onClick={() => setSel(p.id)}
            >
              <span className={styles.packTile} style={{ background: p.tileBg, color: p.iconColor }}>
                <span className="material-symbols-outlined" aria-hidden>{p.icon}</span>
              </span>
              <span className={styles.packTitle}>{p.subject}</span>
              <span className={styles.packTopic}>{p.topic}</span>
              <span className={styles.packPill} style={{ background: p.pillBg, color: p.pillColor }}>{p.pill}</span>
              <span className={styles.packDesc}>{p.desc}</span>
              {active && <span className={styles.packCheck} aria-hidden>✓</span>}
            </button>
          );
        })}
      </div>
    </OnboardingShell>
  );
}
