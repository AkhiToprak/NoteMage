'use client';

import Link from 'next/link';
import AppShell from '@/components/app/AppShell';
import MageTip from '@/components/app/MageTip';
import { useOptionalMage } from '@/components/mage';
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

/** Material Symbol for a path's primary subject (matches the Paths screen). */
function subjectIcon(subjects: string[] | undefined): string {
  const subj = (subjects?.[0] ?? '').toLowerCase();
  if (subj.includes('math') || subj.includes('calc')) return 'calculate';
  if (subj.includes('chem') || subj.includes('bio')) return 'science';
  if (subj.includes('hist') || subj.includes('geo')) return 'public';
  if (subj.includes('phys')) return 'bolt';
  if (subj.includes('comp') || subj.includes('cs') || subj.includes('sql') || subj.includes('data')) return 'database';
  if (subj.includes('lang') || subj.includes('lit') || subj.includes('eng')) return 'auto_stories';
  if (subj.includes('econ') || subj.includes('biz')) return 'trending_up';
  return 'menu_book';
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

  const { active } = data;
  const { stats, nextSlot, checkpoint, pathCount, units, lessons, askTopic } = active;
  const ctaHref = nextSlot?.href ?? `/learn/paths/${encodeURIComponent(active.id)}`;
  const ctaLabel = nextSlot?.ctaLabel ?? 'Review path';
  const sessionsDone = data.studiedToday ? 1 : 0;

  return (
    <AppShell>
      <header className={ui.header}>
        <div>
          <div className={ui.eyebrow}>Your first path is ready</div>
          <h1 className={ui.h1}>Let&apos;s keep going</h1>
        </div>
        <Link href="/paths/new" className={`${ui.btn} ${ui.ghost} ${ui.small}`}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--primary)' }} aria-hidden>
            add
          </span>
          New path
        </Link>
      </header>

      <div className={styles.body}>
        <div className={styles.main}>
          {/* hero — the active path */}
          <section className={styles.hero}>
            <div className={styles.heroHead}>
              <span className={styles.heroTile}>
                <MsIcon name={subjectIcon(active.subjects)} size={26} />
              </span>
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
            {nextSlot && (
              <Link href={ctaHref} className={styles.planRow}>
                <span className={styles.planIcon}>
                  <MsIcon name="play_arrow" size={20} />
                </span>
                <div className={styles.planText}>
                  <div className={styles.planTitle}>Continue · {nextSlot.title}</div>
                  <div className={styles.planSub}>{active.title}</div>
                </div>
                <span className={styles.planGo} aria-hidden>
                  <MsIcon name="arrow_forward" size={18} />
                </span>
              </Link>
            )}
            {stats.weakTopicName && mage && (
              <button type="button" className={styles.planRow} onClick={() => mage.open()} style={{ textAlign: 'left' }}>
                <span className={styles.planIcon}>
                  <MsIcon name="replay" size={20} />
                </span>
                <div className={styles.planText}>
                  <div className={styles.planTitle}>Review · {stats.weakTopicName}</div>
                  <div className={styles.planSub}>Strengthen a weak topic with Mage</div>
                </div>
                <span className={styles.planGo} aria-hidden>
                  <MsIcon name="arrow_forward" size={18} />
                </span>
              </button>
            )}
            {mage && (
              <button type="button" className={styles.planRow} onClick={() => mage.open()} style={{ textAlign: 'left' }}>
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
            <button type="button" className={styles.tool} onClick={() => mage?.open()}>
              <span className={styles.toolIcon}>
                <MsIcon name="target" size={22} />
              </span>
              <div className={styles.toolTitle}>Review weak points</div>
              <div className={styles.toolSub}>
                {stats.weakTopicCount > 0
                  ? `${stats.weakTopicCount} ${stats.weakTopicCount === 1 ? 'topic' : 'topics'} waiting`
                  : 'Practice anytime'}
              </div>
            </button>
            <button type="button" className={styles.tool} onClick={() => mage?.open()}>
              <span className={styles.toolIcon}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/mascot/holding-wand-v2.png" alt="" />
              </span>
              <div className={styles.toolTitle}>Ask Mage</div>
              <div className={styles.toolSub}>About {active.title}</div>
            </button>
            <Link href="/paths/new" className={styles.tool}>
              <span className={styles.toolIcon}>
                <MsIcon name="add" size={22} />
              </span>
              <div className={styles.toolTitle}>Create new path</div>
              <div className={styles.toolSub}>Upload more material</div>
            </Link>
          </div>
        </div>

        <aside className={styles.rail}>
          {/* review queue */}
          <div className={`${styles.railCard} ${styles.queue}`}>
            <div className={styles.queueHead}>
              <span className={styles.queueIcon}>
                <MsIcon name="replay" size={22} />
              </span>
              <div>
                <div className={styles.railTitle}>Review queue</div>
                <div className={styles.railSub}>
                  {stats.weakTopicCount > 0
                    ? `${stats.weakTopicCount} ${stats.weakTopicCount === 1 ? 'topic' : 'topics'} waiting`
                    : 'All caught up'}
                </div>
              </div>
            </div>
            <div className={styles.queueDivider} />
            <div className={styles.railRowTitle}>{stats.weakTopicName ?? 'Nothing due right now'}</div>
            {stats.weakTopicName && mage && (
              <button
                type="button"
                className={styles.amberLink}
                onClick={() => mage.open()}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', font: 'inherit' }}
              >
                Review now
                <MsIcon name="arrow_forward" size={15} />
              </button>
            )}
          </div>

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

          <MageTip
            variant="soft"
            text={
              checkpoint
                ? checkpoint.lessonsUntil === 0
                  ? 'Your next checkpoint is ready.'
                  : `You're ${checkpoint.lessonsUntil} ${checkpoint.lessonsUntil === 1 ? 'lesson' : 'lessons'} from your next checkpoint.`
                : pathCount > 1
                  ? 'Keep your other paths moving too.'
                  : "You're all caught up — nice work."
            }
            mascot="/mascot/pointing-left-v2.png"
          />
        </aside>
      </div>
    </AppShell>
  );
}
