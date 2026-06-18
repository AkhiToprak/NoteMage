'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Mascot } from '@/components/mascot/Mascot';
import type { MascotPose } from '@/components/mascot/poses';
import { Button } from '@/components/ui/Button';
import { getCosmetic, type CosmeticType } from '@/lib/cosmetics/catalog';
import { haptics } from '@/lib/haptics';
import styles from './reward-takeover.module.css';

// Full-screen "you unlocked something" celebration. Mounted imperatively where
// a milestone fires (e.g. the tutorial's first-section completion). Reuses the
// streak-takeover conventions: portal, haptics, no gradients, reduced-motion.

const COSMETIC_TYPE_LABEL: Record<CosmeticType, { label: string; icon: string }> = {
  title: { label: 'New title', icon: 'emoji_events' },
  nameFont: { label: 'New name font', icon: 'text_fields' },
  nameColor: { label: 'New name colour', icon: 'palette' },
  frame: { label: 'New avatar frame', icon: 'crop_square' },
  background: { label: 'New background', icon: 'wallpaper' },
};

const CONFETTI_COLORS = ['#ae89ff', '#ffde59', '#2FA37A', '#fd6f85', '#5B79E6'];
const CONFETTI = Array.from({ length: 18 }, (_, i) => {
  const angle = (i / 18) * Math.PI * 2;
  const dist = 130 + ((i * 53) % 90);
  return {
    dx: Math.round(Math.cos(angle) * dist),
    dy: Math.round(Math.sin(angle) * dist),
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delay: (i % 6) * 18,
    rot: (i * 47) % 360,
    size: 8 + ((i * 7) % 8),
  };
});

export function RewardTakeover({
  title,
  subtitle,
  cosmeticSlug,
  features,
  mascotPose = 'graduation',
  confetti = true,
  buttonLabel = 'Continue',
  onDismiss,
}: {
  title: string;
  subtitle?: string;
  cosmeticSlug?: string | null;
  /** Optional small icon-row (e.g. feature highlights) shown above the button. */
  features?: { icon: string; label: string }[];
  /** Mascot pose override; defaults to the celebratory graduation pose. */
  mascotPose?: MascotPose;
  /** Set false for informational (non-reward) takeovers — skips the confetti burst. */
  confetti?: boolean;
  buttonLabel?: string;
  onDismiss: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    // Portal mount gate — render only after the client has mounted.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    haptics.success();
    const t1 = setTimeout(() => setShown(true), 30);
    const t2 = setTimeout(() => haptics.impact('heavy'), 260);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') onDismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  const cosmetic = cosmeticSlug ? getCosmetic(cosmeticSlug) : null;
  const typeInfo = cosmetic ? COSMETIC_TYPE_LABEL[cosmetic.type] : null;

  if (!mounted) return null;

  return createPortal(
    <div className={styles.stage} role="dialog" aria-modal="true" aria-label={title}>
      {confetti && (
      <div className={styles.confettiLayer} aria-hidden>
        {CONFETTI.map((c, i) => (
          <span
            key={i}
            className={shown ? styles.confettiGo : styles.confetti}
            style={
              {
                '--dx': `${c.dx}px`,
                '--dy': `${c.dy}px`,
                '--rot': `${c.rot}deg`,
                '--delay': `${c.delay}ms`,
                width: c.size,
                height: c.size,
                background: c.color,
              } as CSSProperties
            }
          />
        ))}
      </div>
      )}

      <div className={`${styles.content} ${shown ? styles.contentIn : ''}`}>
        <Mascot pose={mascotPose} size="xl" idle="float" priority />
        <h2 className={styles.title}>{title}</h2>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}

        {features && features.length > 0 && (
          <div className={styles.features}>
            {features.map((f) => (
              <span key={f.label} className={styles.feature}>
                <span
                  className={`material-symbols-outlined ${styles.featureIcon}`}
                  aria-hidden
                  style={{ fontSize: 20 }}
                >
                  {f.icon}
                </span>
                {f.label}
              </span>
            ))}
          </div>
        )}

        {cosmetic && typeInfo && (
          <div className={styles.chip}>
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 20 }}>
              {typeInfo.icon}
            </span>
            <span className={styles.chipType}>{typeInfo.label}</span>
            <span className={styles.chipLabel}>{cosmetic.label}</span>
          </div>
        )}

        <Button variant="primary" size="md" shape="pill" onClick={onDismiss}>
          {buttonLabel}
        </Button>
      </div>
    </div>,
    document.body,
  );
}

export default RewardTakeover;
