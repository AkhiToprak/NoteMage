import AppShell from '@/components/app/AppShell';
import { Skeleton, SkeletonStyles } from '@/components/ui/Skeleton';
import ui from '@/components/app/ui.module.css';
import styles from './Paths.module.css';

/* Skeleton shown while the server my-path page resolves the learner's paths.
   Mirrors the header + tab strip + card grid so content streams in without a
   layout shift. */

export default function PathsLoading() {
  return (
    <AppShell>
      <SkeletonStyles />
      <header className={ui.header}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton w={170} h={30} />
          <Skeleton w={90} h={14} />
        </div>
        <Skeleton w={104} h={38} radius="var(--rm, 14px)" />
      </header>

      <div className={styles.tabs}>
        <Skeleton w={64} h={36} radius="999px" />
        <Skeleton w={104} h={36} radius="999px" />
        <Skeleton w={104} h={36} radius="999px" />
      </div>

      <div className={styles.grid}>
        {[0, 1, 2, 3].map((i) => (
          <article key={i} className={styles.pathCard}>
            <div className={styles.pathHead}>
              <Skeleton w={52} h={52} radius="14px" />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Skeleton w="75%" h={18} />
                <Skeleton w="50%" h={13} />
              </div>
            </div>
            <div className={styles.progress}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Skeleton h={8} radius="999px" />
              </div>
              <Skeleton w={32} h={14} />
            </div>
            <div className={styles.divider} />
            <div className={styles.foot}>
              <Skeleton w="45%" h={14} />
              <Skeleton w={80} h={14} />
            </div>
          </article>
        ))}
      </div>
    </AppShell>
  );
}
