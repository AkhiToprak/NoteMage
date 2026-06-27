import AppShell from '@/components/app/AppShell';
import { Skeleton, SkeletonStyles } from '@/components/ui/Skeleton';
import ui from '@/components/app/ui.module.css';
import styles from './Dashboard.module.css';

/* Route skeleton shown while the server dashboard page resolves its data.
   Mirrors DashboardView's layout (header · hero · study plan · tools · rail) so
   real content streams in with no shift. */

export default function DashboardLoading() {
  return (
    <AppShell>
      <SkeletonStyles />
      <header className={ui.header}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton w={120} h={13} radius="999px" />
          <Skeleton w={220} h={30} />
        </div>
        <Skeleton w={104} h={38} radius="var(--rm, 14px)" />
      </header>

      <div className={styles.body}>
        <div className={styles.main}>
          {/* hero card */}
          <section className={styles.hero}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Skeleton w={56} h={56} radius="15px" />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
                <Skeleton w="52%" h={20} />
                <Skeleton w="34%" h={13} />
              </div>
            </div>
            <Skeleton w="72%" h={13} style={{ marginTop: 20 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
              <Skeleton w={70} h={13} />
              <Skeleton w={92} h={13} />
            </div>
            <Skeleton h={10} radius="999px" style={{ marginTop: 10 }} />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 22,
                gap: 16,
                flexWrap: 'wrap',
              }}
            >
              <Skeleton w={180} h={15} />
              <Skeleton w={150} h={52} radius="var(--rm, 14px)" />
            </div>
          </section>

          {/* study plan */}
          <Skeleton w={190} h={22} style={{ marginTop: 28 }} />
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className={styles.planRow} style={{ cursor: 'default' }}>
                <Skeleton w={40} h={40} radius="11px" />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <Skeleton w="46%" h={15} />
                  <Skeleton w="30%" h={13} />
                </div>
                <Skeleton w={36} h={36} circle />
              </div>
            ))}
          </div>

          {/* study tools */}
          <Skeleton w={130} h={22} style={{ marginTop: 28 }} />
          <div className={styles.tools} style={{ marginTop: 16 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={styles.tool} style={{ cursor: 'default' }}>
                <Skeleton w={40} h={40} radius="11px" />
                <Skeleton w="72%" h={14} style={{ marginTop: 30 }} />
                <Skeleton w="50%" h={12} style={{ marginTop: 8 }} />
              </div>
            ))}
          </div>
        </div>

        {/* right rail */}
        <aside className={styles.rail}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={styles.railCard}>
              <Skeleton w="55%" h={15} />
              <Skeleton w="82%" h={13} style={{ marginTop: 12 }} />
              <Skeleton w="40%" h={13} style={{ marginTop: 12 }} />
            </div>
          ))}
        </aside>
      </div>
    </AppShell>
  );
}
