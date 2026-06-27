/* Shared light marketing footer for the redesigned (cream) surface — rendered by
   both the landing and pricing pages so the footer is guaranteed identical.
   Self-contained literal colours in MageFooter.module.css. */

import Link from 'next/link';
import styles from './MageFooter.module.css';

const FOOTER_LINKS = [
  { label: 'Pricing', href: '/pricing' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
  { label: 'Docs', href: '/docs' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'Refunds', href: '/refund' },
  { label: 'Legal Notice', href: '/legal' },
];

export default function MageFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.top}>
        <div className={styles.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/notemage-wordmark.png" alt="Notemage" width={80} height={30} loading="lazy" decoding="async" />
        </div>
        <a
          className={styles.orb}
          href="https://www.tiktok.com/@notemage"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Notemage on TikTok"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M19.321 5.562a5.124 5.124 0 0 1-3.414-1.267 5.124 5.124 0 0 1-1.537-2.723 5.105 5.105 0 0 1-.08-.898h-3.29v13.4a3.022 3.022 0 0 1-5.436 1.817 3.02 3.02 0 0 1-.604-1.817 3.022 3.022 0 0 1 3.022-3.022c.324 0 .634.051.926.145V8.045a6.353 6.353 0 0 0-.926-.067 6.318 6.318 0 0 0-6.318 6.318 6.318 6.318 0 0 0 6.318 6.318 6.318 6.318 0 0 0 6.318-6.318V8.871a8.399 8.399 0 0 0 5.021 1.647V7.226a5.124 5.124 0 0 1-.001-1.664z" />
          </svg>
        </a>
      </div>
      <nav className={styles.links} aria-label="Footer">
        {FOOTER_LINKS.map((l) => (
          <Link key={l.href} href={l.href}>{l.label}</Link>
        ))}
      </nav>
      <div className={styles.copy}>© 2026{'  '}Notemage</div>
    </footer>
  );
}
