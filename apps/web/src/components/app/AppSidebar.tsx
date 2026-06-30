'use client';

/* The canonical sidebar from the Figma "Exams" screen — reused across every
   redesigned app screen (Dashboard, Exams, Paths, Profile). The other Figma
   frames still carried an older sidebar; this is the source of truth. */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useOptionalMage } from '@/components/mage';
import styles from './AppSidebar.module.css';
import { NavIcon } from './NavIcon';

const NAV: { href: string; label: string; icon: string; img?: string }[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'cottage', img: '/nav/home.png' },
  { href: '/exams', label: 'Exams', icon: 'target' },
  { href: '/my-path', label: 'Paths', icon: 'account_tree', img: '/nav/flag.png' },
  { href: '/profile', label: 'Profile', icon: 'person' },
];

export default function AppSidebar() {
  const pathname = usePathname();
  const mage = useOptionalMage();

  return (
    <aside className={styles.sidebar}>
      <Link href="/dashboard" className={styles.logo} aria-label="Notemage — dashboard">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/landing/notemage-wordmark.png" alt="Notemage" />
      </Link>

      <nav className={styles.nav} aria-label="Primary">
        {NAV.map((n) => {
          const active =
            pathname === n.href ||
            pathname.startsWith(`${n.href}/`) ||
            // The exam hub + sub-routes live at /exam/[id] (singular), so keep
            // the "Exams" item lit across the whole exam loop, not just /exams.
            (n.href === '/exams' && pathname.startsWith('/exam/')) ||
            // The path-detail + node-overview screens live under /learn/paths
            // but belong to the "Paths" section, so keep that item lit there.
            (n.href === '/my-path' && pathname.startsWith('/learn/paths'));
          return (
            <Link
              key={n.href}
              href={n.href}
              className={active ? `${styles.item} ${styles.active}` : styles.item}
              aria-current={active ? 'page' : undefined}
            >
              <NavIcon icon={n.icon} img={n.img} active={active} size={21} />
              {n.label}
            </Link>
          );
        })}
      </nav>

      <div className={styles.spacer} />

      <div className={styles.ask}>
        <div className={styles.askHead}>
          <span className={styles.askIcon}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mascot/holding-wand-v2.png" alt="" />
          </span>
          <span className={styles.askTitle}>Ask Mage</span>
        </div>
        <p className={styles.askDesc}>Stuck? Mage explains with your own sources.</p>
        <button type="button" className={styles.askBtn} onClick={() => mage?.open()}>
          Ask Mage
        </button>
      </div>
    </aside>
  );
}
