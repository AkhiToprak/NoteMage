'use client';

/* Shared light marketing nav for the redesigned (cream) surface — the landing
   and pricing pages both render it, so they can never drift. Self-contained:
   literal colours in MageNav.module.css, no dependency on a parent token block.
   (The older dark `LandingNavbar` still serves the not-yet-redesigned pages.) */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './MageNav.module.css';

const LINKS: { href: string; label: string; match?: string }[] = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/pricing', label: 'Pricing', match: '/pricing' },
  { href: '/auth/login', label: 'Log in' },
];

export default function MageNav() {
  const pathname = usePathname();
  return (
    <header className={styles.nav}>
      <div className={styles.inner}>
        <Link href="/" className={styles.logo} aria-label="NoteMage — home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/notemage-wordmark.png" alt="NoteMage" width={80} height={30} />
        </Link>
        <nav className={styles.links} aria-label="Primary">
          {LINKS.map((l) => {
            const active = l.match ? pathname === l.match : false;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={active ? styles.active : undefined}
                aria-current={active ? 'page' : undefined}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <Link href="/start/welcome" className={styles.cta}>Get started</Link>
      </div>
    </header>
  );
}
