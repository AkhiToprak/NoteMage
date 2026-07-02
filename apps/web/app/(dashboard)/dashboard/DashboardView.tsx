'use client';

import Link from 'next/link';
import AppShell from '@/components/app/AppShell';
import { useOptionalMage } from '@/components/mage';
import { SubjectIcon } from '@/components/learn/SubjectIcon';
import type { DashboardData } from '@/lib/dashboard-data';
import ui from '@/components/app/ui.module.css';
import styles from './Dashboard.module.css';

/* Dashboard view (client). Receives the already-resolved DashboardData from the
   server page — no fetching, no loading state here. Holds the interactive
   chrome (Ask Mage launchers) that needs client context. */

function MsIcon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <span className="material-symbols-outlined" style={{ fontSize: size, color: 'inherit' }} aria-hidden>
      {name}
    </span>
  );
}

interface DashboardViewProps {
  data: DashboardData | null;
  firstName: string | null;
  errored: boolean;
}

export default function DashboardView({ data, firstName, errored }: DashboardViewProps) {
  const mage = useOptionalMage();

  // ── Error / empty (no usable path yet) ───────────────────────────────────
  if (errored || !data?.hasUsablePath || !data.active) {
    return (
      <AppShell>
        <header className={ui.header}>
          <div>
            <div className={ui.eyebrow}>{firstName ? `Welcome, ${firstName}` : 'Welcome'}</div>
            <h1 className={ui.h1}>{errored ? 'Something went wrong' : 'Start your first path'}</h1>
          </div>
        </header>
        <div className={ui.card} style={{ marginTop: 30, padding: '52px 32px', textAlign: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mascot/holding-wand-v2.png" alt="" style={{ height: 72, margin: '0 auto 12px', display: 'block' }} />
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
            {errored ? "We couldn't load your paths" : 'No learning paths yet'}
          </div>
          <p style={{ marginTop: 6, fontSize: 14, color: 'var(--body)' }}>
            {errored ? 'Refresh the page to try again.' : 'Upload your material and Mage will build a path from it.'}
          </p>
          {!errored && (
            <Link href="/paths/new" className={`${ui.btn} ${ui.primary}`} style={{ marginTop: 18 }}>
              Create your first path
            </Link>
          )}
        </div>
      </AppShell>
    );
  }

  const { active, conceptWeakSpots, dueFlashcards, nudgeState } = data;
  const { stats, nextSlot, checkpoint, units, lessons, askTopic } = active;
  const ctaHref = nextSlot?.href ?? `/learn/paths/${encodeURIComponent(active.id)}`;
  const ctaLabel = nextSlot ? 'Continue studying' : 'Review path';
  const sessionsDone = data.studiedToday ? 1 : 0;

  return (
    <AppShell>
      <header className={ui.header}>
        <div>
          <div className={ui.eyebrow}>Your first path is ready</div>
          <h1 className={ui.h1}>Let&apos;s keep going</h1>
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.main}>
          {/* hero — the active path */}
          <section className={styles.hero}>
            <div className={styles.heroHead}>
              <SubjectIcon subjects={active.subjects} size={56} radius={15} />
              <div>
                <div className={styles.heroTitle}>{active.title}</div>
                <div className={styles.heroSource}>{active.sourceLabel}</div>
              </div>
            </div>
            <div className={styles.heroStats}>
              {units} {units === 1 ? 'unit' : 'units'} · {lessons} {lessons === 1 ? 'lesson' : 'lessons'} ·{' '}
              {stats.doneCheckpoints} of {stats.totalCheckpoints} steps complete
            </div>
            <div className={styles.heroProgRow}>
              <span className={styles.heroProgLabel}>Progress</span>
              <span className={styles.heroProgPct}>{stats.progressPct}% complete</span>
            </div>
            <div className={`${ui.track} ${styles.heroBar}`}>
              <div className={ui.fill} style={{ width: `${stats.progressPct}%` }} />
            </div>
            <div className={styles.heroFoot}>
              <span className={styles.heroNext}>
                <span className={styles.heroPlay}>
                  <MsIcon name="play_arrow" size={16} />
                </span>
                {nextSlot ? `Next · ${nextSlot.title}` : 'Path complete — review anytime'}
              </span>
              <Link href={ctaHref} className={`${ui.btn} ${ui.primary} ${styles.heroContinue}`}>
                {ctaLabel}
              </Link>
            </div>
          </section>

          <h2 className={styles.sectionTitle}>Today&apos;s study plan</h2>
          <div className={styles.planList}>
            {/* Row 1 — weak-point review. Merges the two former weak-spot entry
                points (Study-tools tile + rail queue). Concept weak spots →
                /profile/weak-spots with the Weakness-Training nudge badge +
                escalation styling carried over; else Mage-driven fallback. */}
            {conceptWeakSpots ? (
              <Link
                href="/profile/weak-spots"
                className={[
                  styles.planRow,
                  nudgeState ? (nudgeState.escalated ? styles.planRowEscalated : styles.planRowNudged) : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className={styles.planIcon}>
                  <MsIcon name="target" size={20} />
                </span>
                <div className={styles.planText}>
                  <div className={styles.planTitle}>Review · {conceptWeakSpots.topLabel ?? 'weak spots'}</div>
                  <div className={styles.planSub}>
                    {conceptWeakSpots.count} {conceptWeakSpots.count === 1 ? 'area' : 'areas'} to review
                  </div>
                </div>
                {nudgeState && (
                  <span
                    className={`${styles.planBadge} ${nudgeState.escalated ? styles.planBadgeEscalated : ''}`}
                    aria-hidden
                  >
                    {nudgeState.badgeCount}
                  </span>
                )}
                <span className={styles.planGo} aria-hidden>
                  <MsIcon name="arrow_forward" size={18} />
                </span>
              </Link>
            ) : (
              stats.weakTopicName &&
              mage && (
                <button type="button" className={styles.planRow} onClick={() => mage.open()}>
                  <span className={styles.planIcon}>
                    <MsIcon name="target" size={20} />
                  </span>
                  <div className={styles.planText}>
                    <div className={styles.planTitle}>Review · {stats.weakTopicName}</div>
                    <div className={styles.planSub}>Strengthen a weak topic with Mage</div>
                  </div>
                  <span className={styles.planGo} aria-hidden>
                    <MsIcon name="arrow_forward" size={18} />
                  </span>
                </button>
              )
            )}
            {/* Row 2 — the one contextual Ask Mage (the persistent one lives in
                the sidebar). */}
            {mage && (
              <button type="button" className={styles.planRow} onClick={() => mage.open()}>
                <span className={styles.planIcon}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/mascot/holding-wand-v2.png" alt="" />
                </span>
                <div className={styles.planText}>
                  <div className={styles.planTitle}>Ask Mage · Explain {askTopic}</div>
                  <div className={styles.planSub}>Get a quick explainer from your sources</div>
                </div>
                <span className={styles.planGo} aria-hidden>
                  <MsIcon name="arrow_forward" size={18} />
                </span>
              </button>
            )}
          </div>

          <h2 className={styles.sectionTitle}>Study tools</h2>
          <div className={styles.tools}>
            <Link href="/practice/review" className={styles.tool}>
              <span className={styles.toolIcon}>
                <MsIcon name="style" size={22} />
              </span>
              <div className={styles.toolTitle}>Flashcards</div>
              <div className={styles.toolSub}>
                {dueFlashcards
                  ? `${dueFlashcards.dueCount} ${dueFlashcards.dueCount === 1 ? 'card' : 'cards'} due`
                  : 'Practice anytime'}
              </div>
            </Link>
            <Link href="/my-path" className={styles.tool}>
              <span className={styles.toolIcon}>
                <MsIcon name="menu_book" size={22} />
              </span>
              <div className={styles.toolTitle}>View full path</div>
              <div className={styles.toolSub}>All units and lessons</div>
            </Link>
            <Link href="/paths/new" className={styles.tool}>
              <span className={styles.toolIcon}>
                <MsIcon name="upload" size={22} />
              </span>
              <div className={styles.toolTitle}>Upload material</div>
              <div className={styles.toolSub}>Build a new path</div>
            </Link>
          </div>
        </div>

        <aside className={styles.rail}>
          {/* today's goal — one study session per day, from real activity */}
          <div className={styles.railCard}>
            <div className={styles.railTitle}>Today&apos;s goal</div>
            <div className={styles.goalRow}>
              <span
                className={styles.goalCheck}
                style={sessionsDone < 1 ? { background: 'var(--lilac)', color: 'var(--accent)' } : undefined}
              >
                <MsIcon name="check" size={16} />
              </span>
              {sessionsDone} of 1 sessions done
            </div>
            <div className={styles.railNote}>
              {sessionsDone >= 1
                ? 'Come back tomorrow to keep your streak.'
                : 'Study today to keep your streak going.'}
            </div>
          </div>

          {/* next checkpoint */}
          {checkpoint && (
            <div className={styles.railCard}>
              <div className={styles.railTitle}>Next checkpoint</div>
              <div className={styles.checkpointPill}>
                <span className={`${ui.pill} ${ui.pillLilac}`}>
                  {checkpoint.lessonsUntil === 0
                    ? 'Up next'
                    : `${checkpoint.lessonsUntil} ${checkpoint.lessonsUntil === 1 ? 'lesson' : 'lessons'} until quiz`}
                </span>
              </div>
              <div className={styles.railRowTitle} style={{ marginTop: 10 }}>{checkpoint.title}</div>
              <div className={styles.railNote}>Finish the next lessons to unlock it.</div>
            </div>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
