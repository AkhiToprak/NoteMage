'use client';

/* The canonical sidebar from the Figma "Exams" screen — reused across every
   redesigned app screen (Dashboard, Exams, Paths, Profile). The other Figma
   frames still carried an older sidebar; this is the source of truth. */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './AppSidebar.module.css';
import { NavIcon } from './NavIcon';

const NAV: { href: string; label: string; icon: string; img?: string }[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'cottage', img: 'home' },
  { href: '/exams', label: 'Exams', icon: 'target', img: 'calendar' },
  { href: '/my-path', label: 'Paths', icon: 'account_tree', img: 'flag' },
  { href: '/profile', label: 'Profile', icon: 'person', img: 'profile' },
];

export default function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className={styles.sidebar}>
      <Link href="/dashboard" className={styles.logo} aria-label="NoteMage — dashboard">
        {/* Two-tone wordmark; the dark-mode variant lightens only the "Note"
            ink (near-black → #EFE8FF) so it stays legible on navy. CSS below
            toggles which one shows by theme. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.logoLight} src="/landing/notemage-logo.png" alt="NoteMage" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.logoDark} src="/landing/notemage-logo-dark.svg" alt="" aria-hidden="true" />
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
              <NavIcon icon={n.icon} img={n.img} active={active} size={27} />
              {n.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
