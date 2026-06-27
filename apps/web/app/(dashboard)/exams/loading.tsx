import AppShell from '@/components/app/AppShell';
import { Skeleton, SkeletonStyles } from '@/components/ui/Skeleton';
import ui from '@/components/app/ui.module.css';
import styles from './Exams.module.css';

/* Skeleton shown while the server exams page resolves its overview. Mirrors the
   header + active-card grid so content streams in with no layout shift. */

export default function ExamsLoading() {
  return (
    <AppShell>
      <SkeletonStyles />
      <header className={ui.header}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton w={130} h={30} />
          <Skeleton w={300} h={14} />
        </div>
        <Skeleton w={132} h={40} radius="var(--rm, 14px)" />
      </header>

      <section className={styles.section}>
        <Skeleton w={110} h={16} radius="999px" />
        <div className={styles.grid}>
          {[0, 1, 2, 3].map((i) => (
            <article key={i} className={`${ui.card} ${styles.examCard}`}>
              <div className={styles.cardTop}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Skeleton w="70%" h={20} />
                  <Skeleton w="45%" h={13} />
                </div>
                <Skeleton w={96} h={26} radius="999px" />
              </div>
              <div className={styles.readyRow}>
                <Skeleton w={110} h={15} />
                <Skeleton w={84} h={26} radius="999px" />
              </div>
              <Skeleton h={8} radius="999px" />
              <div className={styles.metaRow}>
                <Skeleton w={90} h={13} />
                <Skeleton w={90} h={13} />
              </div>
              <div className={styles.actions}>
                <Skeleton w={120} h={40} radius="var(--rm, 14px)" />
                <Skeleton w={110} h={40} radius="var(--rm, 14px)" />
              </div>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
