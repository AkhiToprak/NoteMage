'use client';

import Link from 'next/link';
import SettingsShell from '@/components/settings/SettingsShell';
import { SettingsCard, CardHead } from '@/components/settings/SettingsKit';
import ui from '@/components/app/ui.module.css';

/* Help & support (cream redesign). Reached from /profile → "Help & support".
   Gathers the support surfaces that were scattered across the old /settings
   page: the guided tutorial relaunch and the Legal & Policies links, plus
   the existing marketing/support routes (contact, docs, about). */

type Row = { href: string; icon: string; label: string; desc?: string; external?: boolean };

const RESOURCES: Row[] = [
  { href: '/contact', icon: 'mail', label: 'Contact support', desc: 'Questions, bugs, or billing — reach the team.' },
  { href: '/docs', icon: 'menu_book', label: 'Documentation', desc: 'Guides for paths, study packs, and exam mode.' },
  { href: '/about', icon: 'info', label: 'About NoteMage', desc: 'What NoteMage is and where it’s headed.' },
];

const LEGAL: Row[] = [
  { href: '/privacy', icon: 'shield_person', label: 'Privacy Policy', external: true },
  { href: '/terms', icon: 'description', label: 'Terms of Service', external: true },
  { href: '/refund', icon: 'currency_exchange', label: 'Refund Policy', external: true },
  { href: '/legal', icon: 'balance', label: 'Legal Notice', external: true },
];

function LinkRow({ row }: { row: Row }) {
  const inner = (
    <>
      <span
        aria-hidden
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: 'var(--lilac-soft)',
          color: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
          {row.icon}
        </span>
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: 'var(--ink)' }}>{row.label}</span>
        {row.desc && <span style={{ display: 'block', marginTop: 2, fontSize: 12.5, color: 'var(--body)' }}>{row.desc}</span>}
      </span>
      <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--muted)', flexShrink: 0 }} aria-hidden>
        {row.external ? 'open_in_new' : 'chevron_right'}
      </span>
    </>
  );

  const style: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '12px 14px',
    borderRadius: 'var(--rm)',
    textDecoration: 'none',
    color: 'var(--ink)',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
  };

  return row.external ? (
    <a className="set-linkrow" href={row.href} target="_blank" rel="noopener noreferrer" style={style}>
      {inner}
    </a>
  ) : (
    <Link className="set-linkrow" href={row.href} style={style}>
      {inner}
    </Link>
  );
}

export default function HelpSettingsPage() {
  return (
    <SettingsShell label="Help & support" subtitle="Guides, contact, and the legal fine print.">
      {/* Guided tutorial */}
      <SettingsCard>
        <CardHead
          icon="school"
          title="Guided tutorial"
          desc="Build and study a path with a sample subject — the whole flow in two minutes."
        />
        <Link href="/tutorial" className={`${ui.btn} ${ui.primary} ${ui.small}`} style={{ alignSelf: 'flex-start' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
            play_circle
          </span>
          Start tutorial
        </Link>
      </SettingsCard>

      {/* Resources */}
      <SettingsCard>
        <CardHead icon="help" title="Get help" desc="Reach support or read the docs." />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {RESOURCES.map((row) => (
            <LinkRow key={row.href} row={row} />
          ))}
        </div>
      </SettingsCard>

      {/* Legal */}
      <SettingsCard>
        <CardHead icon="gavel" tint="lilac" title="Legal & policies" desc="How we handle your data and the terms you agreed to." />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {LEGAL.map((row) => (
            <LinkRow key={row.href} row={row} />
          ))}
        </div>
      </SettingsCard>
    </SettingsShell>
  );
}
