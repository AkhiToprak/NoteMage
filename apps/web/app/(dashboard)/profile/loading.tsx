import AppShell from '@/components/app/AppShell';
import { Skeleton, SkeletonStyles } from '@/components/ui/Skeleton';
import styles from './Profile.module.css';

/* Skeleton shown while the server profile page resolves profile + stats +
   achievements. Mirrors the hero · stats strip · achievements · right column
   so content streams in with no layout shift. */

export default function ProfileLoading() {
  return (
    <AppShell>
      <SkeletonStyles />
      <div className={styles.wrap}>
        {/* hero */}
        <section className={styles.hero}>
          <Skeleton h={84} circle />
          <div className={styles.heroInfo} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton w={180} h={24} />
            <Skeleton w={220} h={14} />
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Skeleton w={84} h={24} radius="999px" />
              <Skeleton w={104} h={24} radius="999px" />
            </div>
          </div>
          <Skeleton w={64} h={32} radius="999px" />
        </section>

        <div className={styles.body}>
          {/* left column */}
          <div className={styles.left}>
            <div className={styles.statsCard}>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={styles.statCol}
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  <Skeleton w={44} h={26} />
                  <Skeleton w={70} h={13} />
                </div>
              ))}
            </div>

            <div className={styles.achHead}>
              <Skeleton w={150} h={20} />
              <Skeleton w={56} h={14} />
            </div>
            <div className={styles.latest}>
              <Skeleton h={48} circle />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                <Skeleton w={60} h={11} />
                <Skeleton w="55%" h={16} />
                <Skeleton w="70%" h={13} />
              </div>
            </div>
            <div className={styles.badges}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={styles.badge}>
                  <Skeleton h={48} circle />
                  <Skeleton w="80%" h={12} />
                </div>
              ))}
            </div>
          </div>

          {/* right column */}
          <div className={styles.right}>
            <div className={styles.pro}>
              <Skeleton w="70%" h={18} style={{ background: 'rgba(255,255,255,0.38)' }} />
              <Skeleton w="85%" h={13} style={{ marginTop: 12, background: 'rgba(255,255,255,0.3)' }} />
              <Skeleton w="80%" h={13} style={{ marginTop: 6, background: 'rgba(255,255,255,0.3)' }} />
              <Skeleton w={100} h={34} radius="999px" style={{ marginTop: 16, background: 'rgba(255,255,255,0.55)' }} />
            </div>
            <div className={styles.settings}>
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className={styles.setRow}>
                  <Skeleton w={32} h={32} radius="9px" />
                  <div style={{ flex: 1 }}>
                    <Skeleton w="55%" h={14} />
                  </div>
                  <Skeleton h={20} circle />
                </div>
              ))}
            </div>
            <Skeleton h={52} radius="14px" style={{ marginTop: 20 }} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
