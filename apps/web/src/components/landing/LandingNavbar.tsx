'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

/* Shared pre-login marketing nav — the floating "path" pill from the landing,
   reused across /, /about, /pricing, /docs, /contact and the legal pages so the
   whole signed-out surface shares one navbar. Tokens are kept as literals that
   mirror the landing pill (PathLanding.module.css) so it renders identically
   inside the landing's scoped `.root` AND on the standalone dark pages. */

const LINKS = [
  { href: '/docs', label: 'Docs' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
];

export default function LandingNavbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // lock body scroll while the mobile sheet is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  // close the sheet on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // close the sheet on Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <>
      <header className="mnav">
        <nav className="mnav-pill" aria-label="Primary">
          <Link href="/" className="mnav-logo" aria-label="NoteMage — home">
            <Image
              src="/logo_trimmed.png"
              alt="NoteMage"
              width={256}
              height={96}
              priority
              className="mnav-logo-img"
            />
          </Link>

          <span className="mnav-divider" aria-hidden />

          <ul className="mnav-links">
            {LINKS.map((l) => {
              const active = pathname === l.href;
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className={`mnav-link${active ? ' is-active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <Link href="/auth/login" className="mnav-login">
            Log in <span aria-hidden>→</span>
          </Link>

          <button
            type="button"
            className="mnav-burger"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="material-symbols-outlined">{menuOpen ? 'close' : 'menu'}</span>
          </button>
        </nav>
      </header>

      {menuOpen && (
        <div className="mnav-sheet" role="dialog" aria-modal="true" aria-label="Menu">
          <nav className="mnav-sheet-links" aria-label="Primary">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="mnav-sheet-link">
                {l.label}
              </Link>
            ))}
          </nav>
          <Link href="/auth/login" className="mnav-sheet-login">
            Log in <span aria-hidden>→</span>
          </Link>
        </div>
      )}

      <style jsx global>{`
        .mnav {
          position: fixed;
          top: 18px;
          left: 0;
          right: 0;
          z-index: 60;
          display: flex;
          justify-content: center;
          padding: 0 16px;
          pointer-events: none;
        }
        .mnav-pill {
          pointer-events: auto;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          max-width: 100%;
          padding: 8px 8px 8px 12px;
          background: rgba(26, 24, 48, 0.72);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 999px;
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
        }
        .mnav-logo {
          display: inline-flex;
          align-items: center;
          padding: 4px 10px;
          border-radius: 999px;
          transition: opacity 0.2s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .mnav-logo:hover {
          opacity: 0.82;
        }
        .mnav-logo:focus-visible {
          outline: 2px solid #c6a8ff;
          outline-offset: 2px;
        }
        .mnav-logo-img {
          height: 26px;
          width: auto;
          display: block;
          object-fit: contain;
        }
        .mnav-divider {
          width: 1px;
          height: 22px;
          background: rgba(255, 255, 255, 0.12);
          margin: 0 4px;
        }
        .mnav-links {
          display: flex;
          align-items: center;
          gap: 2px;
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .mnav-link {
          display: inline-block;
          color: #bcb9d8;
          text-decoration: none;
          font-weight: 600;
          font-size: 15px;
          font-family: var(--font-sans);
          padding: 8px 14px;
          border-radius: 999px;
          transition: color 0.2s cubic-bezier(0.22, 1, 0.36, 1),
            background-color 0.2s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .mnav-link:hover {
          color: #efeefc;
          background: rgba(255, 255, 255, 0.06);
        }
        .mnav-link.is-active {
          color: #efeefc;
          background: rgba(255, 255, 255, 0.08);
        }
        .mnav-link:focus-visible {
          outline: 2px solid #c6a8ff;
          outline-offset: 2px;
        }
        .mnav-login {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          margin-left: 2px;
          background: #ffde59;
          color: #3a2e00;
          font-weight: 800;
          font-size: 15px;
          font-family: var(--font-sans);
          padding: 11px 20px;
          border-radius: 999px;
          text-decoration: none;
          box-shadow: 0 3px 0 #c9ab2e;
          transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 0.18s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .mnav-login:hover {
          transform: translateY(-1px);
          box-shadow: 0 5px 0 #c9ab2e;
        }
        .mnav-login:active {
          transform: translateY(2px);
          box-shadow: 0 1px 0 #c9ab2e;
        }
        .mnav-login:focus-visible {
          outline: 3px solid #c6a8ff;
          outline-offset: 3px;
        }
        .mnav-burger {
          display: none;
          place-items: center;
          width: 42px;
          height: 42px;
          padding: 0;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 999px;
          color: #efeefc;
          cursor: pointer;
          transition: background-color 0.2s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .mnav-burger:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        .mnav-burger:focus-visible {
          outline: 2px solid #c6a8ff;
          outline-offset: 2px;
        }
        .mnav-burger .material-symbols-outlined {
          font-size: 24px;
        }

        /* ── phones: collapse the links + login into a full-screen sheet ── */
        @media (max-width: 640px) {
          .mnav-divider,
          .mnav-links,
          .mnav-login {
            display: none;
          }
          .mnav-burger {
            display: grid;
          }
          .mnav-pill {
            padding: 6px 6px 6px 12px;
          }
        }

        .mnav-sheet {
          position: fixed;
          inset: 0;
          z-index: 59;
          background: #0c0a1a;
          padding: 104px 28px 36px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          animation: mnavSheetIn 0.28s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes mnavSheetIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .mnav-sheet-links {
          display: flex;
          flex-direction: column;
        }
        .mnav-sheet-link {
          display: block;
          padding: 16px 4px;
          color: #efeefc;
          text-decoration: none;
          font-family: var(--font-display);
          font-weight: 800;
          font-size: 30px;
          letter-spacing: -0.02em;
          border-bottom: 1px solid rgba(255, 255, 255, 0.07);
        }
        .mnav-sheet-link:focus-visible {
          outline: 2px solid #c6a8ff;
          outline-offset: 2px;
        }
        .mnav-sheet-login {
          display: inline-flex;
          align-self: flex-start;
          align-items: center;
          gap: 8px;
          margin-top: 24px;
          background: #ffde59;
          color: #3a2e00;
          font-weight: 800;
          font-size: 17px;
          font-family: var(--font-sans);
          padding: 14px 26px;
          border-radius: 999px;
          text-decoration: none;
          box-shadow: 0 3px 0 #c9ab2e;
        }
        .mnav-sheet-login:focus-visible {
          outline: 3px solid #c6a8ff;
          outline-offset: 3px;
        }

        @media (prefers-reduced-motion: reduce) {
          .mnav-sheet {
            animation: none;
          }
          .mnav-logo,
          .mnav-link,
          .mnav-login,
          .mnav-burger {
            transition: none;
          }
        }
      `}</style>
    </>
  );
}
