'use client';

/* Phone-only cream bottom tab bar — the mobile incarnation of AppSidebar.
   Rendered by DashboardChrome as a sibling after <main> on the redesigned
   (cream) app-shell routes, replacing the legacy dark MobileBottomNav there.
   The desktop AppSidebar hides ≤760px and this takes over with the same four
   destinations + active logic, so the mobile nav stays in lockstep with the
   sidebar. Because it renders OUTSIDE the AppShell `.shell` wrapper it cannot
   inherit the cream palette tokens — the co-located CSS module self-declares
   them (same pattern as the immersive celebration page). */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { haptics } from '@/lib/haptics';
import styles from './AppMobileNav.module.css';
import { NavIcon } from './NavIcon';

const NAV: { href: string; label: string; icon: string; img?: string }[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'cottage', img: '/nav/home.png' },
  { href: '/exams', label: 'Exams', icon: 'target' },
  { href: '/my-path', label: 'Paths', icon: 'account_tree', img: '/nav/flag.png' },
  { href: '/profile', label: 'Profile', icon: 'person' },
];

/** Shared with AppSidebar — keep both navs agreeing on what "active" means.
 *  The exam hub lives at /exam/[id] (singular) with sub-routes, so the Exams
 *  tab must light there too, not only on the /exams list. The path-detail and
 *  node screens live under /learn/paths but belong to the Paths section. */
function isActive(href: string, pathname: string): boolean {
  if (pathname === href || pathname.startsWith(`${href}/`)) return true;
  if (href === '/exams' && pathname.startsWith('/exam/')) return true;
  if (href === '/my-path' && pathname.startsWith('/learn/paths')) return true;
  return false;
}

export default function AppMobileNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label="Primary">
      <ul className={styles.list}>
        {NAV.map((n) => {
          const active = isActive(n.href, pathname);
          return (
            <li key={n.href} className={styles.cell}>
              <Link
                href={n.href}
                className={active ? `${styles.tab} ${styles.active}` : styles.tab}
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  if (!active) haptics.select();
                }}
              >
                <span className={styles.iconWrap}>
                  <NavIcon icon={n.icon} img={n.img} active={active} size={23} />
                </span>
                <span className={styles.label}>{n.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
