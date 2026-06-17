'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PathActivity, PathPlan, PathSlot } from '@/components/learn/PathView';
import CheckpointFlashcardViewer from '@/components/learn/CheckpointFlashcardViewer';
import CheckpointTheoryViewer from '@/components/learn/CheckpointTheoryViewer';
import CheckpointQuizViewer from '@/components/learn/CheckpointQuizViewer';
import { type PathUnlock } from '@/components/learn/path-rewards';
import { RewardTakeover } from '@/components/rewards/RewardTakeover';

// Dedicated player for the guided sample tutorial. Unlike the normal path page
// — which drives the open checkpoint from the URL (?slot=/?activity=) and keeps
// the path map mounted behind the viewers — this walks the activities
// theory -> flashcards -> quiz with LOCAL state. Transitions are synchronous
// (no router.replace) and the path map is never rendered, so nothing flashes
// behind the viewers' fade-in between checkpoints. Finishing the last activity
// fires the celebration -> welcome takeover, marks the tutorial complete (which
// grants Apprentice Mage), then hands off to the dashboard nudge.

interface FlatActivity {
  slot: PathSlot;
  activity: PathActivity;
}

function flattenActivities(plan: PathPlan): FlatActivity[] {
  const out: FlatActivity[] = [];
  for (const phase of plan.phases) {
    for (const slot of phase.slots) {
      for (const activity of slot.activities) {
        out.push({ slot, activity });
      }
    }
  }
  return out;
}

const NOOP = () => {};

export function TutorialPathPlayer({
  plan,
  startActivityId,
}: {
  plan: PathPlan;
  startActivityId: string | null;
}) {
  const router = useRouter();
  const activities = useMemo(() => flattenActivities(plan), [plan]);

  const startIndex = useMemo(() => {
    if (!startActivityId) return 0;
    const i = activities.findIndex((a) => a.activity.id === startActivityId);
    return i >= 0 ? i : 0;
  }, [activities, startActivityId]);

  const [index, setIndex] = useState(startIndex);
  const [reward, setReward] = useState<
    { stage: 'celebrate' | 'welcome'; cosmeticSlug: string | null } | null
  >(null);
  const celebratedRef = useRef(false);

  const current = activities[index] ?? null;

  // Advance to the next activity (a synchronous state swap, so the next viewer
  // mounts in the same commit with nothing showing behind), or fire the finale
  // once the last activity is done.
  const handleCompleted = useCallback(
    (unlocked?: PathUnlock[]) => {
      if (index + 1 < activities.length) {
        setIndex(index + 1);
        return;
      }
      if (celebratedRef.current) return;
      celebratedRef.current = true;
      const cosmeticSlug = (unlocked ?? []).flatMap((u) => u.cosmetics)[0] ?? null;
      setReward({ stage: 'celebrate', cosmeticSlug });
    },
    [index, activities.length],
  );

  // The viewer close button bails out of the guided tutorial.
  const handleExit = useCallback(() => {
    router.push('/dashboard');
  }, [router]);

  // Celebration -> welcome. Mark the guided sample complete server-side here
  // (grants the Apprentice Mage achievement + its title/font cosmetics).
  const advanceReward = useCallback(() => {
    void fetch('/api/user/tutorial/complete', { method: 'POST' });
    setReward({ stage: 'welcome', cosmeticSlug: null });
  }, []);

  // Welcome -> hand off to the dashboard "bring your own notes" nudge.
  const finishReward = useCallback(() => {
    setReward(null);
    router.push('/dashboard?postTutorial=1');
  }, [router]);

  return (
    <>
      {/* Solid base so a viewer's opacity fade-in never reveals the app
          background between checkpoints. The path map is never rendered here. */}
      <div
        aria-hidden
        style={{ position: 'fixed', inset: 0, background: 'var(--surface)', zIndex: 1290 }}
      />

      {current?.activity.kind === 'theory' ? (
        <CheckpointTheoryViewer
          key={current.activity.id}
          slot={current.slot}
          activity={current.activity}
          onClose={handleExit}
          onCompleted={handleCompleted}
        />
      ) : current?.activity.kind === 'flashcards' ? (
        <CheckpointFlashcardViewer
          key={current.activity.id}
          slot={current.slot}
          activity={current.activity}
          onClose={handleExit}
          onCompleted={handleCompleted}
        />
      ) : current?.activity.kind === 'quiz' ? (
        <CheckpointQuizViewer
          key={current.activity.id}
          slot={current.slot}
          activity={current.activity}
          onClose={handleExit}
          onCompleted={handleCompleted}
          onProgress={NOOP}
          allowContinueOnFail
        />
      ) : null}

      {reward?.stage === 'celebrate' ? (
        <RewardTakeover
          title="Path complete!"
          subtitle="You finished the whole flow. Theory, flashcards, and a quiz, just like every path you build."
          cosmeticSlug={reward.cosmeticSlug}
          buttonLabel="Continue"
          onDismiss={advanceReward}
        />
      ) : reward?.stage === 'welcome' ? (
        <RewardTakeover
          title="Welcome to NoteMage!"
          subtitle="Turn your own notes into paths like this one, any time. Your dashboard is ready when you are."
          buttonLabel="Go to my dashboard"
          onDismiss={finishReward}
        />
      ) : null}
    </>
  );
}

export default TutorialPathPlayer;
