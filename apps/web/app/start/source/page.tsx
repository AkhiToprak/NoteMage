'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import OnboardingShell from '@/components/onboarding/OnboardingShell';
import { patchOnboardingDraft } from '@/lib/onboarding-handoff';
import styles from '@/components/onboarding/OnboardingContent.module.css';

/* Figma "W02 Source" (node 14:451) — step 1, "Add your study material". Pick a
   source type; "See 2-minute demo" routes into the sample picker (W03), the
   upload/paste options proceed to the goal step. (Real upload/picker wiring lands
   with the routing pass — pre-sign-up we don't process material yet.) */

const OPTIONS: { id: string; icon: string; title: string; desc: string; recommended?: boolean; gold?: boolean }[] = [
  { id: 'pdf', icon: 'description', title: 'Upload PDF or slides', desc: 'Best for notes, scripts, and slides', recommended: true },
  { id: 'notes', icon: 'notes', title: 'Paste notes', desc: 'Paste copied text or summaries' },
  { id: 'video', icon: 'smart_display', title: 'Paste video link', desc: 'YouTube or lecture recording' },
  { id: 'demo', icon: 'play_circle', title: 'See 2-minute demo', desc: 'Experience a full path first', gold: true },
];

export default function SourcePage() {
  const router = useRouter();
  const [sel, setSel] = useState('pdf');

  const onContinue = () => {
    if (sel === 'demo') {
      router.push('/start/sample');
      return;
    }
    patchOnboardingDraft({ source: sel === 'video' ? 'link' : 'upload' });
    router.push('/start/goal');
  };

  return (
    <OnboardingShell
      step={1}
      bubble="What should we turn into a path first?"
      onBack={() => router.back()}
      onContinue={onContinue}
    >
      <h1 className={styles.heading}>Add your study material</h1>
      <p className={styles.subtitle}>Use your own material, or try a sample path before uploading anything.</p>

      <div className={styles.optGrid}>
        {OPTIONS.map((o) => {
          const active = o.id === sel;
          return (
            <button
              key={o.id}
              type="button"
              className={`${styles.opt} ${active ? styles.optActive : ''}`}
              aria-pressed={active}
              onClick={() => setSel(o.id)}
            >
              <span className={`${styles.optTile} ${o.gold ? styles.optTileGold : ''}`}>
                <span className="material-symbols-outlined" aria-hidden>{o.icon}</span>
              </span>
              <span className={styles.optBody}>
                <span className={styles.optTitle}>{o.title}</span>
                <span className={styles.optDesc}>{o.desc}</span>
              </span>
              {o.recommended ? (
                <span className={styles.recPillGold}>Recommended</span>
              ) : (
                <span className={`${styles.optRadio} ${active ? styles.optRadioOn : ''}`} aria-hidden />
              )}
            </button>
          );
        })}
      </div>
    </OnboardingShell>
  );
}
