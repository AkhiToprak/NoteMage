'use client';

/* Hallmark · component: floating launcher · genre: editorial · theme: project (Neon Scholar)
 * states: default · hover · focus · active · disabled(n/a) · loading(n/a) · error(n/a) · success(n/a)
 * contrast: pass (uses --surface-* / --on-surface tokens; mascot is an image)
 *
 * Mage Revolution Phase 1 — the always-available launcher. A small mascot
 * button bottom-right that opens the panel. Hides itself while the panel is
 * open. Lifts above the phone bottom-nav when one is present.
 */

import { Mascot } from '@/components/mascot';
import { useMage } from './MageProvider';

export function MageLauncher({ avoidBottomNav = false }: { avoidBottomNav?: boolean }) {
  const { isOpen, open } = useMage();

  return (
    <>
      <button
        type="button"
        className="mage-launcher"
        onClick={() => open()}
        aria-label="Open Mage, your study companion"
        aria-expanded={isOpen}
        style={{
          position: 'fixed',
          right: '18px',
          bottom: avoidBottomNav
            ? 'calc(env(safe-area-inset-bottom) + 84px)'
            : 'calc(env(safe-area-inset-bottom) + 20px)',
          zIndex: 1100,
          width: '58px',
          height: '58px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 'var(--radius-full)',
          border: '1px solid var(--outline-variant)',
          background: 'var(--surface-container-high)',
          boxShadow:
            '0 8px 24px rgba(174, 137, 255, 0.18), 0 2px 8px rgba(0, 0, 0, 0.35)',
          cursor: 'pointer',
          padding: 0,
          opacity: isOpen ? 0 : 1,
          transform: isOpen ? 'scale(0.6)' : 'scale(1)',
          pointerEvents: isOpen ? 'none' : 'auto',
        }}
      >
        <Mascot pose="holding-wand" size={42} idle="bounce" wandSparkle />
      </button>

      <style>{`
        .mage-launcher {
          transition:
            transform 0.2s cubic-bezier(0.22, 1, 0.36, 1),
            opacity 0.2s cubic-bezier(0.22, 1, 0.36, 1),
            box-shadow 0.2s cubic-bezier(0.22, 1, 0.36, 1),
            background 0.2s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .mage-launcher:hover {
          background: var(--surface-bright);
          box-shadow: 0 12px 32px rgba(174, 137, 255, 0.26), 0 4px 12px rgba(0, 0, 0, 0.4);
        }
        .mage-launcher:hover:not([aria-expanded="true"]) {
          transform: scale(1.06);
        }
        .mage-launcher:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 3px;
        }
        .mage-launcher:active:not([aria-expanded="true"]) {
          transform: scale(0.94);
        }
        @media (prefers-reduced-motion: reduce) {
          .mage-launcher { transition: opacity 0.12s linear; }
          .mage-launcher:hover:not([aria-expanded="true"]),
          .mage-launcher:active:not([aria-expanded="true"]) { transform: none; }
        }
      `}</style>
    </>
  );
}

export default MageLauncher;
